package handler

import (
	"io"
	"net/http"
	"strings"

	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// YggdrasilHandler 处理 Yggdrasil/authlib-injector 协议端点。
// 注意：协议端点返回 Yggdrasil 兼容响应，不套项目 envelope。
type YggdrasilHandler struct {
	svc *service.YggdrasilService
}

// NewYggdrasilHandler 创建 YggdrasilHandler。
func NewYggdrasilHandler(svc *service.YggdrasilService) *YggdrasilHandler {
	return &YggdrasilHandler{svc: svc}
}

// Metadata GET /api/yggdrasil
func (h *YggdrasilHandler) Metadata(c *gin.Context) {
	c.JSON(http.StatusOK, h.svc.Metadata())
}

// Authenticate POST /api/yggdrasil/authserver/authenticate
func (h *YggdrasilHandler) Authenticate(c *gin.Context) {
	var req service.AuthenticateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.Authenticate(&req, c.ClientIP(), c.GetHeader("User-Agent"))
	c.JSON(status, resp)
}

// Refresh POST /api/yggdrasil/authserver/refresh
func (h *YggdrasilHandler) Refresh(c *gin.Context) {
	var req service.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.Refresh(&req)
	c.JSON(status, resp)
}

// Validate POST /api/yggdrasil/authserver/validate
func (h *YggdrasilHandler) Validate(c *gin.Context) {
	var req service.ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.Validate(&req)
	if status == http.StatusNoContent {
		c.Status(status)
		return
	}
	c.JSON(status, resp)
}

// Signout POST /api/yggdrasil/authserver/signout
func (h *YggdrasilHandler) Signout(c *gin.Context) {
	var req service.SignoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.Signout(&req)
	if status == http.StatusNoContent {
		c.Status(status)
		return
	}
	c.JSON(status, resp)
}

// Invalidate POST /api/yggdrasil/authserver/invalidate
func (h *YggdrasilHandler) Invalidate(c *gin.Context) {
	var req service.InvalidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.Invalidate(&req)
	if status == http.StatusNoContent {
		c.Status(status)
		return
	}
	c.JSON(status, resp)
}

// Join POST /api/yggdrasil/sessionserver/session/minecraft/join
func (h *YggdrasilHandler) Join(c *gin.Context) {
	var req service.JoinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.Join(&req, c.ClientIP(), c.GetHeader("User-Agent"))
	if status == http.StatusNoContent {
		c.Status(status)
		return
	}
	c.JSON(status, resp)
}

// HasJoined GET /api/yggdrasil/sessionserver/session/minecraft/hasJoined
func (h *YggdrasilHandler) HasJoined(c *gin.Context) {
	username := c.Query("username")
	serverID := c.Query("serverId")
	status, resp := h.svc.HasJoined(username, serverID)
	if status == http.StatusNoContent {
		c.Status(status)
		return
	}
	c.JSON(status, resp)
}

// Profile GET /api/yggdrasil/sessionserver/session/minecraft/profile/{uuid}
func (h *YggdrasilHandler) Profile(c *gin.Context) {
	status, resp := h.svc.SessionProfile(c.Param("uuid"))
	c.JSON(status, resp)
}

// ProfilesMinecraft POST /api/yggdrasil/api/profiles/minecraft
func (h *YggdrasilHandler) ProfilesMinecraft(c *gin.Context) {
	var names []string
	if err := c.ShouldBindJSON(&names); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "invalid request body"})
		return
	}
	status, resp := h.svc.ProfilesByNames(names)
	c.JSON(status, resp)
}

// UserProfile GET /api/yggdrasil/api/user/profile/{uuid}
func (h *YggdrasilHandler) UserProfile(c *gin.Context) {
	status, resp := h.svc.UserProfile(c.Param("uuid"))
	c.JSON(status, resp)
}

// UserNames GET /api/yggdrasil/api/user/profile/{uuid}/names
func (h *YggdrasilHandler) UserNames(c *gin.Context) {
	status, resp := h.svc.UserNames(c.Param("uuid"))
	c.JSON(status, resp)
}

// Keys GET /api/yggdrasil/keys
func (h *YggdrasilHandler) Keys(c *gin.Context) {
	c.JSON(http.StatusOK, h.svc.Keys())
}

// Texture GET /api/yggdrasil/textures/{hash}
func (h *YggdrasilHandler) Texture(c *gin.Context) {
	path, err := h.svc.TexturePathByHash(c.Param("hash"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "IllegalArgumentException", "errorMessage": "Invalid hash."})
		return
	}
	c.File(path)
}

// UploadTexture PUT /api/yggdrasil/api/user/profile/{uuid}/{skin|cape}
// 通过 Authorization: Bearer <accessToken> 认证。
func (h *YggdrasilHandler) UploadTexture(c *gin.Context) {
	accessToken := bearerToken(c.GetHeader("Authorization"))
	if accessToken == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."})
		return
	}
	_, token, err := h.svc.UserByAccessToken(accessToken)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."})
		return
	}

	texType := strings.ToLower(c.Param("type"))
	if texType != model.TextureTypeSkin && texType != model.TextureTypeCape {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "Invalid texture type."})
		return
	}

	// 限制请求体大小，避免超大 body 被整体读入内存
	maxBytes := h.svc.MaxTextureUploadBytes()
	if c.Request.ContentLength > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "File too large."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
	data, err := io.ReadAll(c.Request.Body)
	if err != nil || len(data) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "Empty upload."})
		return
	}

	status, resp := h.svc.UploadTexture(token, c.Param("uuid"), texType, data)
	c.JSON(status, resp)
}

// DeleteTexture DELETE /api/yggdrasil/api/user/profile/{uuid}/{skin|cape}
func (h *YggdrasilHandler) DeleteTexture(c *gin.Context) {
	accessToken := bearerToken(c.GetHeader("Authorization"))
	if accessToken == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."})
		return
	}
	_, token, err := h.svc.UserByAccessToken(accessToken)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."})
		return
	}

	texType := strings.ToLower(c.Param("type"))
	if texType != model.TextureTypeSkin && texType != model.TextureTypeCape {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IllegalArgumentException", "errorMessage": "Invalid texture type."})
		return
	}

	status, resp := h.svc.DeleteTexture(token, c.Param("uuid"), texType)
	if status == http.StatusNoContent {
		c.Status(status)
		return
	}
	c.JSON(status, resp)
}

// bearerToken 从 Authorization 头中提取 Bearer token。
func bearerToken(header string) string {
	if len(header) > 7 && strings.EqualFold(header[:7], "Bearer ") {
		return strings.TrimSpace(header[7:])
	}
	return ""
}

