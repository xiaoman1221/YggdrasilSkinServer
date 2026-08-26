package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// MojangHandler 处理正版（Microsoft OAuth）认证绑定。
type MojangHandler struct {
	cfg        *config.Config
	mojangSvc  *service.MojangService
	textureSvc *service.TextureService
}

// NewMojangHandler 创建 MojangHandler。
func NewMojangHandler(cfg *config.Config, mojangSvc *service.MojangService, textureSvc *service.TextureService) *MojangHandler {
	return &MojangHandler{cfg: cfg, mojangSvc: mojangSvc, textureSvc: textureSvc}
}

// Authorize GET /api/v1/auth/mojang/authorize —— 返回 Microsoft 授权地址
func (h *MojangHandler) Authorize(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	if !h.mojangSvc.Enabled() {
		writeEnvelopeError(c, envelope.CodeBadRequest, "正版绑定未启用（服务端未配置 Microsoft OAuth）")
		return
	}
	state, err := h.makeState(user.ID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, "failed to create state")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"url": h.mojangSvc.AuthorizeURL(state)}))
}

// Callback GET /api/v1/auth/mojang/callback —— OAuth 回调，成功后绑定并跳转前端结果页
func (h *MojangHandler) Callback(c *gin.Context) {
	fail := func(message string) {
		c.Redirect(http.StatusFound, "/bind-mojang?result=fail&message="+url.QueryEscape(message))
	}

	if e := c.Query("error"); e != "" {
		fail("授权失败或已取消：" + e)
		return
	}
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		fail("缺少授权参数")
		return
	}
	userID, err := h.parseState(state)
	if err != nil {
		fail("state 无效或已过期，请重新发起绑定")
		return
	}

	profile, err := h.mojangSvc.Exchange(code)
	if err != nil {
		fail("正版认证失败：" + err.Error())
		return
	}

	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		fail("用户不存在")
		return
	}

	// 获取正版皮肤并存入 wardrobe
	if profile.SkinURL != "" {
		if data, err := h.mojangSvc.DownloadSkin(profile.SkinURL); err == nil {
			if texture, err := h.textureSvc.Create(user.ID, model.TextureTypeSkin, profile.SkinModel, data, "Minecraft 正版皮肤", ""); err == nil {
				service.WriteAudit(database.DB, user.ID, "mojang.bind_skin", "texture", strconv.FormatUint(uint64(texture.ID), 10),
					"fetched official skin for "+profile.Name)
			}
		}
	}

	// 关联正版 UUID / 名称
	user.MojangUUID = profile.UUID
	user.MojangName = profile.Name
	if err := database.DB.Save(&user).Error; err != nil {
		fail("保存失败")
		return
	}
	service.WriteAudit(database.DB, user.ID, "mojang.bind", "user", strconv.FormatUint(uint64(user.ID), 10),
		"bound official account "+profile.Name+" ("+profile.UUID+")")

	c.Redirect(http.StatusFound, "/bind-mojang?result=success&name="+url.QueryEscape(profile.Name)+"&uuid="+profile.UUID)
}

// makeState 生成带短时有效期的绑定 state（JWT，内含用户 ID）。
func (h *MojangHandler) makeState(userID uint) (string, error) {
	claims := jwt.MapClaims{
		"purpose": "mojang_bind",
		"uid":     userID,
		"iat":     time.Now().Unix(),
		"exp":     time.Now().Add(10 * time.Minute).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.cfg.JWT.Secret))
}

// parseState 校验绑定 state 并返回用户 ID。
func (h *MojangHandler) parseState(state string) (uint, error) {
	token, err := jwt.Parse(state,
		func(*jwt.Token) (any, error) { return []byte(h.cfg.JWT.Secret), nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return 0, errors.New("invalid state")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["purpose"] != "mojang_bind" {
		return 0, errors.New("invalid state purpose")
	}
	uid, ok := claims["uid"].(float64)
	if !ok || uid <= 0 {
		return 0, errors.New("invalid state uid")
	}
	return uint(uid), nil
}

