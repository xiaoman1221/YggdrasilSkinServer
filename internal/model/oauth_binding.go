package model

import "time"

// UserOAuthBinding 是用户绑定的第三方登录账号（一个用户可绑定多个渠道）。
// 同一第三方账号（oauth_type + openid）全局唯一，不能被多个本站用户绑定。
type UserOAuthBinding struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	UserID      uint   `gorm:"index" json:"user_id"`
	OAuthType   string `gorm:"size:32;uniqueIndex:idx_oauth_binding" json:"oauth_type"`
	OAuthOpenID string `gorm:"size:128;uniqueIndex:idx_oauth_binding" json:"-"`
	// Nickname 第三方平台昵称（展示用）
	Nickname string `gorm:"size:128" json:"nickname"`
	// Avatar 第三方平台头像地址（展示用）
	Avatar string `gorm:"size:1024" json:"avatar"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
