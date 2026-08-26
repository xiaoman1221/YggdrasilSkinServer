package service

import (
	"strconv"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"

	"gorm.io/gorm"
)

// SettingService 负责站点基础设置的读写。
type SettingService struct {
	db *gorm.DB
}

// NewSettingService 创建 SettingService。
func NewSettingService(db *gorm.DB) *SettingService {
	return &SettingService{db: db}
}

// Seed 写入缺失的设置（幂等）。非启动必需项以环境变量配置为初始值，
// 之后可在管理端「站点设置」中修改并覆盖。
func (s *SettingService) Seed(cfg *config.Config) error {
	values := model.DefaultSettings()
	// 用环境配置作为首次初始值
	values[model.SettingSiteURL] = cfg.Storage.BaseURL
	values[model.SettingUploadMaxWidth] = strconv.Itoa(cfg.Upload.MaxWidth)
	values[model.SettingUploadMaxHeight] = strconv.Itoa(cfg.Upload.MaxHeight)
	values[model.SettingServerName] = cfg.Yggdrasil.ServerName
	values[model.SettingImplName] = cfg.Yggdrasil.ImplementationName
	values[model.SettingImplVersion] = cfg.Yggdrasil.ImplementationVersion
	values[model.SettingSkinDomains] = strings.Join(cfg.Yggdrasil.SkinDomains, ",")
	values[model.SettingNonEmailLogin] = strconv.FormatBool(cfg.Yggdrasil.EnableNonEmailLogin)
	values[model.SettingJWTHours] = strconv.Itoa(cfg.JWT.ExpireHours)
	values[model.SettingMojangClientID] = cfg.Microsoft.ClientID
	values[model.SettingMojangClientSecret] = cfg.Microsoft.ClientSecret
	values[model.SettingMojangRedirectURI] = cfg.Microsoft.RedirectURI
	for key, value := range values {
		var count int64
		s.db.Model(&model.Setting{}).Where("key = ?", key).Count(&count)
		if count == 0 {
			if err := s.db.Create(&model.Setting{Key: key, Value: value}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// Get 读取字符串设置。
func (s *SettingService) Get(key, def string) string {
	var setting model.Setting
	if err := s.db.Where("key = ?", key).First(&setting).Error; err != nil {
		return def
	}
	if setting.Value == "" {
		return def
	}
	return setting.Value
}

// GetBool 读取布尔设置。
func (s *SettingService) GetBool(key string, def bool) bool {
	v, err := strconv.ParseBool(s.Get(key, ""))
	if err != nil {
		return def
	}
	return v
}

// GetInt 读取整数设置。
func (s *SettingService) GetInt(key string, def int) int {
	v, err := strconv.Atoi(s.Get(key, ""))
	if err != nil {
		return def
	}
	return v
}

// GetAll 返回全部设置。
func (s *SettingService) GetAll() (map[string]string, error) {
	var settings []model.Setting
	if err := s.db.Find(&settings).Error; err != nil {
		return nil, err
	}
	out := model.DefaultSettings()
	for _, st := range settings {
		out[st.Key] = st.Value
	}
	return out, nil
}

// SetAll 批量更新设置（upsert）。
func (s *SettingService) SetAll(values map[string]string) error {
	allowed := model.DefaultSettings()
	for key, value := range values {
		if _, ok := allowed[key]; !ok {
			continue // 忽略未知键
		}
		var setting model.Setting
		if err := s.db.Where("key = ?", key).First(&setting).Error; err != nil {
			if err := s.db.Create(&model.Setting{Key: key, Value: value}).Error; err != nil {
				return err
			}
			continue
		}
		setting.Value = value
		if err := s.db.Save(&setting).Error; err != nil {
			return err
		}
	}
	return nil
}

// TextureURL 基于站点设置中的对外地址生成纹理 URL。
func (s *SettingService) TextureURL(hash, fallbackBase string) string {
	base := strings.TrimRight(s.Get(model.SettingSiteURL, fallbackBase), "/")
	return base + "/textures/" + hash + ".png"
}

// YsmURL 基于站点设置中的对外地址生成 YSM 模型下载 URL。
func (s *SettingService) YsmURL(hash, format, fallbackBase string) string {
	ext := "ysm"
	if format == "zip" {
		ext = "zip"
	}
	base := strings.TrimRight(s.Get(model.SettingSiteURL, fallbackBase), "/")
	return base + "/ysm/" + hash + "." + ext
}

