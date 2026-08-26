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



