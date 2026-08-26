package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// WardrobeHandler 处理当前用户的 wardrobe 材质 API（/api/v1/wardrobe/*）。
type WardrobeHandler struct {
	textureSvc *service.TextureService
	librarySvc *service.TextureLibraryService
}

// NewWardrobeHandler 创建 WardrobeHandler。
func NewWardrobeHandler(textureSvc *service.TextureService, librarySvc *service.TextureLibraryService) *WardrobeHandler {
	return &WardrobeHandler{textureSvc: textureSvc, librarySvc: librarySvc}
}

type submitLibraryRequest struct {
	Title string   `json:"title"`
	Tags  []string `json:"tags"`
}

// List GET /api/v1/wardrobe/textures
func (h *WardrobeHandler) List(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	var textures []model.Texture
	if err := database.DB.Preload("LibraryItem").Where("user_id = ?", user.ID).
		Order("created_at DESC").Find(&textures).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	views := make([]gin.H, 0, len(textures))
	for _, t := range textures {
		views = append(views, h.textureView(&t))
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"textures": views}))
}

// Upload POST /api/v1/wardrobe/textures/{skin|cape}
func (h *WardrobeHandler) Upload(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	texType := strings.ToLower(c.Param("texture_id"))
	if texType != model.TextureTypeSkin && texType != model.TextureTypeCape {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture type")
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "missing 'file' upload")
		return
	}
	if file.Size > h.textureSvc.Cfg().Upload.MaxSizeBytes {
		writeEnvelopeError(c, envelope.CodeValidation, "file too large")
		return
	}
	f, err := file.Open()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	defer f.Close()

	// io.ReadAll 保证读满；service 层会再做一次大小校验
	data, err := io.ReadAll(f)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}

	texture, err := h.textureSvc.Create(user.ID, texType, c.PostForm("model"), data, c.PostForm("name"), c.PostForm("description"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeValidation, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"texture": h.textureView(texture)}))
}

// Update PUT /api/v1/wardrobe/textures/{texture_id} —— 修改材质基础信息
func (h *WardrobeHandler) Update(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if err := h.textureSvc.UpdateMeta(uint(id), user.ID, req.Name, req.Description); err != nil {
		code := envelope.CodeNotFound
		if !errors.Is(err, service.ErrTextureNotFound) {
			code = envelope.CodeForbidden
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	texture, err := h.textureSvc.Get(uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"texture": h.textureView(texture)}))
}

// Delete DELETE /api/v1/wardrobe/textures/{texture_id}
func (h *WardrobeHandler) Delete(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
		return
	}
	if err := h.textureSvc.Delete(uint(id), user.ID); err != nil {
		code := envelope.CodeNotFound
		if !errors.Is(err, service.ErrTextureNotFound) {
			code = envelope.CodeForbidden
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// SubmitLibrary POST /api/v1/wardrobe/textures/{texture_id}/library-submission
func (h *WardrobeHandler) SubmitLibrary(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
		return
	}
	var req submitLibraryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	item, err := h.librarySvc.Submit(user.ID, uint(id), req.Title, req.Tags)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrAlreadySubmitted) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"item": item}))
}

// RemoveSubmission DELETE /api/v1/wardrobe/textures/{texture_id}/library-submission
func (h *WardrobeHandler) RemoveSubmission(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
		return
	}
	if err := h.librarySvc.RemoveSubmission(user.ID, uint(id)); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// textureView 返回纹理视图（含 URL）。
func (h *WardrobeHandler) textureView(t *model.Texture) gin.H {
	view := gin.H{
		"id":          t.ID,
		"type":        t.Type,
		"model":       t.Model,
		"hash":        t.Hash,
		"name":        t.Name,
		"description": t.Description,
		"width":       t.Width,
		"height":      t.Height,
	}
	if t.LibraryItem != nil {
		view["library_item"] = gin.H{
			"id":     t.LibraryItem.ID,
			"status": t.LibraryItem.Status,
			"title":  t.LibraryItem.Title,
		}
	}
	return view
}

