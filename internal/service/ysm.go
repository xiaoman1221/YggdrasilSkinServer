package service

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"

	"gorm.io/gorm"
)

// YSM 模型相关业务错误。
var (
	ErrYsmNotFound = errors.New("ysm model not found")
	ErrYsmInvalid  = errors.New("invalid ysm model file")
)

// YsmMeta 是模型的基础信息（使用协议/购买链接/资费）。
type YsmMeta struct {
	UsageAgreement string
	PurchaseURL    string
	PriceInfo      string
}

// ysmMagic 是 .ysm 加密模型的文件头魔数。
// 注意：存在两种容器——
//   - 紧凑 YSGP：直接以 "YSGP" 开头
//   - BOM v3 容器（YSM 2.0+）：以 UTF-8 BOM (EF BB BF) + "YSGP" 开头
var (
	ysmMagic     = []byte("YSGP")
	ysmBomPrefix = []byte{0xEF, 0xBB, 0xBF}
)

// YsmService 负责 YSM（Yes Steve Model）模型文件的上传、存储与分发。
type YsmService struct {
	db       *gorm.DB
	cfg      *config.Config
	settings *SettingService
}

// NewYsmService 创建 YsmService。
func NewYsmService(db *gorm.DB, cfg *config.Config, settings *SettingService) *YsmService {
	return &YsmService{db: db, cfg: cfg, settings: settings}
}

// Create 校验并保存一份 YSM 模型文件（.ysm 或 .zip）。
// meta 中留空的字段会尝试从 zip 包内的 ysm.json / info.json 自动提取。
func (s *YsmService) Create(userID uint, name, description string, data []byte, meta YsmMeta) (*model.YsmModel, error) {
	if !s.settings.GetBool(model.SettingAllowYsmUpload, true) {
		return nil, errors.New("ysm upload is disabled")
	}
	maxBytes := int64(s.settings.GetInt(model.SettingMaxYsmSizeMB, 16)) * 1024 * 1024
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("file too large (max %d MB)", maxBytes/1024/1024)
	}

	format, err := detectYsmFormat(data)
	if err != nil {
		return nil, err
	}

	hash := sha256.Sum256(data)
	hashHex := hex.EncodeToString(hash[:])
	filename := hashHex + "." + format
	dst := filepath.Join(s.cfg.Storage.YsmDir, filename)
	if _, err := os.Stat(dst); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		if err := os.MkdirAll(s.cfg.Storage.YsmDir, 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			return nil, err
		}
	}

	name = strings.TrimSpace(name)
	if name == "" {
		name = "未命名模型"
	}
	description = strings.TrimSpace(description)

	// 元信息留空时从 zip 内的描述文件自动提取
	if format == model.YsmFormatZip {
		extracted := extractYsmZipInfo(data)
		if meta.UsageAgreement == "" {
			meta.UsageAgreement = extracted.UsageAgreement
		}
		if meta.PurchaseURL == "" {
			meta.PurchaseURL = extracted.PurchaseURL
		}
		if meta.PriceInfo == "" {
			meta.PriceInfo = extracted.PriceInfo
		}
	}

	ysm := &model.YsmModel{
		UserID:         userID,
		Name:           name,
		Format:         format,
		Hash:           hashHex,
		Path:           dst,
		Size:           int64(len(data)),
		Description:    description,
		UsageAgreement: truncate(meta.UsageAgreement, 512),
		PurchaseURL:    truncate(meta.PurchaseURL, 512),
		PriceInfo:      truncate(meta.PriceInfo, 64),
	}
	if err := s.db.Create(ysm).Error; err != nil {
		return nil, err
	}
	return ysm, nil
}

// MaxSizeBytes 返回当前站点设置的 YSM 模型大小上限（字节）。
func (s *YsmService) MaxSizeBytes() int64 {
	return int64(s.settings.GetInt(model.SettingMaxYsmSizeMB, 16)) * 1024 * 1024
}

