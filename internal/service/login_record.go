package service

import (
	"errors"

	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"

	"gorm.io/gorm"
)

// LoginRecordService 负责登录记录的写入与查询。
type LoginRecordService struct {
	db *gorm.DB
}

// NewLoginRecordService 创建 LoginRecordService。
func NewLoginRecordService(db *gorm.DB) *LoginRecordService {
	return &LoginRecordService{db: db}
}

// 登录记录类型。
const (
	RecordTypeLogin = "login" // 启动器登录
	RecordTypeJoin  = "join"  // 进入游戏服务器
)

// Record 写入一条登录/进入服务器记录。
func (s *LoginRecordService) Record(userID uint, profileID, profileName, ip, userAgent, recordType string) error {
	record := &model.LoginRecord{
		UserID:          userID,
		ProfileID:       profileID,
		ProfileName:     profileName,
		IP:              ip,
		UserAgent:       userAgent,
		Launcher:        util.DetectLauncher(userAgent),
		LauncherVersion: util.DetectLauncherVersion(userAgent),
		Type:            recordType,
	}
	return s.db.Create(record).Error
}

// ListByUser 分页查询某用户的登录记录（按时间倒序）。
func (s *LoginRecordService) ListByUser(userID uint, limit, offset int) ([]model.LoginRecord, int64, error) {
	var total int64
	q := s.db.Model(&model.LoginRecord{}).Where("user_id = ?", userID)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var records []model.LoginRecord
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&records).Error
	return records, total, err
}

// ListAll 分页查询全部登录记录（管理员）。
func (s *LoginRecordService) ListAll(limit, offset int) ([]model.LoginRecord, int64, error) {
	var total int64
	q := s.db.Model(&model.LoginRecord{})
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var records []model.LoginRecord
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&records).Error
	return records, total, err
}

// Delete 删除一条登录记录（管理员）。
func (s *LoginRecordService) Delete(id uint) error {
	result := s.db.Delete(&model.LoginRecord{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("record not found")
	}
	return nil
}

// DeleteMany 批量删除登录记录（管理员），返回实际删除条数。
func (s *LoginRecordService) DeleteMany(ids []uint) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	result := s.db.Where("id IN ?", ids).Delete(&model.LoginRecord{})
	return result.RowsAffected, result.Error
}
