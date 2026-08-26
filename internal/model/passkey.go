package model

import "time"

// PasskeyCredential 是用户绑定的 WebAuthn 通行密钥（passkey）。
// Data 保存序列化后的 webauthn.Credential JSON（含公钥、签名计数等）。
type PasskeyCredential struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index" json:"user_id"`
	CredentialID string    `gorm:"uniqueIndex;size:512" json:"credential_id"` // base64url(RAW ID)
	Name         string    `gorm:"size:128" json:"name"`
	Data         string    `gorm:"type:text" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
