package handler

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"
	"YggdrasilSkinServer/internal/util"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminHandler 处理管理员/operator API（/api/v1/admin/*）。
type AdminHandler struct {
	profileSvc  *service.ProfileService
	librarySvc  *service.TextureLibraryService
	textureSvc  *service.TextureService
	settingsSvc *service.SettingService
	mailSvc     *service.MailService
	authSvc     *service.AuthService
}

// NewAdminHandler 创建 AdminHandler。
func NewAdminHandler(profileSvc *service.ProfileService, librarySvc *service.TextureLibraryService, textureSvc *service.TextureService, settingsSvc *service.SettingService, mailSvc *service.MailService, authSvc *service.AuthService) *AdminHandler {
	return &AdminHandler{profileSvc: profileSvc, librarySvc: librarySvc, textureSvc: textureSvc, settingsSvc: settingsSvc, mailSvc: mailSvc, authSvc: authSvc}
}

// EmailTest POST /api/v1/admin/settings/email-test —— 发送测试邮件（超级管理员）
func (h *AdminHandler) EmailTest(c *gin.Context) {
	var req struct {
		To string `json:"to"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.To) == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	body := "这是一封来自 YSS 皮肤站的测试邮件。收到即表示 SMTP 配置正确。"
	if err := h.mailSvc.Send(strings.TrimSpace(req.To), "YSS 皮肤站 · SMTP 测试邮件", body); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// GetSettings GET /api/v1/admin/settings （超级管理员）
func (h *AdminHandler) GetSettings(c *gin.Context) {
	settings, err := h.settingsSvc.GetAll()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"settings": settings}))
}

// UpdateSettings PUT /api/v1/admin/settings （超级管理员）
func (h *AdminHandler) UpdateSettings(c *gin.Context) {
	var req struct {
		Settings map[string]string `json:"settings"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	if err := h.settingsSvc.SetAll(req.Settings); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	actor, _ := middleware.CurrentUser(c)
	service.WriteAudit(database.DB, actor.ID, "settings.update", "settings", "site", "super admin updated site settings")
	settings, err := h.settingsSvc.GetAll()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"settings": settings}))
}

// ListProfiles GET /api/v1/admin/minecraft-profiles
func (h *AdminHandler) ListProfiles(c *gin.Context) {
	limit, offset := pagination(c)
	var profiles []model.Profile
	var total int64
	q := database.DB.Model(&model.Profile{}).Preload("SkinTexture").Preload("CapeTexture")
	if name := c.Query("name"); name != "" {
		q = q.Where("name LIKE ?", "%"+name+"%")
	}
	if err := q.Count(&total).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&profiles).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profiles": profiles, "total": total}))
}

// GetProfile GET /api/v1/admin/minecraft-profiles/{uuid}
func (h *AdminHandler) GetProfile(c *gin.Context) {
	profile, err := h.profileSvc.GetByUUID(c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// ListUserProfiles GET /api/v1/admin/users/{user_id}/minecraft-profiles
func (h *AdminHandler) ListUserProfiles(c *gin.Context) {
	userID, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid user id")
		return
	}
	profiles, err := h.profileSvc.ListByUser(uint(userID))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profiles": profiles}))
}

// ProfileTextures GET /api/v1/admin/minecraft-profiles/{uuid}/textures
func (h *AdminHandler) ProfileTextures(c *gin.Context) {
	profile, err := h.profileSvc.GetByUUID(c.Param("uuid"))
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

// UnbindTexture DELETE /api/v1/admin/minecraft-profiles/{uuid}/textures/{skin|cape}
func (h *AdminHandler) UnbindTexture(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	profile, err := h.profileSvc.GetByUUID(c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	texType := strings.ToLower(c.Param("type"))
	if err := h.profileSvc.UnbindTexture(profile, texType); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, err.Error())
		return
	}
	service.WriteAudit(database.DB, actor.ID, "admin.profile.unbind_"+texType, "profile", profile.UUID, "admin unbind "+texType)
	c.JSON(http.StatusOK, envelope.OK(gin.H{"profile": profile}))
}

// DeleteTextureFile DELETE /api/v1/admin/minecraft-textures/{hash}
// 仅当该 hash 不再被任何档案/材质库/材质记录引用时才允许删除。
func (h *AdminHandler) DeleteTextureFile(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	hash := strings.ToLower(c.Param("hash"))
	if len(hash) != 64 || !util.IsHex(hash) {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid hash")
		return
	}

	// 引用保护：同 hash 的材质记录、档案绑定、材质库条目任一存在即拒绝
	var textureIDs []uint
	if err := database.DB.Model(&model.Texture{}).Where("hash = ?", hash).Pluck("id", &textureIDs).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	if len(textureIDs) > 0 {
		var profileRefs, libraryRefs int64
		if err := database.DB.Model(&model.Profile{}).
			Where("skin_texture_id IN ? OR cape_texture_id IN ?", textureIDs, textureIDs).
			Count(&profileRefs).Error; err != nil {
			writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
			return
		}
		if err := database.DB.Model(&model.TextureLibraryItem{}).
			Where("texture_id IN ?", textureIDs).Count(&libraryRefs).Error; err != nil {
			writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
			return
		}
		if profileRefs > 0 || libraryRefs > 0 {
			writeEnvelopeError(c, envelope.CodeConflict, "texture is still referenced by profiles or library items")
			return
		}
	}

	path := filepath.Join(h.textureSvc.Cfg().Storage.TextureDir, hash+".png")

	// 事务内删除全部同 hash 记录，成功后再删除物理文件
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		return tx.Where("hash = ?", hash).Delete(&model.Texture{}).Error
	}); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	if _, err := os.Stat(path); err == nil {
		if err := os.Remove(path); err != nil {
			writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
			return
		}
	}

	service.WriteAudit(database.DB, actor.ID, "admin.texture.delete", "texture", hash, "admin deleted texture file")
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// RenameProfile PUT /api/v1/admin/minecraft-profiles/{uuid}/name
func (h *AdminHandler) RenameProfile(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	profile, err := h.profileSvc.GetByUUID(c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	profile, err = h.profileSvc.Rename(profile, req.Name, actor.ID)
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

// DeleteProfile DELETE /api/v1/admin/minecraft-profiles/{uuid}
func (h *AdminHandler) DeleteProfile(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	profile, err := h.profileSvc.GetByUUID(c.Param("uuid"))
	if err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "profile not found")
		return
	}
	if err := h.profileSvc.Delete(profile, actor.ID); err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// LibraryTextures GET /api/v1/admin/texture-library/textures
func (h *AdminHandler) LibraryTextures(c *gin.Context) {
	limit, offset := pagination(c)
	status := c.Query("status")
	texType := c.Query("type")
	items, total, err := h.librarySvc.ListTextures(status, texType, c.Query("tag"), "", limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	libraryHandler := NewTextureLibraryHandler(h.librarySvc, h.textureSvc)
	c.JSON(http.StatusOK, envelope.OK(gin.H{"items": libraryHandler.itemViews(items), "total": total}))
}

// SetLibraryStatus POST /api/v1/admin/texture-library/textures/{texture_id}/approve|reject|unpublish
func (h *AdminHandler) SetLibraryStatus(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
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
	if err := h.librarySvc.SetStatus(uint(id), status, actor.ID); err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// Reports GET /api/v1/admin/texture-library/reports
func (h *AdminHandler) Reports(c *gin.Context) {
	limit, offset := pagination(c)
	reports, total, err := h.librarySvc.ListReports(c.Query("status"), limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"reports": reports, "total": total}))
}

// HandleReport POST /api/v1/admin/texture-library/reports/{report_id}/accept|reject
func (h *AdminHandler) HandleReport(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("report_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid report id")
		return
	}
	var accept bool
	switch c.Param("action") {
	case "accept":
		accept = true
	case "reject":
		accept = false
	default:
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid action")
		return
	}
	if err := h.librarySvc.HandleReport(uint(id), accept, actor.ID); err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// AuditLogs GET /api/v1/admin/audit-logs
func (h *AdminHandler) AuditLogs(c *gin.Context) {
	limit, offset := pagination(c)
	logs, err := service.ListAudit(database.DB, limit, offset)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"logs": logs}))
}

// ListUsers GET /api/v1/admin/users —— 用户列表（管理员）
func (h *AdminHandler) ListUsers(c *gin.Context) {
	limit, offset := pagination(c)
	q := database.DB.Model(&model.User{})
	if kw := c.Query("keyword"); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("username LIKE ? OR email LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	var users []model.User
	if err := q.Order("id ASC").Limit(limit).Offset(offset).Find(&users).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"users": users, "total": total}))
}

// SetUserPermissions PUT /api/v1/admin/users/:id/permissions
func (h *AdminHandler) SetUserPermissions(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid user id")
		return
	}
	if id == 1 {
		writeEnvelopeError(c, envelope.CodeForbidden, "cannot modify super admin")
		return
	}
	var req struct {
		Permissions string `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Permissions) == "" {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	perms := strings.Split(req.Permissions, ",")
	known := map[string]bool{
		"user":                   true,
		model.PermAdmin:          true,
		model.PermUserManage:     true,
		model.PermTextureLibrary: true,
	}
	for _, p := range perms {
		if !known[strings.TrimSpace(p)] {
			writeEnvelopeError(c, envelope.CodeBadRequest, "unknown permission scope: "+strings.TrimSpace(p))
			return
		}
	}
	// 防止 user_manage operator 提权：仅完整管理员可授予 admin
	if actor.ID != 1 && !actor.HasPermission(model.PermAdmin) {
		for _, p := range perms {
			if strings.TrimSpace(p) == model.PermAdmin {
				writeEnvelopeError(c, envelope.CodeForbidden, "only full admin can grant admin permission")
				return
			}
		}
	}
	var user model.User
	if err := database.DB.First(&user, id).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "user not found")
		return
	}
	user.Permissions = strings.TrimSpace(req.Permissions)
	if err := database.DB.Save(&user).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	service.WriteAudit(database.DB, actor.ID, "admin.user.permissions", "user", strconv.FormatUint(uint64(user.ID), 10), "set permissions to "+user.Permissions)
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// UpdateUser PUT /api/v1/admin/users/:user_id —— 编辑用户基础信息（管理员）
func (h *AdminHandler) UpdateUser(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid user id")
		return
	}
	var req struct {
		Username    string `json:"username"`
		Email       string `json:"email"`
		NewPassword string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid request body")
		return
	}
	// operator（user_manage）不能修改管理员账号
	if actor.ID != 1 && !actor.HasPermission(model.PermAdmin) {
		var target model.User
		if err := database.DB.First(&target, id).Error; err != nil {
			writeEnvelopeError(c, envelope.CodeNotFound, "user not found")
			return
		}
		if target.ID == 1 || target.HasPermission(model.PermAdmin) {
			writeEnvelopeError(c, envelope.CodeForbidden, "operator cannot manage admin users")
			return
		}
	}
	user, err := h.authSvc.AdminUpdateUser(uint(id), req.Username, req.Email, req.NewPassword)
	if err != nil {
		code := envelope.CodeBadRequest
		if errors.Is(err, service.ErrUserNotFound) {
			code = envelope.CodeNotFound
		} else if errors.Is(err, service.ErrUserExists) || errors.Is(err, service.ErrEmailExists) {
			code = envelope.CodeConflict
		}
		writeEnvelopeError(c, code, err.Error())
		return
	}
	audit := "admin updated user profile"
	if req.NewPassword != "" {
		audit = "admin updated user profile and reset password"
	}
	service.WriteAudit(database.DB, actor.ID, "admin.user.update", "user", strconv.FormatUint(id, 10), audit)
	c.JSON(http.StatusOK, envelope.OK(gin.H{"user": user}))
}

// DeleteUser DELETE /api/v1/admin/users/:id —— 删除用户及其关联数据
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid user id")
		return
	}
	if id == 1 {
		writeEnvelopeError(c, envelope.CodeForbidden, "cannot delete super admin")
		return
	}
	if uint64(actor.ID) == id {
		writeEnvelopeError(c, envelope.CodeForbidden, "cannot delete yourself")
		return
	}
	var user model.User
	if err := database.DB.First(&user, id).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "user not found")
		return
	}
	// operator（user_manage）不能删除管理员账号
	if actor.ID != 1 && !actor.HasPermission(model.PermAdmin) && (user.ID == 1 || user.HasPermission(model.PermAdmin)) {
		writeEnvelopeError(c, envelope.CodeForbidden, "operator cannot manage admin users")
		return
	}

	// 事务内级联清理全部关联实体
	var textureHashes, ysmFiles []string
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		var textures []model.Texture
		if err := tx.Where("user_id = ?", user.ID).Find(&textures).Error; err != nil {
			return err
		}
		for _, t := range textures {
			textureHashes = append(textureHashes, t.Hash)
		}
		var models []model.YsmModel
		if err := tx.Where("user_id = ?", user.ID).Find(&models).Error; err != nil {
			return err
		}
		for _, m := range models {
			ysmFiles = append(ysmFiles, m.Path)
		}

		if err := tx.Where("user_id = ?", user.ID).Delete(&model.Token{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&model.Session{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&model.LoginRecord{}).Error; err != nil {
			return err
		}
		if err := tx.Where("author_id = ?", user.ID).Delete(&model.TextureLibraryItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("reporter_id = ?", user.ID).Delete(&model.TextureReport{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&model.Profile{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&model.Texture{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&model.YsmModel{}).Error; err != nil {
			return err
		}
		return tx.Delete(&user).Error
	})
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}

	// 清理不再被任何记录引用的物理文件（hash 可能被多用户共享）
	for _, hash := range textureHashes {
		var count int64
		database.DB.Model(&model.Texture{}).Where("hash = ?", hash).Count(&count)
		var libCount int64
		database.DB.Model(&model.TextureLibraryItem{}).
			Joins("JOIN textures ON textures.id = texture_library_items.texture_id").
			Where("textures.hash = ?", hash).Count(&libCount)
		if count == 0 && libCount == 0 {
			path := filepath.Join(h.textureSvc.Cfg().Storage.TextureDir, hash+".png")
			if _, err := os.Stat(path); err == nil {
				os.Remove(path)
			}
		}
	}
	for _, path := range ysmFiles {
		if _, err := os.Stat(path); err == nil {
			os.Remove(path)
		}
	}

	service.WriteAudit(database.DB, actor.ID, "admin.user.delete", "user", strconv.FormatUint(uint64(user.ID), 10), "deleted user "+user.Username)
	c.JSON(http.StatusOK, envelope.OK(nil))
}

// ListTextures GET /api/v1/admin/textures —— 全部材质（管理员）
func (h *AdminHandler) ListTextures(c *gin.Context) {
	limit, offset := pagination(c)
	q := database.DB.Model(&model.Texture{})
	var total int64
	if err := q.Count(&total).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	var textures []model.Texture
	if err := q.Order("id DESC").Limit(limit).Offset(offset).Find(&textures).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	views := make([]gin.H, 0, len(textures))
	for i := range textures {
		t := &textures[i]
		views = append(views, gin.H{
			"id":          t.ID,
			"user_id":     t.UserID,
			"type":        t.Type,
			"model":       t.Model,
			"hash":        t.Hash,
			"name":        t.Name,
			"description": t.Description,
			"width":       t.Width,
			"height":      t.Height,
			"url":         h.textureSvc.URL(t),
			"created_at":  t.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"textures": views, "total": total}))
}

// DeleteTextureByID DELETE /api/v1/admin/textures/:id —— 删除材质记录（无引用时顺带删文件）
func (h *AdminHandler) DeleteTextureByID(c *gin.Context) {
	actor, _ := middleware.CurrentUser(c)
	id, err := strconv.ParseUint(c.Param("texture_id"), 10, 64)
	if err != nil {
		writeEnvelopeError(c, envelope.CodeBadRequest, "invalid texture id")
		return
	}
	var texture model.Texture
	if err := database.DB.First(&texture, id).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeNotFound, "texture not found")
		return
	}
	hash := texture.Hash
	if err := database.DB.Delete(&texture).Error; err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, err.Error())
		return
	}
	// 无其他记录引用该 hash 时删除文件
	var count int64
	database.DB.Model(&model.Texture{}).Where("hash = ?", hash).Count(&count)
	if count == 0 {
		path := filepath.Join(h.textureSvc.Cfg().Storage.TextureDir, hash+".png")
		if _, err := os.Stat(path); err == nil {
			os.Remove(path)
		}
	}
	service.WriteAudit(database.DB, actor.ID, "admin.texture.delete", "texture", strconv.FormatUint(id, 10), "deleted texture "+hash)
	c.JSON(http.StatusOK, envelope.OK(nil))
}
