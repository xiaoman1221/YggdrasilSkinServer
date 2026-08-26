package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"
	"YggdrasilSkinServer/internal/util"

	"github.com/gin-gonic/gin"
)

// AuthHandler 处理站点账号 API（/api/v1/auth/*）。
type AuthHandler struct {
	authSvc     *service.AuthService
	textureSvc  *service.TextureService
	mailSvc     *service.MailService
	oauthSvc    *service.OauthGoService
	settingsSvc *service.SettingService
	captchaSvc  *service.CaptchaService
	passkeySvc  *service.PasskeyService
}

// NewAuthHandler 创建 AuthHandler。
func NewAuthHandler(authSvc *service.AuthService, textureSvc *service.TextureService, mailSvc *service.MailService, oauthSvc *service.OauthGoService, settingsSvc *service.SettingService, captchaSvc *service.CaptchaService, passkeySvc *service.PasskeyService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc, textureSvc: textureSvc, mailSvc: mailSvc, oauthSvc: oauthSvc, settingsSvc: settingsSvc, captchaSvc: captchaSvc, passkeySvc: passkeySvc}
}

type credentialsRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	CaptchaID   string `json:"captchaId"`
	CaptchaCode string `json:"captchaCode"`
}

type loginRequest struct {
	Account     string `json:"account"` // 邮箱或用户名
	Password    string `json:"password"`
	CaptchaID   string `json:"captchaId"`
	CaptchaCode string `json:"captchaCode"`
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
	// 策略为 always 时注册需要图形验证码
	if h.captchaSvc.Policy() == service.CaptchaAlways && !h.captchaSvc.Verify(req.CaptchaID, req.CaptchaCode) {
		writeEnvelopeErrorDetails(c, envelope.CodeValidation, "图形验证码错误或已过期，请重试", gin.H{"captcha": true})
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
	failKey := "login:" + c.ClientIP() + ":" + strings.ToLower(strings.TrimSpace(req.Account))

	// 验证码策略：始终需要，或连续失败达到阈值后需要
	if h.captchaSvc.RequiredFor(failKey, "login") && !h.captchaSvc.Verify(req.CaptchaID, req.CaptchaCode) {
		writeEnvelopeErrorDetails(c, envelope.CodeValidation, "图形验证码错误或已过期，请重试", gin.H{"captcha": true})
		return
	}

	user, session, err := h.authSvc.Login(req.Account, req.Password, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		h.captchaSvc.RecordFailure(failKey)
		code := envelope.CodeUnauthorized
		if !errors.Is(err, service.ErrInvalidCredentials) {
			code = envelope.CodeInternalError
		}
		var details any
		if h.captchaSvc.RequiredFor(failKey, "login") {
			details = gin.H{"captcha": true}
		}
		writeEnvelopeErrorDetails(c, code, err.Error(), details)
		return
	}
	h.captchaSvc.ResetFailure(failKey)

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

// sessionView 是会话列表的视图（隐藏 refreshToken）。
type sessionView struct {
	model.Session
	Current bool `json:"current"`
}

// ListSessions GET /api/v1/auth/sessions —— 当前用户的全部有效登录会话。
// 客户端可通过 X-Refresh-Token 请求头标记当前设备。
func (h *AuthHandler) ListSessions(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	sessions, err := h.authSvc.ListSessions(user.ID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	current := c.GetHeader("X-Refresh-Token")
	views := make([]sessionView, 0, len(sessions))
	for _, s := range sessions {
		views = append(views, sessionView{Session: s, Current: current != "" && s.RefreshToken == current})
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"sessions": views}))
}

// RevokeSession DELETE /api/v1/auth/sessions/:id —— 下线指定会话（仅限本人）。
func (h *AuthHandler) RevokeSession(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid session id")
		return
	}
	if err := h.authSvc.RevokeSession(uint(id), user.ID); err != nil {
		if errors.Is(err, service.ErrSessionNotFound) {
			writeEnvelopeError(c, envelope.CodeNotFound, "session not found")
			return
		}
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// RevokeOtherSessions DELETE /api/v1/auth/sessions —— 下线当前用户的其他全部会话。
func (h *AuthHandler) RevokeOtherSessions(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if err := h.authSvc.RevokeOtherSessions(user.ID, req.RefreshToken); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// writeEnvelopeError 以统一 envelope 输出错误响应。
func writeEnvelopeError(c *gin.Context, code int, message string) {
	c.JSON(envelope.HTTPStatus(code), envelope.Err(code, message))
}

// writeEnvelopeErrorDetails 以统一 envelope 输出带详情字段的错误响应。
func writeEnvelopeErrorDetails(c *gin.Context, code int, message string, details any) {
	c.JSON(envelope.HTTPStatus(code), envelope.Response{
		Error: &envelope.APIError{Code: code, Message: message, Details: details},
	})
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

// UploadAvatar POST /api/v1/auth/avatar/upload —— 直接上传头像图片（PNG，最大 1MB）
func (h *AuthHandler) UploadAvatar(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "missing file")
		return
	}
	f, err := file.Open()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 2<<20))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	avatarURL, err := h.authSvc.UploadAvatar(user.ID, data)
	if err != nil {
		code := envelope.CodeBadRequest
		if !errors.Is(err, util.ErrInvalidImage) && !errors.Is(err, util.ErrImageTooLarge) {
			code = envelope.CodeInternalError
		}
		writeEnvelopeError(c, code, err.Error())
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

// PasskeyBeginRegistration POST /api/v1/auth/passkey/register/begin —— 开始注册通行密钥
func (h *AuthHandler) PasskeyBeginRegistration(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	if h.passkeySvc == nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "WebAuthn 未配置，请先设置站点地址")
		return
	}
	options, sessionID, err := h.passkeySvc.BeginRegistration(user)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"sessionId": sessionID, "options": options}))
}

