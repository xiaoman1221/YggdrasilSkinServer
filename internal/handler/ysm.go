package handler

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"
	"YggdrasilSkinServer/internal/util"

	"github.com/gin-gonic/gin"
)

// YsmHandler 处理 YSM（Yes Steve Model）模型 API（/api/v1/wardrobe/ysm、档案绑定、管理员管理）。
type YsmHandler struct {
	ysmSvc     *service.YsmService
	profileSvc *service.ProfileService
	cfg        *config.Config
}

// NewYsmHandler 创建 YsmHandler。
func NewYsmHandler(ysmSvc *service.YsmService, profileSvc *service.ProfileService, cfg *config.Config) *YsmHandler {
	return &YsmHandler{ysmSvc: ysmSvc, profileSvc: profileSvc, cfg: cfg}
}

// ysmView 返回模型视图（含下载 URL）。
func ysmView(m *model.YsmModel, svc *service.YsmService) gin.H {
	view := gin.H{
		"id":              m.ID,
		"name":            m.Name,
		"format":          m.Format,
		"hash":            m.Hash,
		"size":            m.Size,
		"description":     m.Description,
		"usage_agreement": m.UsageAgreement,
		"purchase_url":    m.PurchaseURL,
		"price_info":      m.PriceInfo,
		"is_free":         service.IsYsmFree(m.PriceInfo, m.PurchaseURL),
		"url":             svc.URL(m),
		"preview_url":     svc.PreviewURL(m),
		"created_at":      m.CreatedAt,
	}
	if m.LibraryItem != nil {
		view["library_item"] = gin.H{
			"id":     m.LibraryItem.ID,
			"status": m.LibraryItem.Status,
			"title":  m.LibraryItem.Title,
		}
	}
	return view
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

// ysmFileNameRe 仅允许内容寻址文件名：64 位 hex + .ysm/.zip/.png。
var ysmFileNameRe = regexp.MustCompile(`^[0-9a-f]{64}\.(ysm|zip|png)$`)

// ServeFile GET /ysm/:file —— 模型文件与预览图的下载入口。
//
// 免费模型与预览图对所有人公开；付费模型仅允许作者本人、超级管理员或管理员下载
// （购买流程走作者提供的外部链接，站点侧不开放公开下载）。
func (h *YsmHandler) ServeFile(c *gin.Context) {
	name := filepath.Base(c.Param("file"))
	if !ysmFileNameRe.MatchString(name) {
		c.Status(http.StatusNotFound)
		return
	}
	ext := strings.TrimPrefix(filepath.Ext(name), ".")
	hash := strings.TrimSuffix(name, "."+ext)
	path := filepath.Join(h.ysmSvc.YsmDir(), name)

	// 预览图公开
	if ext == "png" {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.File(path)
		return
	}

	ysm, err := h.ysmSvc.FindByHash(hash)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	// 免费模型（或历史遗留、无登记记录的文件）公开下载
	if ysm == nil || service.IsYsmFree(ysm.PriceInfo, ysm.PurchaseURL) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.File(path)
		return
	}

	// 付费模型：仅作者本人 / 超级管理员 / 管理员
	user := optionalUser(c, h.cfg)
	if user == nil || (user.ID != 1 && !user.HasPermission("admin") && !h.ysmSvc.UserOwnsHash(hash, user.ID)) {
		c.Header("Cache-Control", "no-store")
		c.Header("Content-Type", "text/plain; charset=utf-8")
		msg := "该模型为付费模型，购买后才能下载"
		if strings.TrimSpace(ysm.PurchaseURL) != "" {
			msg += "\n购买链接：" + ysm.PurchaseURL
		}
		c.String(http.StatusForbidden, msg)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.File(path)
}

// optionalUser 尝试从 Authorization 头解析当前用户；未携带或令牌无效时返回 nil。
func optionalUser(c *gin.Context, cfg *config.Config) *model.User {
	header := c.GetHeader("Authorization")
	if header == "" || !strings.HasPrefix(header, "Bearer ") {
		return nil
	}
	claims, err := util.ParseToken(cfg.JWT.Secret, strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return nil
	}
	var user model.User
	if err := database.DB.First(&user, claims.UserID).Error; err != nil {
		return nil
	}
	return &user
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
			"is_free":         service.IsYsmFree(m.PriceInfo, m.PurchaseURL),
			"url":             h.ysmSvc.URL(m),
			"preview_url":     h.ysmSvc.PreviewURL(m),
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

/* ================= 公共皮肤库（YSM 模型） ================= */

// ysmLibraryItemView 返回公共皮肤库 YSM 条目视图。
func (h *YsmHandler) ysmLibraryItemView(item *model.YsmLibraryItem) gin.H {
	tags := make([]string, 0, len(item.Tags))
	for _, t := range item.Tags {
		tags = append(tags, t.Name)
	}
	view := gin.H{
		"id":              item.ID,
		"title":           item.Title,
		"status":          item.Status,
		"author":          item.AuthorID,
		"usage_agreement": item.UsageAgreement,
		"price_info":      item.PriceInfo,
		"purchase_url":    item.PurchaseURL,
		"is_free":         item.PriceInfo == service.YsmPriceFree,
		"tags":            tags,
		"created_at":      item.CreatedAt,
	}
	if item.Model != nil {
		view["model"] = ysmView(item.Model, h.ysmSvc)
	}
	return view
}

// SubmitLibrary POST /api/v1/wardrobe/ysm/{model_id}/library-submission —— 提交模型到公共皮肤库
func (h *YsmHandler) SubmitLibrary(c *gin.Context) {
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
		Title          string   `json:"title"`
		UsageAgreement string   `json:"usage_agreement"`
		PriceInfo      string   `json:"price_info"`
		PurchaseURL    string   `json:"purchase_url"`
		Tags           []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	item, err := h.ysmSvc.SubmitToLibrary(user.ID, uint(id), req.Title, req.UsageAgreement, req.PriceInfo, req.PurchaseURL, req.Tags)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrModelAlreadySubmitted) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"item": h.ysmLibraryItemView(item)}))
}

