package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"

	"gorm.io/gorm"
)

// 纹理相关业务错误。
var (
	ErrTextureNotFound = errors.New("texture not found")
)

// TextureService 负责 wardrobe 材质的存储与绑定。
type TextureService struct {
	db       *gorm.DB
	cfg      *config.Config
	settings *SettingService
}

// Cfg 返回配置引用。
func (s *TextureService) Cfg() *config.Config { return s.cfg }

// NewTextureService 创建 TextureService。
func NewTextureService(db *gorm.DB, cfg *config.Config, settings *SettingService) *TextureService {
	return &TextureService{db: db, cfg: cfg, settings: settings}
}

// Create 校验、重编码并保存一份材质（skin/cape）。
func (s *TextureService) Create(userID uint, texType, skinModel string, data []byte, name, description string) (*model.Texture, error) {
	if !s.settings.GetBool(model.SettingAllowUpload, s.cfg.Upload.Enabled) {
		return nil, errors.New("texture upload is disabled")
	}
	if texType != model.TextureTypeSkin && texType != model.TextureTypeCape {
		return nil, errors.New("invalid texture type")
	}
	maxBytes := int64(s.settings.GetInt(model.SettingMaxUploadSizeMB, 4)) * 1024 * 1024
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("file too large (max %d MB)", maxBytes/1024/1024)
	}

	maxWidth := s.settings.GetInt(model.SettingUploadMaxWidth, s.cfg.Upload.MaxWidth)
	maxHeight := s.settings.GetInt(model.SettingUploadMaxHeight, s.cfg.Upload.MaxHeight)
	processed, width, height, err := util.ProcessPNG(data, maxWidth, maxHeight)
	if err != nil {
		return nil, err
	}
	if !validTextureSize(texType, width, height) {
		if texType == model.TextureTypeCape {
			return nil, fmt.Errorf("披风尺寸无效：%dx%d（应为 64×32）", width, height)
		}
		return nil, fmt.Errorf("皮肤尺寸无效：%dx%d（应为正方形，如 64×64，或旧版 64×32）", width, height)
	}
	hash := util.HashPNG(processed)

	// 相同内容复用已有文件（同 hash 记录指向同一物理文件）
	filename := hash + ".png"
	dst := filepath.Join(s.cfg.Storage.TextureDir, filename)
	if _, err := os.Stat(dst); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		if err := os.MkdirAll(s.cfg.Storage.TextureDir, 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(dst, processed, 0o644); err != nil {
			return nil, err
		}
	}

	resolvedModel := model.TextureModelClassic
	if skinModel == model.TextureModelSlim {
		resolvedModel = model.TextureModelSlim
	}

	texture := &model.Texture{
		UserID:      userID,
		Type:        texType,
		Model:       resolvedModel,
		Hash:        hash,
		Path:        dst,
		Name:        truncate(strings.TrimSpace(name), 128),
		Description: truncate(strings.TrimSpace(description), 512),
		Width:       width,
		Height:      height,
	}
	if err := s.db.Create(texture).Error; err != nil {
		return nil, err
	}
	return texture, nil
}

// CreateOrReuseSkin 处理皮肤数据并按内容 hash 去重：用户已存在同内容皮肤时直接复用，否则创建。
// 用于正版认证自动同步官方皮肤，避免重复认证产生重复材质。
func (s *TextureService) CreateOrReuseSkin(userID uint, skinModel string, data []byte, name, description string) (*model.Texture, error) {
	maxBytes := int64(s.settings.GetInt(model.SettingMaxUploadSizeMB, 4)) * 1024 * 1024
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("file too large (max %d MB)", maxBytes/1024/1024)
	}
	maxWidth := s.settings.GetInt(model.SettingUploadMaxWidth, s.cfg.Upload.MaxWidth)
	maxHeight := s.settings.GetInt(model.SettingUploadMaxHeight, s.cfg.Upload.MaxHeight)
	processed, _, _, err := util.ProcessPNG(data, maxWidth, maxHeight)
	if err != nil {
		return nil, err
	}
	hash := util.HashPNG(processed)

	var existing model.Texture
	err = s.db.Where("user_id = ? AND type = ? AND hash = ?", userID, model.TextureTypeSkin, hash).First(&existing).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	return s.Create(userID, model.TextureTypeSkin, skinModel, data, name, description)
}

// UpdateMeta 更新材质基础信息（仅允许本人）。
func (s *TextureService) UpdateMeta(id, ownerID uint, name, description string) error {
	var texture model.Texture
	if err := s.db.First(&texture, id).Error; err != nil {
		return ErrTextureNotFound
	}
	if texture.UserID != ownerID {
		return errors.New("not allowed to modify this texture")
	}
	texture.Name = truncate(strings.TrimSpace(name), 128)
	texture.Description = truncate(strings.TrimSpace(description), 512)
	return s.db.Save(&texture).Error
}

// validTextureSize 校验材质是否符合 Minecraft / skinview3d 可渲染的尺寸。
// 皮肤：正方形（如 64×64）或 2:1 旧格式（64×32）；披风：2:1（64×32）或 22×17 / 46×22。
// 与前端预览引擎 skinview-utils 的校验规则保持一致，避免非法尺寸导致 3D 预览报错。
func validTextureSize(texType string, width, height int) bool {
	if width <= 0 || height <= 0 {
		return false
	}
	switch texType {
	case model.TextureTypeSkin:
		return width == height || width == 2*height
	case model.TextureTypeCape:
		return width == 2*height || (width == 22 && height == 17) || (width == 46 && height == 22)
	default:
		return false
	}
}

// Get 按 ID 查询材质。
func (s *TextureService) Get(id uint) (*model.Texture, error) {
	var texture model.Texture
	if err := s.db.First(&texture, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTextureNotFound
		}
		return nil, err
	}
	return &texture, nil
}

// Delete 删除材质（仅允许本人或管理员）。
func (s *TextureService) Delete(id, ownerID uint) error {
	var texture model.Texture
	if err := s.db.First(&texture, id).Error; err != nil {
		return ErrTextureNotFound
	}
	if texture.UserID != ownerID {
		return errors.New("not allowed to delete this texture")
	}
	return s.db.Delete(&texture).Error
}

// URL 返回材质的公开访问 URL（基于站点设置中的对外地址）。
func (s *TextureService) URL(texture *model.Texture) string {
	return s.settings.TextureURL(texture.Hash, s.cfg.Storage.BaseURL)
}

// AvatarHead 从皮肤纹理裁切头部（正面 8x8，放大到 64x64），保存并返回头像 URL。
// 仅支持皮肤类型（披风没有头部区域）。
func (s *TextureService) AvatarHead(texture *model.Texture) (string, error) {
	if texture.Type != model.TextureTypeSkin {
		return "", errors.New("cape cannot be used as avatar, please use a skin")
	}
	data, err := os.ReadFile(texture.Path)
	if err != nil {
		return "", err
	}
	head, err := util.CropHead(data, 64)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.cfg.Storage.TextureDir, 0o755); err != nil {
		return "", err
	}
	filename := fmt.Sprintf("avatar_%d_%s.png", texture.UserID, texture.Hash[:16])
	dst := filepath.Join(s.cfg.Storage.TextureDir, filename)
	if err := os.WriteFile(dst, head, 0o644); err != nil {
		return "", err
	}
	return s.settings.TextureURL(filename[:len(filename)-4], s.cfg.Storage.BaseURL), nil
}
