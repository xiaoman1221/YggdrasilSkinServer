// YsmModel 是 Yes Steve Model（YSM）模型文件记录。
//
// YSM 模组通过本地文件夹（config/yes_steve_model/custom|auth）加载 .ysm 模型，
// 皮肤站负责：上传/存储/分发 .ysm 文件，并可将模型绑定到 Minecraft 档案，
// 通过下载链接（/ysm/{hash}.ysm）供玩家下载后放入 YSM 模型目录。
package model

import "time"

// YSM 模型文件格式。
const (
	YsmFormatYsm = "ysm" // .ysm 加密模型（文件头 YSGP）
	YsmFormatZip = "zip" // .zip 压缩包格式（文件头 PK）
)

// YsmModel 是 wardrobe 中的一份 YSM 模型。
type YsmModel struct {
	ID     uint `gorm:"primaryKey" json:"id"`
	UserID uint `gorm:"index" json:"user_id"`
	// Name 用户填写的模型名称
	Name string `gorm:"size:128" json:"name"`
	// Format 模型文件格式：ysm / zip
	Format string `gorm:"size:16" json:"format"`
	// Hash 文件内容 hash（SHA-256），也是公开访问文件名
	Hash string `gorm:"size:64;index" json:"hash"`
	// Path 本地存储路径
	Path string `gorm:"size:512" json:"-"`
	// PreviewPath 提取的模型预览图（PNG）本地存储路径，zip 格式上传时自动提取
	PreviewPath string `gorm:"size:512" json:"-"`
	// Size 文件大小（字节）
	Size int64 `json:"size"`
	// Description 用户填写的模型描述
	Description string `gorm:"size:512" json:"description"`
	// UsageAgreement 使用协议 / 授权说明（如 CC BY-NC、禁止二传等）
	UsageAgreement string `gorm:"size:512" json:"usage_agreement"`
	// PurchaseURL 购买链接（作者的爱发电/淘宝/官网等）
	PurchaseURL string `gorm:"size:512" json:"purchase_url"`
	// PriceInfo 资费说明（如 免费 / 付费 / 限定授权）
	PriceInfo string `gorm:"size:64" json:"price_info"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
