package handler

import (
	"net/http"
	"strconv"

	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// TextureLibraryHandler 处理公共材质库 API（/api/v1/texture-library/*）。
type TextureLibraryHandler struct {
	librarySvc *service.TextureLibraryService
	textureSvc *service.TextureService
}

// NewTextureLibraryHandler 创建 TextureLibraryHandler。
func NewTextureLibraryHandler(librarySvc *service.TextureLibraryService, textureSvc *service.TextureService) *TextureLibraryHandler {
	return &TextureLibraryHandler{librarySvc: librarySvc, textureSvc: textureSvc}
}

// Tags GET /api/v1/texture-library/tags
func (h *TextureLibraryHandler) Tags(c *gin.Context) {
	tags, err := h.librarySvc.ListTags()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"tags": tags}))
}

// List GET /api/v1/texture-library/textures
func (h *TextureLibraryHandler) List(c *gin.Context) {
	limit, offset := pagination(c)
	items, total, err := h.librarySvc.ListTextures(c.Query("status"), c.Query("tag"), c.Query("keyword"), limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"items": h.itemViews(items), "total": total}))
}

// Get GET /api/v1/texture-library/textures/{texture_id}
func (h *TextureLibraryHandler) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
		return
	}
	item, err := h.librarySvc.GetTexture(uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "texture not found")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"item": h.itemView(item)}))
}

// Copy POST /api/v1/texture-library/textures/{texture_id}/copy
func (h *TextureLibraryHandler) Copy(c *gin.Context) {
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
	texture, err := h.librarySvc.CopyToWardrobe(user.ID, uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"texture": texture}))
}

// Report POST /api/v1/texture-library/textures/{texture_id}/reports
func (h *TextureLibraryHandler) Report(c *gin.Context) {
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
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if err := h.librarySvc.Report(user.ID, uint(id), req.Reason); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// itemViews 批量转换条目视图。
func (h *TextureLibraryHandler) itemViews(items []model.TextureLibraryItem) []gin.H {
	views := make([]gin.H, 0, len(items))
	for i := range items {
		views = append(views, h.itemView(&items[i]))
	}
	return views
}

// itemView 转换单个条目视图（含纹理 URL）。
func (h *TextureLibraryHandler) itemView(item *model.TextureLibraryItem) gin.H {
	view := gin.H{
		"id":         item.ID,
		"title":      item.Title,
		"status":     item.Status,
		"author":     item.AuthorID,
		"created_at": item.CreatedAt,
	}
	tags := make([]string, 0, len(item.Tags))
	for _, t := range item.Tags {
		tags = append(tags, t.Name)
	}
	view["tags"] = tags
	if item.Texture != nil {
		view["texture"] = gin.H{
			"id":     item.Texture.ID,
			"type":   item.Texture.Type,
			"model":  item.Texture.Model,
			"hash":   item.Texture.Hash,
			"width":  item.Texture.Width,
			"height": item.Texture.Height,
			"url":    h.textureSvc.URL(item.Texture),
		}
	}
	return view
}

// pagination 解析 limit/offset 查询参数。
func pagination(c *gin.Context) (limit, offset int) {
	limit, _ = strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 {
		limit = 20
	} else if limit > 100 {
		limit = 100
	}
	offset, _ = strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}
	return
}
