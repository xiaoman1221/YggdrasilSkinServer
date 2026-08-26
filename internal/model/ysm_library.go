package model

import "time"

// YsmLibraryItem 是公共皮肤库中的 YSM 模型条目。
// 状态与 TextureLibraryItem 共用：pending / approved / rejected / unpublished。
type YsmLibraryItem struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	ModelID  uint   `gorm:"uniqueIndex" json:"model_id"`
	AuthorID uint   `gorm:"index" json:"author_id"`
	Title    string `gorm:"size:128" json:"title"`
	// UsageAgreement 使用协议 / 授权说明（申请入库必填）
	UsageAgreement string `gorm:"size:512" json:"usage_agreement"`
	// PriceInfo 资费情况：免费 / 付费（申请入库时强制规范化）
	PriceInfo string `gorm:"size:16" json:"price_info"`
	// PurchaseURL 购买/赞助链接（付费模型必填，必须是 http(s) 地址）
	PurchaseURL string `gorm:"size:512" json:"purchase_url"`
	// Status: pending / approved / rejected / unpublished
	Status string `gorm:"size:16;default:pending" json:"status"`

	Model *YsmModel    `gorm:"foreignKey:ModelID" json:"model,omitempty"`
	Tags  []TextureTag `gorm:"many2many:ysm_library_item_tags;" json:"tags,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
