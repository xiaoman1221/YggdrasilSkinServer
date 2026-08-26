package model

import "time"

// Token 是 Yggdrasil 协议使用的访问令牌。
// accessToken 即 Minecraft 启动器登录后拿到的令牌。
type Token struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	AccessToken string    `gorm:"uniqueIndex;size:64" json:"access_token"`
	ClientToken string    `gorm:"index;size:64" json:"client_token"`
	UserID      uint      `gorm:"index" json:"user_id"`
	ProfileID   string    `gorm:"size:36" json:"profile_id"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// IsExpired 判断令牌是否已过期。
func (t *Token) IsExpired() bool {
	return !t.ExpiresAt.IsZero() && time.Now().After(t.ExpiresAt)
}