// UpdateMeta 更新模型基础信息（仅允许本人）。
func (s *YsmService) UpdateMeta(id, ownerID uint, name, description string, meta YsmMeta) error {
	var ysm model.YsmModel
	if err := s.db.First(&ysm, id).Error; err != nil {
		return ErrYsmNotFound
	}
	if ysm.UserID != ownerID {
		return errors.New("not allowed to modify this model")
	}
	if name = strings.TrimSpace(name); name != "" {
		ysm.Name = truncate(name, 128)
	}
	if description = strings.TrimSpace(description); description != "" || name != "" {
		ysm.Description = truncate(description, 512)
	}
	ysm.UsageAgreement = truncate(strings.TrimSpace(meta.UsageAgreement), 512)
	ysm.PurchaseURL = truncate(strings.TrimSpace(meta.PurchaseURL), 512)
	ysm.PriceInfo = truncate(strings.TrimSpace(meta.PriceInfo), 64)
	return s.db.Save(&ysm).Error
}

// extractYsmZipInfo 从 zip 包内的 ysm.json 提取协议、购买链接与资费信息。
// 已知 schema（YSM spec 2）：metadata.license{type,desc}、metadata.link{donate,home,...}。
func extractYsmZipInfo(data []byte) (out YsmMeta) {
	if !bytes.HasPrefix(data, []byte{'P', 'K'}) {
		return
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return
	}
	for _, f := range zr.File {
		base := filepath.Base(strings.ToLower(filepath.ToSlash(f.Name)))
		if base != "ysm.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		raw, err := io.ReadAll(io.LimitReader(rc, 4<<20))
		rc.Close()
		if err != nil {
			continue
		}
		var doc struct {
			Metadata struct {
				License struct {
					Type string `json:"type"`
					Desc string `json:"desc"`
				} `json:"license"`
				Link map[string]string `json:"link"`
				Name string            `json:"name"`
				Tips string            `json:"tips"`
			} `json:"metadata"`
		}
		if json.Unmarshal(raw, &doc) != nil {
			continue
		}
		m := doc.Metadata
		if m.License.Type != "" || m.License.Desc != "" {
			out.UsageAgreement = strings.TrimSpace(m.License.Type + " " + m.License.Desc)
		}
		// 购买/支持链接优先级：donate > shop/buy > home
		for _, key := range []string{"donate", "shop", "buy", "store", "home"} {
			if v := strings.TrimSpace(m.Link[key]); v != "" {
				out.PurchaseURL = v
				break
			}
		}
		// 免费判定：无购买链接且 license 含 free/CC0/MIT 等宽松协议
		if out.PriceInfo == "" {
			lt := strings.ToLower(m.License.Type)
			if out.PurchaseURL == "" || strings.Contains(lt, "free") || strings.Contains(lt, "cc0") {
				out.PriceInfo = "免费"
			} else {
				out.PriceInfo = "付费"
			}
		}
		break
	}
	return
}

// AdminDelete 管理员删除模型：不校验归属，解绑引用并清理文件。
func (s *YsmService) AdminDelete(id, actorID uint) error {
	var ysm model.YsmModel
	if err := s.db.First(&ysm, id).Error; err != nil {
		return ErrYsmNotFound
	}
	// 解绑引用该模型的档案
	s.db.Model(&model.Profile{}).Where("ysm_model_id = ?", ysm.ID).Update("ysm_model_id", nil)
	if err := s.db.Delete(&ysm).Error; err != nil {
		return err
	}
	var count int64
	s.db.Model(&model.YsmModel{}).Where("hash = ?", ysm.Hash).Count(&count)
	if count == 0 {
		if _, err := os.Stat(ysm.Path); err == nil {
			os.Remove(ysm.Path)
		}
	}
	_ = actorID // 审计信息由 handler 写入
	return nil
}

// Get 按 ID 查询模型。
func (s *YsmService) Get(id uint) (*model.YsmModel, error) {
	var ysm model.YsmModel
	if err := s.db.First(&ysm, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrYsmNotFound
		}
		return nil, err
	}
	return &ysm, nil
}

