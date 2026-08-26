package handler

import (
	"net/http"

	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// SiteHandler 处理公开站点信息（/api/v1/site/*）。
type SiteHandler struct {
	settingsSvc *service.SettingService
	mojangSvc   *service.MojangService
}

// NewSiteHandler 创建 SiteHandler。
func NewSiteHandler(settingsSvc *service.SettingService, mojangSvc *service.MojangService) *SiteHandler {
	return &SiteHandler{settingsSvc: settingsSvc, mojangSvc: mojangSvc}
}

// Info GET /api/v1/site/info
func (h *SiteHandler) Info(c *gin.Context) {
	c.JSON(http.StatusOK, envelope.OK(gin.H{
		"site_name":         h.settingsSvc.Get(model.SettingSiteName, "YSS 皮肤站"),
		"site_announcement": h.settingsSvc.Get(model.SettingSiteAnnouncement, ""),
		"allow_register":    h.settingsSvc.GetBool(model.SettingAllowRegister, true),
		"allow_upload":      h.settingsSvc.GetBool(model.SettingAllowUpload, true),
		"mojang_enabled":    h.mojangSvc != nil && h.mojangSvc.Enabled(),
	}))
}

