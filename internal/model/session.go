package model

import "time"

// Session 是站点自身登录后的会话（用于 refresh 令牌）。
type Session struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index" json:"user_id"`
	RefreshToken string    `gorm:"uniqueIndex;size:64" json:"-"`
	IP           string    `gorm:"size:64" json:"ip"`
	UserAgent    string    `gorm:"size:512" json:"user_agent"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// IsExpired 判断会话是否过期。
func (s *Session) IsExpired() bool {
	return !s.ExpiresAt.IsZero() && time.Now().After(s.ExpiresAt)
}
