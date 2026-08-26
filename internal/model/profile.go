package model

import "time"

// Profile 是一个 Minecraft 游戏档案（玩家）。
// 皮肤/披风通过 TextureID 关联 wardrobe 中的材质，YSM 模型通过 YsmModelID 关联。
type Profile struct {
	ID uint `gorm:"primaryKey" json:"id"`
	// UUID 档案唯一标识（36 位含连字符）
	UUID string `gorm:"uniqueIndex;size:36" json:"uuid"`
	// Name 游戏内名称
	Name   string `gorm:"uniqueIndex;size:16" json:"name"`
	UserID uint   `gorm:"index" json:"user_id"`
	// SkinTextureID 当前绑定的皮肤材质
	SkinTextureID *uint `gorm:"index" json:"skin_texture_id"`
	// CapeTextureID 当前绑定的披风材质
	CapeTextureID *uint `gorm:"index" json:"cape_texture_id"`
	// YsmModelID 当前绑定的 YSM 模型
	YsmModelID *uint `gorm:"index" json:"ysm_model_id"`

	SkinTexture *Texture `gorm:"foreignKey:SkinTextureID" json:"skin_texture,omitempty"`
	CapeTexture *Texture `gorm:"foreignKey:CapeTextureID" json:"cape_texture,omitempty"`
	YsmModel    *YsmModel `gorm:"foreignKey:YsmModelID" json:"ysm_model,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
