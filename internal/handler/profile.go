package handler

import (
	"errors"
	"net/http"
	"strings"

	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// ProfileHandler 处理当前用户的 Minecraft 档案 API（/api/v1/profiles/minecraft/*）。
type ProfileHandler struct {
	profileSvc *service.ProfileService
	textureSvc *service.TextureService
}

// NewProfileHandler 创建 ProfileHandler。
func NewProfileHandler(profileSvc *service.ProfileService, textureSvc *service.TextureService) *ProfileHandler {
	return &ProfileHandler{profileSvc: profileSvc, textureSvc: textureSvc}
}

type createProfileRequest struct {
	Name string `json:"name"`
}

type renameProfileRequest struct {
	Name string `json:"name"`
}

type bindTextureRequest struct {
	TextureID uint `json:"textureId"`
}

// List GET /api/v1/profiles/minecraft
func (h *ProfileHandler) List(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	profiles, err := h.profileSvc.ListByUser(user.ID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profiles": profiles}))
}

// Create POST /api/v1/profiles/minecraft
func (h *ProfileHandler) Create(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	var req createProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	profile, err := h.profileSvc.Create(user.ID, req.Name)
	if err != nil {
		code := envelope.CodeBadRequest
		switch {
		case errors.Is(err, service.ErrProfileNameTaken):
			code = envelope.CodeConflict
		case errors.Is(err, service.ErrInvalidProfileName):
			code = envelope.CodeValidation
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// Textures GET /api/v1/profiles/minecraft/{uuid}/textures
func (h *ProfileHandler) Textures(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	profile, err := h.profileSvc.GetOwned(user.ID, c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{
		"profile": profile,
		"skin":    textureView(profile.SkinTexture, h.textureSvc),
		"cape":    textureView(profile.CapeTexture, h.textureSvc),
	}))
}

// BindTexture PUT /api/v1/profiles/minecraft/{uuid}/textures/{skin|cape}
func (h *ProfileHandler) BindTexture(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	profile, err := h.profileSvc.GetOwned(user.ID, c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}

	texType := strings.ToLower(c.Param("type"))
	if texType != model.TextureTypeSkin && texType != model.TextureTypeCape {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture type")
		return
	}

	var req bindTextureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	texture, err := h.textureSvc.Get(req.TextureID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "texture not found")
		return
	}
	if err := h.profileSvc.BindTexture(profile, texture, texType); err != nil {
		writeEnvelopeError(c, envelope.CodeForbidden, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// UnbindTexture DELETE /api/v1/profiles/minecraft/{uuid}/textures/{skin|cape}
func (h *ProfileHandler) UnbindTexture(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	profile, err := h.profileSvc.GetOwned(user.ID, c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	texType := strings.ToLower(c.Param("type"))
	if err := h.profileSvc.UnbindTexture(profile, texType); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// Rename PUT /api/v1/profiles/minecraft/{uuid}/name
func (h *ProfileHandler) Rename(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	profile, err := h.profileSvc.GetOwned(user.ID, c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	var req renameProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	profile, err = h.profileSvc.Rename(profile, req.Name, user.ID)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrProfileNameTaken) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// Delete DELETE /api/v1/profiles/minecraft/{uuid}
func (h *ProfileHandler) Delete(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	profile, err := h.profileSvc.GetOwned(user.ID, c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	if err := h.profileSvc.Delete(profile, user.ID); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// textureView 返回纹理的视图（含 URL），nil 时返回 nil。
func textureView(t *model.Texture, svc *service.TextureService) gin.H {
	if t == nil {
		return nil
	}
	return gin.H{
		"id":          t.ID,
		"type":        t.Type,
		"model":       t.Model,
		"hash":        t.Hash,
		"name":        t.Name,
		"description": t.Description,
		"width":       t.Width,
		"height":      t.Height,
		"url":         svc.URL(t),
	}
}
