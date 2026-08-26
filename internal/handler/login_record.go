package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// LoginRecordHandler 处理登录记录查询。
type LoginRecordHandler struct {
	recordSvc *service.LoginRecordService
}

// NewLoginRecordHandler 创建 LoginRecordHandler。
func NewLoginRecordHandler(recordSvc *service.LoginRecordService) *LoginRecordHandler {
	return &LoginRecordHandler{recordSvc: recordSvc}
}

// Mine GET /api/v1/auth/login-records —— 当前用户的登录记录
func (h *LoginRecordHandler) Mine(c *gin.Context) {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeUnauthorized, "unauthorized")
		return
	}
	limit, offset := pagination(c)
	records, total, err := h.recordSvc.ListByUser(user.ID, limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"records": records, "total": total}))
}

// AdminList GET /api/v1/admin/login-records —— 全部登录记录（管理员）
func (h *LoginRecordHandler) AdminList(c *gin.Context) {
	limit, offset := pagination(c)
	records, total, err := h.recordSvc.ListAll(limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"records": records, "total": total}))
}

// AdminDelete DELETE /api/v1/admin/login-records/:record_id —— 删除单条登录记录（管理员）
func (h *LoginRecordHandler) AdminDelete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("record_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid record id")
		return
	}
	if err := h.recordSvc.Delete(uint(id)); err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, err.Error())
		return
	}
	service.WriteAudit(database.DB, 0, "admin.login_record.delete", "login_record", strconv.FormatUint(id, 10), "admin deleted login record")
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// AdminBatchDelete POST /api/v1/admin/login-records/batch-delete —— 批量删除登录记录（管理员）
func (h *LoginRecordHandler) AdminBatchDelete(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	deleted, err := h.recordSvc.DeleteMany(req.IDs)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	service.WriteAudit(database.DB, 0, "admin.login_record.batch_delete", "login_record", strconv.Itoa(len(req.IDs)),
		fmt.Sprintf("admin batch deleted %d login records", deleted))
	c.JSON(http.StatusOK, envelope.OK(gin.H{"deleted": deleted}))
}