// ListByUser 返回用户全部模型（按创建时间倒序）。
func (s *YsmService) ListByUser(userID uint) ([]model.YsmModel, error) {
	var models []model.YsmModel
	err := s.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&models).Error
	return models, err
}

// Delete 删除模型记录（仅允许本人或管理员）。
func (s *YsmService) Delete(id, ownerID uint) error {
	var ysm model.YsmModel
	if err := s.db.First(&ysm, id).Error; err != nil {
		return ErrYsmNotFound
	}
	if ysm.UserID != ownerID {
		return errors.New("not allowed to delete this model")
	}
	// 解绑引用该模型的档案
	s.db.Model(&model.Profile{}).Where("ysm_model_id = ?", ysm.ID).Update("ysm_model_id", nil)
	if err := s.db.Delete(&ysm).Error; err != nil {
		return err
	}
	// 无其他记录引用该 hash 时删除文件
	var count int64
	s.db.Model(&model.YsmModel{}).Where("hash = ?", ysm.Hash).Count(&count)
	if count == 0 {
		if _, err := os.Stat(ysm.Path); err == nil {
			os.Remove(ysm.Path)
		}
	}
	return nil
}

// URL 返回模型的公开下载 URL。
func (s *YsmService) URL(ysm *model.YsmModel) string {
	base := strings.TrimRight(s.settings.Get(model.SettingSiteURL, s.cfg.Storage.BaseURL), "/")
	return base + "/ysm/" + ysm.Hash + "." + ysm.Format
}

// detectYsmFormat 根据文件内容识别 YSM 模型格式：
//   - "YSGP" 魔数开头 → ysm（紧凑加密模型）
//   - UTF-8 BOM + "YSGP" 开头 → ysm（BOM v3 容器，YSM 2.0+ 导出）
//   - 合法 zip 压缩包（压缩包格式）→ zip
//
// 同时对 zip 做一次轻量校验（可被 archive/zip 打开且包含 .json 模型描述文件）。
func detectYsmFormat(data []byte) (string, error) {
	// 跳过 UTF-8 BOM，兼容 BOM v3 容器
	payload := bytes.TrimPrefix(data, ysmBomPrefix)
	if len(payload) < 4 {
		return "", ErrYsmInvalid
	}
	if bytes.HasPrefix(payload, ysmMagic) {
		return model.YsmFormatYsm, nil
	}
	if len(data) >= 2 && data[0] == 'P' && data[1] == 'K' {
		zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return "", fmt.Errorf("%w: not a valid zip archive", ErrYsmInvalid)
		}
		hasModel := false
		for _, f := range zr.File {
			name := strings.ToLower(f.Name)
			if strings.HasSuffix(name, ".json") || strings.HasSuffix(name, ".yml") {
				hasModel = true
				break
			}
		}
		if !hasModel {
			return "", fmt.Errorf("%w: zip archive contains no model descriptor (json/yml)", ErrYsmInvalid)
		}
		return model.YsmFormatZip, nil
	}
	return "", fmt.Errorf("%w: unsupported file (%s), expected .ysm or .zip", ErrYsmInvalid, sniffFileType(data))
}

// sniffFileType 识别常见文件头，用于在报错时给出可读提示。
func sniffFileType(data []byte) string {
	switch {
	case bytes.HasPrefix(data, []byte{0x89, 'P', 'N', 'G'}):
		return "PNG image"
	case bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}):
		return "JPEG image"
	case bytes.HasPrefix(data, []byte{'G', 'I', 'F'}):
		return "GIF image"
	case bytes.HasPrefix(data, []byte{0x37, 0x7A, 0xBC, 0xAF}):
		return "7z archive"
	case bytes.HasPrefix(data, []byte{0x52, 0x61, 0x72, 0x21}):
		return "RAR archive"
	default:
		return "unknown binary"
	}
}