// PasskeyFinishRegistration POST /api/v1/auth/passkey/register/finish —— 校验并保存注册响应
func (h *AuthHandler) PasskeyFinishRegistration(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	if h.passkeySvc == nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "WebAuthn 未配置，请先设置站点地址")
		return
	}
	var req struct {
		SessionID string          `json:"sessionId"`
		Response  json.RawMessage `json:"response"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SessionID == "" || len(req.Response) == 0 {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	credential, err := h.passkeySvc.FinishRegistration(user, req.SessionID, req.Response)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"credentialId": string(credential.ID)}))
}

// PasskeyBeginLogin POST /api/v1/auth/passkey/login/begin —— 开始通行密钥登录
func (h *AuthHandler) PasskeyBeginLogin(c *gin.Context) {
	var req struct {
		Account string `json:"account"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if h.passkeySvc == nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "WebAuthn 未配置，请先设置站点地址")
		return
	}
	options, sessionID, err := h.passkeySvc.BeginLogin(req.Account)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrInvalidCredentials) {
			code = envelope.CodeNotFound
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"sessionId": sessionID, "options": options}))
}

// PasskeyFinishLogin POST /api/v1/auth/passkey/login/finish —— 校验断言并签发会话
func (h *AuthHandler) PasskeyFinishLogin(c *gin.Context) {
	if h.passkeySvc == nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "WebAuthn 未配置，请先设置站点地址")
		return
	}
	var req struct {
		SessionID string          `json:"sessionId"`
		Response  json.RawMessage `json:"response"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SessionID == "" || len(req.Response) == 0 {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	user, err := h.passkeySvc.FinishLogin(req.SessionID, req.Response)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	session, err := h.authSvc.CreateSessionForUser(user.ID, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
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

// PasskeyCredentials GET /api/v1/auth/passkey/credentials —— 当前用户的通行密钥列表
func (h *AuthHandler) PasskeyCredentials(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	if h.passkeySvc == nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "WebAuthn 未配置，请先设置站点地址")
		return
	}
	credentials, err := h.passkeySvc.ListCredentials(user.ID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"credentials": credentials}))
}

// PasskeyRemove DELETE /api/v1/auth/passkey/credentials/:id —— 删除指定通行密钥
func (h *AuthHandler) PasskeyRemove(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	if h.passkeySvc == nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "WebAuthn 未配置，请先设置站点地址")
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid credential id")
		return
	}
	if err := h.passkeySvc.RemoveCredential(user.ID, uint(id)); err != nil {
		if errors.Is(err, service.ErrPasskeyNotFound) {
			writeEnvelopeError(c, envelope.CodeNotFound, "passkey credential not found")
			return
		}
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// OAuthProviders GET /api/v1/auth/oauth/providers —— 可用第三方登录渠道
func (h *AuthHandler) OAuthProviders(c *gin.Context) {
	providers, err := h.oauthSvc.ListProviders()
	if err != nil {
		// 平台不可达时返回空列表，登录页据此隐藏第三方入口
		c.JSON(http.StatusOK, envelope.OK(gin.H{"enabled": false, "providers": []any{}}))
		return
	}
	// allowed 标记管理端是否勾选该渠道；前端据此决定是否展示
	for _, p := range providers {
		name, _ := p["name"].(string)
		p["allowed"] = h.oauthSvc.ProviderEnabled(name)
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"enabled": h.oauthSvc.Enabled(), "providers": providers}))
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
	if !h.oauthSvc.ProviderEnabled(oauthType) {
		writeEnvelopeError(c, envelope.CodeForbidden, "该登录渠道未启用")
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
	user, _, err := h.authSvc.FindOrCreateOAuthUser(info.Type, info.OpenID, info.Nickname, info.Email, info.Avatar, h.oauthSvc.AutoCreate())
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

// OAuthBindAuthorize GET /api/v1/auth/oauth/bind-authorize?type=gitee —— 登录用户发起第三方绑定
// 绑定凭证放在回调路径（OauthGo 按域名白名单放行，且回调会在 redirect_uri 后直接拼 ?type=..&code=..，
// 因此不能往 redirect_uri 加 query 参数，改用 /oauth/callback/bind/:token 路径）。
func (h *AuthHandler) OAuthBindAuthorize(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	oauthType := c.Query("type")
	if oauthType == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "missing type")
		return
	}
	if !h.oauthSvc.Enabled() {
		writeEnvelopeError(c, envelope.CodeBadRequest, "第三方登录未启用")
		return
	}
	if !h.oauthSvc.ProviderEnabled(oauthType) {
		writeEnvelopeError(c, envelope.CodeForbidden, "该登录渠道未启用")
		return
	}
	token, err := h.oauthSvc.CreateBindIntent(user.ID, oauthType)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	siteURL := strings.TrimRight(h.settingsSvc.Get("site_url", h.authSvc.Cfg().Storage.BaseURL), "/")
	redirectURI := siteURL + "/api/v1/auth/oauth/callback/bind/" + token
	authURL, err := h.oauthSvc.GetAuthURL(oauthType, redirectURI)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"url": authURL}))
}

// OAuthBindCallback GET /api/v1/auth/oauth/callback/bind/:token —— 绑定流程授权回调
// 绑定成功后重定向回前端 /oauth/callback?result=success&action=bind。
func (h *AuthHandler) OAuthBindCallback(c *gin.Context) {
	token := c.Param("token")
	oauthType := c.Query("type")
	code := c.Query("code")
	siteURL := strings.TrimRight(h.settingsSvc.Get("site_url", h.authSvc.Cfg().Storage.BaseURL), "/")
	fail := func(msg string) {
		c.Redirect(http.StatusFound, siteURL+"/oauth/callback?result=fail&message="+url.QueryEscape(msg))
	}
	userID, expectedType, ok := h.oauthSvc.ConsumeBindIntent(token)
	if !ok || oauthType == "" || oauthType != expectedType {
		fail("绑定链接无效或已过期，请重新发起绑定")
		return
	}
	if !h.oauthSvc.Enabled() || code == "" {
		fail("第三方登录未启用或回调参数缺失")
		return
	}
	info, err := h.oauthSvc.GetUserInfo(oauthType, code)
	if err != nil {
		fail(err.Error())
		return
	}
	if _, err := h.authSvc.BindOAuthUser(userID, info.Type, info.OpenID, info.Nickname, info.Email, info.Avatar); err != nil {
		fail(err.Error())
		return
	}
	c.Redirect(http.StatusFound, siteURL+"/oauth/callback?result=success&action=bind")
}

// OAuthUnbind POST /api/v1/auth/oauth/unbind —— 解绑当前用户的第三方账号
func (h *AuthHandler) OAuthUnbind(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	updated, err := h.authSvc.UnbindOAuthUser(user.ID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": updated}))
}
