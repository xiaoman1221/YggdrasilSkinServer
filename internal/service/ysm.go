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
	// zip 格式尝试提取一张预览图（封面/默认材质），.ysm 加密格式无法在服务端解密
	if format == model.YsmFormatZip {
		if preview, ok := extractYsmPreview(data, hashHex, s.cfg.Storage.YsmDir); ok {
			ysm.PreviewPath = preview
		}
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

// ysmPreviewNames 是模型包内常见封面/预览图文件名（不含 .png 后缀，忽略大小写）。
var ysmPreviewNames = map[string]bool{
	"ysm-pack":  true,
	"preview":   true,
	"预览":       true,
	"封面":       true,
	"cover":     true,
	"poster":    true,
	"thumbnail": true,
	"thumb":     true,
}

// ysmPreviewDoc 仅解析提取预览图所需的 ysm.json 字段。
type ysmPreviewDoc struct {
	Properties struct {
		DefaultTexture string `json:"default_texture"`
	} `json:"properties"`
	Files struct {
		Player struct {
			Texture []json.RawMessage `json:"texture"`
		} `json:"player"`
	} `json:"files"`
}

// firstTexturePath 返回 files.player.texture 中第一项对应的贴图路径。
// 兼容两种写法：字符串路径，或 { "uv": "..." } 对象。
func (d *ysmPreviewDoc) firstTexturePath() string {
	for _, raw := range d.Files.Player.Texture {
		var s string
		if json.Unmarshal(raw, &s) == nil && s != "" {
			return s
		}
		var obj struct {
			UV string `json:"uv"`
		}
		if json.Unmarshal(raw, &obj) == nil && obj.UV != "" {
			return obj.UV
		}
	}
	return ""
}

// extractYsmPreview 从 zip 格式模型包中提取一张预览图（PNG），保存到 ysmDir/{hash}.png。
// 候选顺序：
//  1. 包内常见封面图（preview.png / 封面.png / ysm-pack.png 等，任意层级，优先根目录）
//  2. ysm.json 的默认材质（properties.default_texture）
//  3. ysm.json 的第一张贴图（files.player.texture[0]）
//  4. textures/ 目录下的第一张 PNG
//
// .ysm 加密格式无法在服务端解密，返回 ok=false。
func extractYsmPreview(data []byte, hash, ysmDir string) (string, bool) {
	if len(data) < 2 || data[0] != 'P' || data[1] != 'K' {
		return "", false
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", false
	}

	var (
		doc       ysmPreviewDoc
		parsedDoc bool
		rootCover *zip.File
		covers    []*zip.File // 非根目录封面
		textures  []*zip.File // textures/ 下的 PNG
	)
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := filepath.ToSlash(f.Name)
		lower := strings.ToLower(name)
		base := strings.ToLower(filepath.Base(name))
		if strings.HasSuffix(base, ".png") {
			if ysmPreviewNames[strings.TrimSuffix(base, ".png")] {
				if !strings.Contains(lower, "/") {
					rootCover = f
				} else {
					covers = append(covers, f)
				}
			}
			if strings.Contains(lower, "textures/") {
				textures = append(textures, f)
			}
		}
		if base == "ysm.json" && !parsedDoc {
			if raw, err := readZipEntry(f, 4<<20); err == nil {
				if json.Unmarshal(raw, &doc) == nil {
					parsedDoc = true
				}
			}
		}
	}

	save := func(f *zip.File) (string, bool) {
		raw, err := readZipEntry(f, 8<<20)
		if err != nil || !isPngBytes(raw) {
			return "", false
		}
		path := filepath.Join(ysmDir, hash+".png")
		if err := os.MkdirAll(ysmDir, 0o755); err != nil {
			return "", false
		}
		if err := os.WriteFile(path, raw, 0o644); err != nil {
			return "", false
		}
		return path, true
	}

	if rootCover != nil {
		if p, ok := save(rootCover); ok {
			return p, true
		}
	}
	for _, f := range covers {
		if p, ok := save(f); ok {
			return p, true
		}
	}
	// 默认材质：default_texture 通常是“不含路径和后缀.png”的名称，按文件名匹配
	if want := strings.TrimSuffix(strings.ToLower(doc.Properties.DefaultTexture), ".png"); want != "" {
		var best *zip.File
		for _, f := range zr.File {
			if f.FileInfo().IsDir() {
				continue
			}
			name := filepath.ToSlash(f.Name)
			if strings.TrimSuffix(strings.ToLower(filepath.Base(name)), ".png") != want {
				continue
			}
			best = f
			if strings.Contains(strings.ToLower(name), "textures/") {
				break
			}
		}
		if best != nil {
			if p, ok := save(best); ok {
				return p, true
			}
		}
	}
	// 第一张贴图（files.player.texture[0]）
	if want := strings.ToLower(filepath.ToSlash(doc.firstTexturePath())); want != "" {
		for _, f := range zr.File {
			if f.FileInfo().IsDir() {
				continue
			}
			if strings.ToLower(filepath.ToSlash(f.Name)) == want {
				if p, ok := save(f); ok {
					return p, true
				}
				break
			}
		}
	}
	// textures/ 下第一张 PNG
	for _, f := range textures {
		if p, ok := save(f); ok {
			return p, true
		}
	}
	return "", false
}

