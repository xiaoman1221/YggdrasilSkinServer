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
	"YggdrasilSkinServer/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// MojangHandler 处理正版（Microsoft OAuth）认证绑定。
type MojangHandler struct {
	cfg        *config.Config
	mojangSvc  *service.MojangService
	textureSvc *service.TextureService
	profileSvc *service.ProfileService
}

// NewMojangHandler 创建 MojangHandler。
func NewMojangHandler(cfg *config.Config, mojangSvc *service.MojangService, textureSvc *service.TextureService, profileSvc *service.ProfileService) *MojangHandler {
	return &MojangHandler{cfg: cfg, mojangSvc: mojangSvc, textureSvc: textureSvc, profileSvc: profileSvc}
}

// Authorize GET /api/v1/auth/mojang/authorize?profileId=<uuid> —— 返回 Microsoft 授权地址
// profileId 指定认证成功后要同步正版皮肤/UUID 的档案，必须是当前用户拥有的档案。
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
	profileID := c.Query("profileId")
	if profileID == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "缺少档案参数，请从档案卡片发起正版认证")
		return
	}
	profile, err := h.profileSvc.GetOwned(user.ID, profileID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "档案不存在或不属于当前用户")
		return
	}
	state, err := h.makeState(user.ID, profile.UUID)
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
	userID, profileUUID, err := h.parseState(state)
	if err != nil {
		fail("state 无效或已过期，请重新发起绑定")
		return
	}

	premium, err := h.mojangSvc.Exchange(code)
	if err != nil {
		fail("正版认证失败：" + err.Error())
		return
	}
	premiumUUID := util.ToHyphenatedUUID(util.NormalizeUUID(premium.UUID))

	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		fail("用户不存在")
		return
	}

	// 目标档案必须属于发起认证的用户
	profile, err := h.profileSvc.GetOwned(user.ID, profileUUID)
	if err != nil {
		fail("档案不存在或不属于当前用户")
		return
	}

	// 同一正版账号不允许被多个用户绑定
	var bound int64
	database.DB.Model(&model.User{}).Where("mojang_uuid = ? AND id <> ?", premiumUUID, user.ID).Count(&bound)
	if bound > 0 {
		fail("该正版账号已绑定其他用户")
		return
	}

	// 获取正版皮肤并存入 wardrobe（同内容去重；失败不阻断 UUID 同步）
	var skinTextureID uint
	if premium.SkinURL != "" {
		if data, err := h.mojangSvc.DownloadSkin(premium.SkinURL); err == nil {
			if texture, err := h.textureSvc.CreateOrReuseSkin(user.ID, premium.SkinModel, data, "Minecraft 正版皮肤", "正版认证自动同步"); err == nil {
				skinTextureID = texture.ID
				service.WriteAudit(database.DB, user.ID, "mojang.bind_skin", "texture", strconv.FormatUint(uint64(texture.ID), 10),
					"fetched official skin for "+premium.Name)
			}
		}
	}

	// 同步正版 UUID（与官方皮肤）到目标档案
	if _, err := h.profileSvc.SyncMojangProfile(profile, premiumUUID, skinTextureID, user.ID); err != nil {
		fail(err.Error())
		return
	}

	// 账号级关联（展示用）
	user.MojangUUID = premiumUUID
	user.MojangName = premium.Name
	if err := database.DB.Save(&user).Error; err != nil {
		fail("保存失败")
		return
	}
	service.WriteAudit(database.DB, user.ID, "mojang.bind", "profile", profile.UUID,
		"bound official account "+premium.Name+" ("+premiumUUID+")")

	c.Redirect(http.StatusFound, "/bind-mojang?result=success&name="+url.QueryEscape(premium.Name)+"&uuid="+profile.UUID+"&profile="+url.QueryEscape(profile.Name))
}

// makeState 生成带短时有效期的绑定 state（JWT，内含用户 ID 与目标档案 UUID）。
func (h *MojangHandler) makeState(userID uint, profileUUID string) (string, error) {
	claims := jwt.MapClaims{
		"purpose":      "mojang_bind",
		"uid":          userID,
		"profile_uuid": profileUUID,
		"iat":          time.Now().Unix(),
		"exp":          time.Now().Add(10 * time.Minute).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.cfg.JWT.Secret))
}

// parseState 校验绑定 state 并返回用户 ID 与目标档案 UUID。
func (h *MojangHandler) parseState(state string) (uint, string, error) {
	token, err := jwt.Parse(state,
		func(*jwt.Token) (any, error) { return []byte(h.cfg.JWT.Secret), nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return 0, "", errors.New("invalid state")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["purpose"] != "mojang_bind" {
		return 0, "", errors.New("invalid state purpose")
	}
	uid, ok := claims["uid"].(float64)
	if !ok || uid <= 0 {
		return 0, "", errors.New("invalid state uid")
	}
	profileUUID, _ := claims["profile_uuid"].(string)
	if profileUUID == "" {
		return 0, "", errors.New("invalid state profile")
	}
	return uint(uid), profileUUID, nil
}
