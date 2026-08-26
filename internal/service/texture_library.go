package service

import (
	"errors"
	"strconv"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"

	"gorm.io/gorm"
)

// 公共材质库业务错误。
var (
	ErrLibraryItemNotFound = errors.New("library item not found")
	ErrAlreadySubmitted    = errors.New("texture already submitted")
	ErrReportNotFound      = errors.New("report not found")
)

// TextureLibraryService 负责公共材质库（发布、复制、举报、审核、标签）。
type TextureLibraryService struct {
	db       *gorm.DB
	cfg      *config.Config
	settings *SettingService
}

// NewTextureLibraryService 创建 TextureLibraryService。
func NewTextureLibraryService(db *gorm.DB, cfg *config.Config, settings *SettingService) *TextureLibraryService {
	return &TextureLibraryService{db: db, cfg: cfg, settings: settings}
}

// ListTags 返回全部标签。
func (s *TextureLibraryService) ListTags() ([]model.TextureTag, error) {
	var tags []model.TextureTag
	err := s.db.Order("name ASC").Find(&tags).Error
	return tags, err
}

// ListTextures 分页查询公共材质库条目（默认仅已审核通过的，支持标题关键字过滤）。
func (s *TextureLibraryService) ListTextures(status, tag, keyword string, limit, offset int) ([]model.TextureLibraryItem, int64, error) {
	if status == "" {
		status = model.LibraryStatusApproved
	}
	q := s.db.Model(&model.TextureLibraryItem{}).Preload("Tags").Preload("Texture")
	if tag != "" {
		q = q.Joins("JOIN texture_library_item_tags tlit ON tlit.texture_library_item_id = texture_library_items.id").
			Joins("JOIN texture_tags tt ON tt.id = tlit.texture_tag_id").
			Where("tt.name = ?", tag)
	}
	if keyword != "" {
		q = q.Where("texture_library_items.title LIKE ?", "%"+keyword+"%")
	}
	q = q.Where("texture_library_items.status = ?", status)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []model.TextureLibraryItem
	err := q.Order("texture_library_items.created_at DESC").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

// GetTexture 查询单个公共材质条目。
func (s *TextureLibraryService) GetTexture(itemID uint) (*model.TextureLibraryItem, error) {
	var item model.TextureLibraryItem
	err := s.db.Preload("Tags").Preload("Texture").
		First(&item, itemID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrLibraryItemNotFound
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// Submit 提交 wardrobe 皮肤到公共皮肤库（待审核）。
// 仅允许皮肤；usageAgreement（授权声明/使用协议）必填。
func (s *TextureLibraryService) Submit(userID uint, textureID uint, title, usageAgreement string, tagNames []string) (*model.TextureLibraryItem, error) {
	var texture model.Texture
	if err := s.db.First(&texture, textureID).Error; err != nil {
		return nil, ErrTextureNotFound
	}
	if texture.UserID != userID {
		return nil, errors.New("not allowed to submit this texture")
	}
	if texture.Type != model.TextureTypeSkin {
		return nil, errors.New("公共皮肤库仅支持皮肤，披风无法申请入库")
	}
	usageAgreement = strings.TrimSpace(usageAgreement)
	if usageAgreement == "" {
		return nil, errors.New("请填写授权声明 / 使用协议")
	}

	var count int64
	s.db.Model(&model.TextureLibraryItem{}).Where("texture_id = ?", textureID).Count(&count)
	if count > 0 {
		return nil, ErrAlreadySubmitted
	}

	item := &model.TextureLibraryItem{
		TextureID:      textureID,
		AuthorID:       userID,
		Title:          strings.TrimSpace(title),
		UsageAgreement: truncate(usageAgreement, 512),
		Status:         model.LibraryStatusPending,
	}
	for _, name := range tagNames {
		name = strings.TrimSpace(strings.ToLower(name))
		if name == "" {
			continue
		}
		tag := model.TextureTag{Name: name}
		s.db.Where("name = ?", name).FirstOrCreate(&tag)
		item.Tags = append(item.Tags, tag)
	}
	if err := s.db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

// RemoveSubmission 撤回自己的材质库提交。
func (s *TextureLibraryService) RemoveSubmission(userID uint, textureID uint) error {
	var item model.TextureLibraryItem
	err := s.db.Where("texture_id = ? AND author_id = ?", textureID, userID).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	return s.db.Delete(&item).Error
}

// CopyToWardrobe 把公共材质复制到自己的 wardrobe（文件复用，新建材质记录）。
func (s *TextureLibraryService) CopyToWardrobe(userID uint, itemID uint) (*model.Texture, error) {
	item, err := s.GetTexture(itemID)
	if err != nil {
		return nil, err
	}
	if item.Status != model.LibraryStatusApproved {
		return nil, errors.New("texture is not available")
	}
	texture := item.Texture
	if texture == nil {
		return nil, ErrTextureNotFound
	}

	copied := &model.Texture{
		UserID: userID,
		Type:   texture.Type,
		Model:  texture.Model,
		Hash:   texture.Hash,
		Path:   texture.Path,
		Width:  texture.Width,
		Height: texture.Height,
	}
	// 已有同内容材质时直接复用，避免重复记录
	var existing model.Texture
	err = s.db.Where("user_id = ? AND type = ? AND hash = ?", userID, texture.Type, texture.Hash).First(&existing).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err := s.db.Create(copied).Error; err != nil {
		return nil, err
	}
	return copied, nil
}

// DistributeApproved 把审核通过的皮肤分发到所有其他用户的个人仓库（按站点设置开关）。
func (s *TextureLibraryService) DistributeApproved(itemID uint) error {
	if !s.settings.GetBool(model.SettingLibraryAutoDistribute, false) {
		return nil
	}
	item, err := s.GetTexture(itemID)
	if err != nil {
		return err
	}
	if item.Status != model.LibraryStatusApproved || item.Texture == nil {
		return nil
	}
	var userIDs []uint
	if err := s.db.Model(&model.User{}).Where("id <> ?", item.AuthorID).Pluck("id", &userIDs).Error; err != nil {
		return err
	}
	for _, uid := range userIDs {
		if _, err := s.CopyToWardrobe(uid, item.ID); err != nil {
			continue // 单个用户失败不阻断整体分发
		}
	}
	return nil
}

// Report 举报公共材质条目。
func (s *TextureLibraryService) Report(userID uint, itemID uint, reason string) error {
	if _, err := s.GetTexture(itemID); err != nil {
		return err
	}
	report := &model.TextureReport{
		ItemID:     itemID,
		ReporterID: userID,
		Reason:     strings.TrimSpace(reason),
		Status:     model.ReportStatusPending,
	}
	return s.db.Create(report).Error
}

// ListReports 分页查询举报（管理员/审核员）。
func (s *TextureLibraryService) ListReports(status string, limit, offset int) ([]model.TextureReport, int64, error) {
	q := s.db.Model(&model.TextureReport{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var reports []model.TextureReport
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&reports).Error
	return reports, total, err
}

// SetStatus 修改材质库条目状态（审核/下架）。
func (s *TextureLibraryService) SetStatus(itemID uint, status string, actorID uint) error {
	var item model.TextureLibraryItem
	if err := s.db.First(&item, itemID).Error; err != nil {
		return ErrLibraryItemNotFound
	}
	old := item.Status
	item.Status = status
	if err := s.db.Save(&item).Error; err != nil {
		return err
	}
	if status == model.LibraryStatusApproved {
		_ = s.DistributeApproved(itemID)
	}
	WriteAudit(s.db, actorID, "texture_library."+status, "texture_library_item", idToStr(itemID),
		"status changed from "+old+" to "+status)
	return nil
}

// HandleReport 处理举报（接受则同时下架条目，事务保证一致性）。
func (s *TextureLibraryService) HandleReport(reportID uint, accept bool, actorID uint) error {
	var report model.TextureReport
	if err := s.db.First(&report, reportID).Error; err != nil {
		return ErrReportNotFound
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if accept {
			report.Status = model.ReportStatusAccepted
			if err := tx.Save(&report).Error; err != nil {
				return err
			}
			var item model.TextureLibraryItem
			if err := tx.First(&item, report.ItemID).Error; err != nil {
				return err
			}
			old := item.Status
			item.Status = model.LibraryStatusUnpublished
			if err := tx.Save(&item).Error; err != nil {
				return err
			}
			WriteAudit(tx, actorID, "texture_library."+item.Status, "texture_library_item", idToStr(item.ID),
				"unpublished via accepted report, previous status "+old)
			return nil
		}
		report.Status = model.ReportStatusRejected
		return tx.Save(&report).Error
	})
}

func idToStr(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}