// readZipEntry 读取 zip 条目内容（限制大小，防止解压炸弹）。
func readZipEntry(f *zip.File, limit int64) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(io.LimitReader(rc, limit))
}

// isPngBytes 校验 PNG 文件头。
func isPngBytes(data []byte) bool {
	return len(data) > 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A})
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
		if ysm.PreviewPath != "" {
			if _, err := os.Stat(ysm.PreviewPath); err == nil {
				os.Remove(ysm.PreviewPath)
			}
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
		if ysm.PreviewPath != "" {
			if _, err := os.Stat(ysm.PreviewPath); err == nil {
				os.Remove(ysm.PreviewPath)
			}
		}
	}
	return nil
}

// URL 返回模型的公开下载 URL。
func (s *YsmService) URL(ysm *model.YsmModel) string {
	base := strings.TrimRight(s.settings.Get(model.SettingSiteURL, s.cfg.Storage.BaseURL), "/")
	return base + "/ysm/" + ysm.Hash + "." + ysm.Format
}

// PreviewURL 返回模型预览图的公开 URL；未提取到预览图时返回空字符串。
func (s *YsmService) PreviewURL(ysm *model.YsmModel) string {
	if ysm.PreviewPath == "" {
		return ""
	}
	base := strings.TrimRight(s.settings.Get(model.SettingSiteURL, s.cfg.Storage.BaseURL), "/")
	return base + "/ysm/" + ysm.Hash + ".png"
}

// YsmDir 返回 YSM 模型文件的存储目录。
func (s *YsmService) YsmDir() string {
	return s.cfg.Storage.YsmDir
}

// FindByHash 按内容 hash 查询模型记录；未找到时返回 (nil, nil)。
func (s *YsmService) FindByHash(hash string) (*model.YsmModel, error) {
	var ysm model.YsmModel
	err := s.db.Where("hash = ?", hash).First(&ysm).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ysm, nil
}

// UserOwnsHash 判断用户是否拥有对应 hash 的模型记录（同一文件可被多人上传）。
func (s *YsmService) UserOwnsHash(hash string, userID uint) bool {
	var count int64
	s.db.Model(&model.YsmModel{}).Where("hash = ? AND user_id = ?", hash, userID).Count(&count)
	return count > 0
}

// IsYsmFree 判断模型是否免费（免费模型允许公开下载）。
// 判定规则：资费说明含“免费 / free / cc0”等宽松标记；或既无资费说明也无购买链接。
func IsYsmFree(priceInfo, purchaseURL string) bool {
	p := strings.ToLower(strings.TrimSpace(priceInfo))
	if p == "" {
		return strings.TrimSpace(purchaseURL) == ""
	}
	for _, kw := range []string{"免费", "free", "cc0"} {
		if strings.Contains(p, kw) {
			return true
		}
	}
	return false
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
