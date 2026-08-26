package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// AuthHandler 处理站点账号 API（/api/v1/auth/*）。
type AuthHandler struct {
	authSvc     *service.AuthService
	textureSvc  *service.TextureService
	mailSvc     *service.MailService
	oauthSvc    *service.OauthGoService
	settingsSvc *service.SettingService
}

// NewAuthHandler 创建 AuthHandler。
func NewAuthHandler(authSvc *service.AuthService, textureSvc *service.TextureService, mailSvc *service.MailService, oauthSvc *service.OauthGoService, settingsSvc *service.SettingService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc, textureSvc: textureSvc, mailSvc: mailSvc, oauthSvc: oauthSvc, settingsSvc: settingsSvc}
}

type credentialsRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginRequest struct {
	Account  string `json:"account"` // 邮箱或用户名
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// Setup 初始化站点（创建首个管理员）。
func (h *AuthHandler) Setup(c *gin.Context) {
	var req credentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}

	user, err := h.authSvc.Setup(req.Username, req.Email, req.Password)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrSetupAlreadyDone) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// Register 注册新用户。
func (h *AuthHandler) Register(c *gin.Context) {
	var req credentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}

	user, err := h.authSvc.Register(req.Email, req.Username, req.Password)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrUserExists) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// Login 用户登录，返回访问令牌与 refresh 令牌。
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}

	user, session, err := h.authSvc.Login(req.Account, req.Password, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		code := envelope.CodeUnauthorized
		if !errors.Is(err, service.ErrInvalidCredentials) {
			code = envelope.CodeInternalError
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}

	accessToken, err := h.authSvc.IssueAccessToken(user)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, "failed to issue token")
		return
	}

	c.JSON(http.StatusOK, envelope.OK(gin.H{
		"accessToken":  accessToken,
		"refreshToken": session.RefreshToken,
		"expiresIn":    int(h.authSvc.Cfg().ExpireDuration().Seconds()),
		"user":         user,
	}))
}

// Refresh 刷新访问令牌。
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}

	user, session, err := h.authSvc.Refresh(req.RefreshToken)
	if err != nil {
		code := envelope.CodeUnauthorized
		if !errors.Is(err, service.ErrInvalidRefresh) && !errors.Is(err, service.ErrUserNotFound) {
			code = envelope.CodeInternalError
		}
		writeEnvelopeError(c, code, "invalid refresh token")
		return
	}

	accessToken, err := h.authSvc.IssueAccessToken(user)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, "failed to issue token")
		return
	}

	c.JSON(http.StatusOK, envelope.OK(gin.H{
		"accessToken":  accessToken,
		"refreshToken": session.RefreshToken,
		"expiresIn":    int(h.authSvc.Cfg().ExpireDuration().Seconds()),
		"user":         user,
	}))
}

