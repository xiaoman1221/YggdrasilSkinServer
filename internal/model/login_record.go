package model

import "time"

// LoginRecord 记录一次 Yggdrasil 登录/进入服务器行为（档案 / 时间 / IP / 启动器）。
type LoginRecord struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index" json:"user_id"`
	// ProfileID 本次登录使用的档案 UUID（无档案时为空）
	ProfileID string `gorm:"size:36" json:"profile_id"`
	// ProfileName 本次登录使用的档案名称
	ProfileName string `gorm:"size:16" json:"profile_name"`
	// IP 登录来源 IP
	IP string `gorm:"size:64" json:"ip"`
	// UserAgent 原始请求头（用于追溯启动器）
	UserAgent string `gorm:"size:512" json:"user_agent"`
	// Launcher 从 User-Agent 解析出的启动器名称
	Launcher string `gorm:"size:64" json:"launcher"`
	// LauncherVersion 从 User-Agent 解析出的启动器版本（如 3.5.3）
	LauncherVersion string `gorm:"size:64" json:"launcher_version"`
	// Type 记录类型：login 启动器登录 / join 进入服务器
	Type string `gorm:"size:16;default:login" json:"type"`
	CreatedAt time.Time `json:"created_at"`
}
