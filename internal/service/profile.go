package service

import (
	"errors"
	"regexp"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"

	"gorm.io/gorm"
)

// namePattern 校验 Minecraft 游戏名称：3-16 位，仅字母数字下划线。
var namePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)

// 档案相关业务错误。
var (
	ErrProfileNotFound    = errors.New("profile not found")
	ErrProfileNameTaken   = errors.New("profile name already exists")
	ErrInvalidProfileName = errors.New("invalid profile name")
	ErrTextureNotOwned    = errors.New("texture does not belong to this user")
	ErrInvalidTextureType = errors.New("invalid texture type")
)

// ProfileService 负责 Minecraft 档案管理（创建/改名/绑定材质/删除）。
type ProfileService struct {
	db  *gorm.DB
	cfg *config.Config
}

// NewProfileService 创建 ProfileService。
func NewProfileService(db *gorm.DB, cfg *config.Config) *ProfileService {
	return &ProfileService{db: db, cfg: cfg}
}

// ListByUser 返回用户全部档案（预加载纹理）。
func (s *ProfileService) ListByUser(userID uint) ([]model.Profile, error) {
	var profiles []model.Profile
	err := s.db.Preload("SkinTexture").Preload("CapeTexture").Preload("YsmModel").
		Where("user_id = ?", userID).Find(&profiles).Error
	return profiles, err
}

// Create 创建新档案。
func (s *ProfileService) Create(userID uint, name string) (*model.Profile, error) {
	name = strings.TrimSpace(name)
	if !namePattern.MatchString(name) {
		return nil, ErrInvalidProfileName
	}
	var count int64
	s.db.Model(&model.Profile{}).Where("name = ?", name).Count(&count)
	if count > 0 {
		return nil, ErrProfileNameTaken
	}

	profile := &model.Profile{
		UUID:   util.NewUUID(),
		Name:   name,
		UserID: userID,
	}
	if err := s.db.Create(profile).Error; err != nil {
		return nil, err
	}
	return profile, nil
}

// GetOwned 查询某用户拥有的档案（预加载纹理）。
func (s *ProfileService) GetOwned(userID uint, uuid string) (*model.Profile, error) {
	normalized := util.NormalizeUUID(uuid)
	if normalized == "" {
		return nil, ErrProfileNotFound
	}
	var profile model.Profile
	err := s.db.Preload("SkinTexture").Preload("CapeTexture").Preload("YsmModel").
		Where("user_id = ? AND uuid IN ?", userID, util.UUIDQueryFormats(normalized)).
		First(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProfileNotFound
	}
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

// GetByUUID 查询任意档案（不校验归属，供管理员使用）。
func (s *ProfileService) GetByUUID(uuid string) (*model.Profile, error) {
	normalized := util.NormalizeUUID(uuid)
	if normalized == "" {
		return nil, ErrProfileNotFound
	}
	var profile model.Profile
	err := s.db.Preload("SkinTexture").Preload("CapeTexture").Preload("YsmModel").
		Where("uuid IN ?", util.UUIDQueryFormats(normalized)).
		First(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProfileNotFound
	}
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

// BindTexture 把 wardrobe 材质绑定到档案。
func (s *ProfileService) BindTexture(profile *model.Profile, texture *model.Texture, texType string) error {
	if texture.UserID != profile.UserID {
		return ErrTextureNotOwned
	}
	switch texType {
	case model.TextureTypeSkin:
		profile.SkinTextureID = &texture.ID
	case model.TextureTypeCape:
		profile.CapeTextureID = &texture.ID
	default:
		return ErrInvalidTextureType
	}
	return s.db.Save(profile).Error
}

// UnbindTexture 解绑档案上的皮肤/披风。
func (s *ProfileService) UnbindTexture(profile *model.Profile, texType string) error {
	switch texType {
	case model.TextureTypeSkin:
		profile.SkinTextureID = nil
	case model.TextureTypeCape:
		profile.CapeTextureID = nil
	default:
		return ErrInvalidTextureType
	}
	return s.db.Save(profile).Error
}

// BindYsmModel 把 YSM 模型绑定到档案。
func (s *ProfileService) BindYsmModel(profile *model.Profile, ysm *model.YsmModel) error {
	if ysm.UserID != profile.UserID {
		return ErrTextureNotOwned
	}
	profile.YsmModelID = &ysm.ID
	return s.db.Save(profile).Error
}

// UnbindYsmModel 解绑档案上的 YSM 模型。
func (s *ProfileService) UnbindYsmModel(profile *model.Profile) error {
	profile.YsmModelID = nil
	return s.db.Save(profile).Error
}

// Rename 受控改名：保留 UUID 与材质绑定，写入审计，并使绑定该档案的 Yggdrasil token 失效。
func (s *ProfileService) Rename(profile *model.Profile, newName string, actorID uint) (*model.Profile, error) {
	newName = strings.TrimSpace(newName)
	if !namePattern.MatchString(newName) {
		return nil, ErrInvalidProfileName
	}
	var count int64
	s.db.Model(&model.Profile{}).Where("name = ? AND id <> ?", newName, profile.ID).Count(&count)
	if count > 0 {
		return nil, ErrProfileNameTaken
	}

	oldName := profile.Name
	profile.Name = newName
	if err := s.db.Save(profile).Error; err != nil {
		return nil, err
	}

	// 使绑定该档案的 Yggdrasil token 失效，让启动器通过 refresh 获取新名称
	s.db.Delete(&model.Token{}, "profile_id = ?", profile.UUID)

	WriteAudit(s.db, actorID, "profile.rename", "profile", profile.UUID,
		"renamed from "+oldName+" to "+newName)
	return profile, nil
}

// Delete 删除档案并使其令牌失效。
func (s *ProfileService) Delete(profile *model.Profile, actorID uint) error {
	if err := s.db.Delete(profile).Error; err != nil {
		return err
	}
	s.db.Delete(&model.Token{}, "profile_id = ?", profile.UUID)
	WriteAudit(s.db, actorID, "profile.delete", "profile", profile.UUID,
		"deleted profile "+profile.Name)
	return nil
}