// Logout 注销当前会话。
func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	_ = h.authSvc.Logout(req.RefreshToken)
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// Me 返回当前登录用户。
func (h *AuthHandler) Me(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// writeEnvelopeError 以统一 envelope 输出错误响应。
func writeEnvelopeError(c *gin.Context, code int, message string) {
	c.JSON(envelope.HTTPStatus(code), envelope.Err(code, message))
}

// SetAvatar PUT /api/v1/auth/avatar —— 用 wardrobe 材质快捷设为头像
func (h *AuthHandler) SetAvatar(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	var req struct {
		TextureID uint `json:"textureId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.TextureID == 0 {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	texture, err := h.textureSvc.Get(req.TextureID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "texture not found")
		return
	}
	if texture.UserID != user.ID {
		writeEnvelopeError(c, envelope.CodeForbidden, "not allowed to use this texture")
		return
	}
	// 裁切皮肤头部作为头像
	avatarURL, err := h.textureSvc.AvatarHead(texture)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	user.AvatarURL = avatarURL
	if err := database.DB.Save(user).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// ClearAvatar DELETE /api/v1/auth/avatar —— 清除头像
func (h *AuthHandler) ClearAvatar(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	user.AvatarURL = ""
	if err := database.DB.Save(user).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// UpdateProfile PUT /api/v1/auth/profile —— 修改基本信息（用户名/邮箱）
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	updated, err := h.authSvc.UpdateProfile(user.ID, req.Username, req.Email)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrUserExists) || errors.Is(err, service.ErrEmailExists) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": updated}))
}

// ChangePassword PUT /api/v1/auth/password —— 修改密码（需验证原密码）
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	var req struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if err := h.authSvc.ChangePassword(user.ID, req.Current, req.New); err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrWrongPassword) {
			code = envelope.CodeForbidden
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// ForgotPassword POST /api/v1/auth/forgot-password —— 发送密码重置邮件
// 无论邮箱是否存在都返回成功，避免泄露账号信息。
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if !h.mailSvc.Configured() {
		writeEnvelopeError(c, envelope.CodeBadRequest, "站点未配置邮件服务，请联系管理员")
		return
	}
	token, err := h.authSvc.CreatePasswordReset(req.Email)
	if err != nil {
		// 不泄露邮箱是否存在
		c.JSON(http.StatusOK, envelope.OK(nil))
		return
	}
	siteURL := strings.TrimRight(h.settingsSvc.Get("site_url", h.authSvc.Cfg().Storage.BaseURL), "/")
	link := siteURL + "/reset-password?token=" + token
	body := "您（或他人）请求重置 " + siteURL + " 的账号密码。\r\n\r\n" +
		"点击以下链接设置新密码（30 分钟内有效）：\r\n" + link + "\r\n\r\n" +
		"如果不是您本人的操作，请忽略本邮件。"
	if err := h.mailSvc.Send(strings.TrimSpace(req.Email), "密码重置 - "+h.settingsSvc.Get("site_name", "YSS 皮肤站"), body); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, "邮件发送失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// ResetPassword POST /api/v1/auth/reset-password —— 用令牌重置密码
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Token) == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if err := h.authSvc.ResetPassword(req.Token, req.Password); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// OAuthProviders GET /api/v1/auth/oauth/providers —— 可用第三方登录渠道
func (h *AuthHandler) OAuthProviders(c *gin.Context) {
	if !h.oauthSvc.Enabled() {
		c.JSON(http.StatusOK, envelope.OK(gin.H{"enabled": false, "providers": []any{}}))
		return
	}
	providers, err := h.oauthSvc.ListProviders()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"enabled": true, "providers": providers}))
}

// OAuthAuthorize GET /api/v1/auth/oauth/authorize?type=gitee —— 获取授权跳转地址
func (h *AuthHandler) OAuthAuthorize(c *gin.Context) {
	oauthType := c.Query("type")
	if oauthType == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "missing type")
		return
	}
	if !h.oauthSvc.Enabled() {
		writeEnvelopeError(c, envelope.CodeBadRequest, "第三方登录未启用")
		return
	}
	siteURL := strings.TrimRight(h.settingsSvc.Get("site_url", h.authSvc.Cfg().Storage.BaseURL), "/")
	redirectURI := siteURL + "/api/v1/auth/oauth/callback"
	url, err := h.oauthSvc.GetAuthURL(oauthType, redirectURI)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"url": url}))
}

// OAuthCallback GET /api/v1/auth/oauth/callback?type&code —— 授权回调
// 换取用户信息，绑定/创建账号后签发会话，并重定向回前端页面。
func (h *AuthHandler) OAuthCallback(c *gin.Context) {
	oauthType := c.Query("type")
	code := c.Query("code")
	siteURL := strings.TrimRight(h.settingsSvc.Get("site_url", h.authSvc.Cfg().Storage.BaseURL), "/")
	fail := func(msg string) {
		c.Redirect(http.StatusFound, siteURL+"/oauth/callback?result=fail&message="+url.QueryEscape(msg))
	}
	if !h.oauthSvc.Enabled() || oauthType == "" || code == "" {
		fail("第三方登录未启用或回调参数缺失")
		return
	}
	info, err := h.oauthSvc.GetUserInfo(oauthType, code)
	if err != nil {
		fail(err.Error())
		return
	}
	user, err := h.authSvc.FindOrCreateOAuthUser(info.Type, info.OpenID, info.Nickname, info.Email)
	if err != nil {
		fail(err.Error())
		return
	}
	session, err := h.authSvc.CreateSessionForUser(user.ID, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		fail(err.Error())
		return
	}
	accessToken, err := h.authSvc.IssueAccessToken(user)
	if err != nil {
		fail("签发令牌失败")
		return
	}
	// 令牌放 URL fragment（#），不会发往服务器，也不进浏览器历史
	c.Redirect(http.StatusFound, siteURL+"/oauth/callback#access="+accessToken+"&refresh="+session.RefreshToken)
}



