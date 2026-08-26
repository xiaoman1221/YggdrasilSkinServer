package model

import "time"

// Setting 是站点基础设置（key-value）。
type Setting struct {
	ID    uint   `gorm:"primaryKey" json:"id"`
	Key   string `gorm:"uniqueIndex;size:64" json:"key"`
	Value string `gorm:"size:1024" json:"value"`
}

// 站点设置键（可在管理端「站点设置」修改，覆盖环境变量）。
const (
	SettingSiteName           = "site_name"
	SettingSiteAnnouncement   = "site_announcement"
	SettingSiteURL            = "site_url" // 对外地址，替代 YSS_STORAGE_BASE_URL
	SettingAllowRegister      = "allow_register"
	SettingAllowUpload        = "allow_upload"
	SettingMaxUploadSizeMB    = "max_upload_size_mb"
	SettingAllowYsmUpload     = "allow_ysm_upload"  // 是否允许上传 YSM 模型
	SettingMaxYsmSizeMB       = "max_ysm_size_mb"   // 单个 YSM 模型文件上限（MB）
	SettingUploadMaxWidth     = "upload_max_width"  // 替代 YSS_UPLOAD_MAX_WIDTH
	SettingUploadMaxHeight    = "upload_max_height" // 替代 YSS_UPLOAD_MAX_HEIGHT
	SettingServerName         = "yggdrasil_server_name"
	SettingImplName           = "yggdrasil_impl_name"
	SettingImplVersion        = "yggdrasil_impl_version"
	SettingSkinDomains        = "yggdrasil_skin_domains"
	SettingNonEmailLogin      = "yggdrasil_non_email_login"
	SettingJWTHours           = "jwt_expire_hours" // 替代 YSS_JWT_EXPIRE_HOURS
	SettingMojangClientID     = "mojang_client_id" // 替代 YSS_MICROSOFT_CLIENT_ID
	SettingMojangClientSecret = "mojang_client_secret"
	SettingMojangRedirectURI  = "mojang_redirect_uri"

	// SMTP 邮件（忘记密码等）
	SettingSMTPHost     = "smtp_host"     // SMTP 服务器
	SettingSMTPPort     = "smtp_port"     // 端口：465 隐式 TLS / 587 STARTTLS
	SettingSMTPUsername = "smtp_username" // 账号
	SettingSMTPPassword = "smtp_password" // 密码/授权码
	SettingSMTPFrom     = "smtp_from"     // 发件人（留空用 username）

	// OauthGo 第三方登录（https://o.1v.fit）
	SettingOauthEnabled = "oauthgo_enabled"
	SettingOauthAPIBase = "oauthgo_api_base" // 默认 https://o.1v.fit
	SettingOauthAppID   = "oauthgo_app_id"
	SettingOauthAppKey  = "oauthgo_app_key"
)

// PasswordReset 是忘记密码的重置令牌。
type PasswordReset struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"index"`
	Token     string `gorm:"uniqueIndex;size:64"`
	ExpiresAt time.Time
	CreatedAt time.Time
}

// DefaultSettings 返回设置键的默认值（空值表示回退到环境变量配置）。
func DefaultSettings() map[string]string {
	return map[string]string{
		SettingSiteName:           "YSS 皮肤站",
		SettingSiteAnnouncement:   "",
		SettingSiteURL:            "",
		SettingAllowRegister:      "true",
		SettingAllowUpload:        "true",
		SettingMaxUploadSizeMB:    "4",
		SettingAllowYsmUpload:     "true",
		SettingMaxYsmSizeMB:       "16",
		SettingUploadMaxWidth:     "",
		SettingUploadMaxHeight:    "",
		SettingServerName:         "",
		SettingImplName:           "",
		SettingImplVersion:        "",
		SettingSkinDomains:        "",
		SettingNonEmailLogin:      "",
		SettingJWTHours:           "",
		SettingMojangClientID:     "",
		SettingMojangClientSecret: "",
		SettingMojangRedirectURI:  "",
		SettingSMTPHost:           "",
		SettingSMTPPort:           "465",
		SettingSMTPUsername:       "",
		SettingSMTPPassword:       "",
		SettingSMTPFrom:           "",
		SettingOauthEnabled:       "false",
		SettingOauthAPIBase:       "https://o.1v.fit",
		SettingOauthAppID:         "",
		SettingOauthAppKey:        "",
	}
}
