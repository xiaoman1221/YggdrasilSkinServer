package model

import "time"

// TextureType 定义材质类型。
const (
	TextureTypeSkin = "skin"
	TextureTypeCape = "cape"
)

// TextureModel 定义皮肤模型。
const (
	TextureModelClassic = "classic"
	TextureModelSlim    = "slim"
)

// Texture 是 wardrobe 中的一份材质（皮肤或披风）。
// 上传后服务端会重编码为安全 PNG，并按处理后的内容计算 Hash。
type Texture struct {
	ID     uint `gorm:"primaryKey" json:"id"`
	UserID uint `gorm:"index" json:"user_id"`
	// Type 材质类型：skin / cape
	Type string `gorm:"size:16" json:"type"`
	// Model 皮肤模型：classic / slim（仅皮肤有意义）
	Model string `gorm:"size:16;default:classic" json:"model"`
	// Hash 处理后的 PNG 内容 hash，也是公开访问文件名
	Hash string `gorm:"size:64;index" json:"hash"`
	// Path 本地存储路径
	Path string `gorm:"size:512" json:"-"`
	// Name 用户自定义的材质名称（备注）
	Name string `gorm:"size:128" json:"name"`
	// Description 用户填写的材质描述
	Description string `gorm:"size:512" json:"description"`
	// Width / Height 处理后的图片尺寸
	Width  int `json:"width"`
	Height int `json:"height"`
	// LibraryItem 关联的公共材质库条目（若有）
	LibraryItem *TextureLibraryItem `gorm:"foreignKey:TextureID" json:"library_item,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
