package model

import "time"

// AuditLog 记录关键操作的审计链路（改名、删除、审核等）。
type AuditLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	ActorID    uint      `gorm:"index" json:"actor_id"`
	Action     string    `gorm:"size:64" json:"action"`
	TargetType string    `gorm:"size:32" json:"target_type"`
	TargetID   string    `gorm:"size:64" json:"target_id"`
	Detail     string    `gorm:"size:1024" json:"detail"`
	CreatedAt  time.Time `json:"created_at"`
}
