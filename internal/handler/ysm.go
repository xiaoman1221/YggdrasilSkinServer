package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// YsmHandler 处理 YSM（Yes Steve Model）模型 API（/api/v1/wardrobe/ysm、档案绑定、管理员管理）。
type YsmHandler struct {
	ysmSvc     *service.YsmService
	profileSvc *service.ProfileService
}

// NewYsmHandler 创建 YsmHandler。
func NewYsmHandler(ysmSvc *service.YsmService, profileSvc *service.ProfileService) *YsmHandler {
	return &YsmHandler{ysmSvc: ysmSvc, profileSvc: profileSvc}
}

// ysmView 返回模型视图（含下载 URL）。
func ysmView(m *model.YsmModel, svc *service.YsmService) gin.H {
	return gin.H{
		"id":              m.ID,
		"name":            m.Name,
		"format":          m.Format,
		"hash":            m.Hash,
		"size":            m.Size,
		"description":     m.Description,
		"usage_agreement": m.UsageAgreement,
		"purchase_url":    m.PurchaseURL,
		"price_info":      m.PriceInfo,
		"url":             svc.URL(m),
		"created_at":      m.CreatedAt,
	}
}

// List GET /api/v1/wardrobe/ysm
func (h *YsmHandler) List(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	models, err := h.ysmSvc.ListByUser(user.ID)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	views := make([]gin.H, 0, len(models))
	for i := range models {
		views = append(views, ysmView(&models[i], h.ysmSvc))
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"models": views}))
}

// Upload POST /api/v1/wardrobe/ysm
func (h *YsmHandler) Upload(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "missing 'file' upload")
		return
	}
	maxBytes := int64(h.ysmSvc.MaxSizeBytes())
	if file.Size > maxBytes {
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

	meta := service.YsmMeta{
		UsageAgreement: c.PostForm("usage_agreement"),
		PurchaseURL:    c.PostForm("purchase_url"),
		PriceInfo:      c.PostForm("price_info"),
	}
	ysm, err := h.ysmSvc.Create(user.ID, c.PostForm("name"), c.PostForm("description"), data, meta)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeValidation, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"model": ysmView(ysm, h.ysmSvc)}))
}

// UpdateMeta PUT /api/v1/wardrobe/ysm/{model_id} —— 修改模型基础信息
func (h *YsmHandler) UpdateMeta(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("model_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid model id")
		return
	}
	var req struct {
		Name           string `json:"name"`
		Description    string `json:"description"`
		UsageAgreement string `json:"usage_agreement"`
		PurchaseURL    string `json:"purchase_url"`
		PriceInfo      string `json:"price_info"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	meta := service.YsmMeta{
		UsageAgreement: req.UsageAgreement,
		PurchaseURL:    req.PurchaseURL,
		PriceInfo:      req.PriceInfo,
	}
	if err := h.ysmSvc.UpdateMeta(uint(id), user.ID, req.Name, req.Description, meta); err != nil {
		code := envelope.CodeNotFound
		if !errors.Is(err, service.ErrYsmNotFound) {
			code = envelope.CodeForbidden
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	ysm, err := h.ysmSvc.Get(uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"model": ysmView(ysm, h.ysmSvc)}))
}

// Delete DELETE /api/v1/wardrobe/ysm/{model_id}
func (h *YsmHandler) Delete(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("model_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid model id")
		return
	}
	if err := h.ysmSvc.Delete(uint(id), user.ID); err != nil {
		code := envelope.CodeNotFound
		if !errors.Is(err, service.ErrYsmNotFound) {
			code = envelope.CodeForbidden
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// Bind PUT /api/v1/profiles/minecraft/{uuid}/ysm/{model_id}
func (h *YsmHandler) Bind(c *gin.Context) {
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
	id, err := strconv.ParseUint(c.Param("model_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid model id")
		return
	}
	ysm, err := h.ysmSvc.Get(uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "ysm model not found")
		return
	}
	if err := h.profileSvc.BindYsmModel(profile, ysm); err != nil {
		writeEnvelopeError(c, envelope.CodeForbidden, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// Unbind DELETE /api/v1/profiles/minecraft/{uuid}/ysm
func (h *YsmHandler) Unbind(c *gin.Context) {
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
	if err := h.profileSvc.UnbindYsmModel(profile); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// AdminList GET /api/v1/admin/ysm —— 全部 YSM 模型（管理员）
func (h *YsmHandler) AdminList(c *gin.Context) {
	limit, offset := pagination(c)
	q := database.DB.Model(&model.YsmModel{})
	var total int64
	if err := q.Count(&total).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	var models []model.YsmModel
	if err := q.Order("id DESC").Limit(limit).Offset(offset).Find(&models).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	views := make([]gin.H, 0, len(models))
	for i := range models {
		m := &models[i]
		views = append(views, gin.H{
			"id":              m.ID,
			"user_id":         m.UserID,
			"name":            m.Name,
			"format":          m.Format,
			"hash":            m.Hash,
			"size":            m.Size,
			"description":     m.Description,
			"usage_agreement": m.UsageAgreement,
			"purchase_url":    m.PurchaseURL,
			"price_info":      m.PriceInfo,
			"url":             h.ysmSvc.URL(m),
			"created_at":      m.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"models": views, "total": total}))
}

// AdminDelete DELETE /api/v1/admin/ysm/{model_id}
func (h *YsmHandler) AdminDelete(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("model_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid model id")
		return
	}
	// 管理员删除：不校验归属（admin 拥有全部权限），并记录审计
	if err := h.ysmSvc.AdminDelete(uint(id), actor.ID); err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}
