package model

import "time"

// 公共材质库状态。
const (
	LibraryStatusPending     = "pending"
	LibraryStatusApproved    = "approved"
	LibraryStatusRejected    = "rejected"
	LibraryStatusUnpublished = "unpublished"
)

// 举报处理状态。
const (
	ReportStatusPending  = "pending"
	ReportStatusAccepted = "accepted"
	ReportStatusRejected = "rejected"
)

// TextureTag 是公共材质库的标签。
type TextureTag struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;size:64" json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// TextureLibraryItem 是公共材质库条目。
type TextureLibraryItem struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	TextureID uint   `gorm:"uniqueIndex" json:"texture_id"`
	AuthorID  uint   `gorm:"index" json:"author_id"`
	Title     string `gorm:"size:128" json:"title"`
	// UsageAgreement 作者的授权声明 / 使用协议（申请入库必填）
	UsageAgreement string `gorm:"size:512" json:"usage_agreement"`
	// Texture 关联的材质
	Texture *Texture `gorm:"foreignKey:TextureID" json:"texture,omitempty"`
	// Status: pending / approved / rejected / unpublished
	Status    string          `gorm:"size:16;default:pending" json:"status"`
	Tags      []TextureTag    `gorm:"many2many:texture_library_item_tags;" json:"tags,omitempty"`
	Reports   []TextureReport `gorm:"foreignKey:ItemID" json:"reports,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// TextureReport 是对公共材质库条目的举报。
type TextureReport struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	ItemID     uint   `gorm:"index" json:"item_id"`
	ReporterID uint   `gorm:"index" json:"reporter_id"`
	Reason     string `gorm:"size:512" json:"reason"`
	// Status: pending / accepted / rejected
	Status    string    `gorm:"size:16;default:pending" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
