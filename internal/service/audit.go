package service

import (
	"YggdrasilSkinServer/internal/model"

	"gorm.io/gorm"
)

// WriteAudit 写入审计日志。
func WriteAudit(db *gorm.DB, actorID uint, action, targetType, targetID, detail string) {
	log := &model.AuditLog{
		ActorID:    actorID,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Detail:     detail,
	}
	db.Create(log)
}

// ListAudit 分页查询审计日志（按时间倒序）。
func ListAudit(db *gorm.DB, limit, offset int) ([]model.AuditLog, error) {
	var logs []model.AuditLog
	err := db.Order("created_at DESC").Limit(limit).Offset(offset).Find(&logs).Error
	return logs, err
}
