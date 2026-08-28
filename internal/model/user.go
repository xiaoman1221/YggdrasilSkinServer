package model

import (
	"strings"
	"time"
)

// 权限 scope 常量（User.Permissions 为逗号分隔的 scope 列表）。
const (
	PermAdmin          = "admin"           // 完整管理员
	PermUserManage     = "user_manage"     // 用户管理 operator
	PermTextureLibrary = "texture_library" // 材质库审核 operator
)

// User 是皮肤站注册用户。
type User struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	Email        string `gorm:"uniqueIndex;size:255" json:"email"`
	Username     string `gorm:"uniqueIndex;size:64" json:"username"`
	PasswordHash string `gorm:"size:255" json:"-"`
	// Permissions 预留的权限标记，如 user / admin
	Permissions string `gorm:"size:255;default:user" json:"permissions"`
	// AvatarURL 用户头像（来自 wardrobe 材质）
	AvatarURL string `gorm:"size:1024" json:"avatar_url"`
	// MojangUUID 绑定的正版（Mojang/Microsoft）UUID
	MojangUUID string `gorm:"size:36" json:"mojang_uuid"`
	// MojangName 绑定的正版账号名
	MojangName string `gorm:"size:16" json:"mojang_name"`
	// YggdrasilUUID 站点账号在 Yggdrasil 协议中的稳定用户 UUID（区别于各 Minecraft 档案 UUID）。
	// 创建站点账号时生成并持久化，保证 authenticate/refresh 返回的 user.id 恒定。
	YggdrasilUUID string `gorm:"size:36;index" json:"-"`
	// OAuthType 第三方登录类型（OauthGo，如 gitee/qq；空表示未绑定）
	OAuthType string `gorm:"size:32;index" json:"oauth_type"`
	// OAuthOpenID 第三方平台用户唯一标识
	OAuthOpenID string    `gorm:"size:128;index" json:"-"`
	Profiles    []Profile `gorm:"foreignKey:UserID" json:"profiles,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// HasPermission 判断用户是否拥有指定权限（Permissions 为逗号分隔的 scope 列表）。
func (u *User) HasPermission(perm string) bool {
	for _, p := range strings.Split(u.Permissions, ",") {
		if strings.TrimSpace(p) == perm {
			return true
		}
	}
	return false
}