// RemoveSubmission DELETE /api/v1/wardrobe/ysm/{model_id}/library-submission —— 撤回入库申请
func (h *YsmHandler) RemoveSubmission(c *gin.Context) {
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
	if err := h.ysmSvc.RemoveLibrarySubmission(user.ID, uint(id)); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// LibraryTags GET /api/v1/ysm-library/tags —— 公共皮肤库标签（皮肤与 YSM 共用）
func (h *YsmHandler) LibraryTags(c *gin.Context) {
	tags, err := h.ysmSvc.ListTags()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"tags": tags}))
}

// LibraryList GET /api/v1/ysm-library/models —— 公共皮肤库 YSM 列表
func (h *YsmHandler) LibraryList(c *gin.Context) {
	limit, offset := pagination(c)
	// 公开列表仅展示已审核通过的内容，不暴露 pending/rejected 等状态
	items, total, err := h.ysmSvc.ListLibrary(model.LibraryStatusApproved, c.Query("tag"), c.Query("keyword"), limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	views := make([]gin.H, 0, len(items))
	for i := range items {
		views = append(views, h.ysmLibraryItemView(&items[i]))
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"items": views, "total": total}))
}

// LibraryGet GET /api/v1/ysm-library/models/{item_id}
func (h *YsmHandler) LibraryGet(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("item_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid item id")
		return
	}
	item, err := h.ysmSvc.GetLibraryItem(uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "model not found")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"item": h.ysmLibraryItemView(item)}))
}

// LibraryCopy POST /api/v1/ysm-library/models/{item_id}/copy —— 复制到我的仓库
func (h *YsmHandler) LibraryCopy(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseUint(c.Param("item_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid item id")
		return
	}
	ysm, err := h.ysmSvc.CopyLibraryItemToUser(user.ID, uint(id))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"model": ysmView(ysm, h.ysmSvc)}))
}

// AdminLibraryList GET /api/v1/admin/ysm-library/models —— 公共皮肤库 YSM 审核列表
func (h *YsmHandler) AdminLibraryList(c *gin.Context) {
	limit, offset := pagination(c)
	items, total, err := h.ysmSvc.ListLibrary(c.Query("status"), c.Query("tag"), c.Query("keyword"), limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	views := make([]gin.H, 0, len(items))
	for i := range items {
		views = append(views, h.ysmLibraryItemView(&items[i]))
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"items": views, "total": total}))
}

// AdminLibraryStatus POST /api/v1/admin/ysm-library/models/{item_id}/{action}
func (h *YsmHandler) AdminLibraryStatus(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("item_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid item id")
		return
	}
	var status string
	switch c.Param("action") {
	case "approve":
		status = model.LibraryStatusApproved
	case "reject":
		status = model.LibraryStatusRejected
	case "unpublish":
		status = model.LibraryStatusUnpublished
	default:
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid action")
		return
	}
	if err := h.ysmSvc.SetLibraryStatus(uint(id), status, actor.ID); err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}
