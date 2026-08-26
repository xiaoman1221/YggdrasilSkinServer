package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config 是服务运行所需的全部配置。
// 所有配置项均可通过环境变量覆盖，未设置时使用内置默认值。
type Config struct {
	Server    ServerConfig
	Database  DatabaseConfig
	JWT       JWTConfig
	Yggdrasil YggdrasilConfig
	Storage   StorageConfig
	Upload    UploadConfig
	Microsoft MicrosoftConfig
}

type ServerConfig struct {
	Host string
	Port int
	Mode string // debug / release
	// WebDist 前端构建产物目录（web/dist），存在时后端直接托管前端
	WebDist string
}

type DatabaseConfig struct {
	// Type 支持 sqlite / mysql / postgres
	Type string
	// DSN 数据库连接串；SQLite 时留空则使用 Path
	DSN string
	// Path SQLite 数据库文件路径
	Path string
}

type JWTConfig struct {
	Secret      string
	ExpireHours int
}

type YggdrasilConfig struct {
	ServerName            string // 服务器名称（authlib-injector meta）
	ImplementationName    string
	ImplementationVersion string
	SkinDomains           []string
	// EnableNonEmailLogin 允许使用用户名而非邮箱登录
	EnableNonEmailLogin bool
}

type StorageConfig struct {
	// TextureDir 纹理文件存储目录
	TextureDir string
	// YsmDir YSM 模型文件存储目录
	YsmDir string
	// BaseURL 对外公开访问地址，用于拼接纹理 URL（如 https://skin.example.com）
	BaseURL string
}

type MicrosoftConfig struct {
	// ClientID / ClientSecret 来自 Azure 应用注册（留空则禁用正版绑定）
	ClientID     string
	ClientSecret string
	// RedirectURI 必须与 Azure 注册的回调地址完全一致
	RedirectURI string
}

type UploadConfig struct {
	// Enabled 是否允许上传纹理
	Enabled bool
	// MaxSizeBytes 单张图片最大字节数
	MaxSizeBytes int64
	// MaxYsmSizeBytes 单个 YSM 模型文件最大字节数
	MaxYsmSizeBytes int64
	// MaxWidth / MaxHeight 允许的最大图片尺寸
	MaxWidth  int
	MaxHeight int
}

// Load 从环境变量加载配置，未设置的环境变量使用默认值。
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Host: getEnv("YSS_SERVER_HOST", "0.0.0.0"),
			Port: getEnvInt("YSS_SERVER_PORT", 8080),
			Mode:    getEnv("YSS_SERVER_MODE", "debug"),
			WebDist: getEnv("YSS_WEB_DIST", "web/dist"),
		},
		Database: DatabaseConfig{
			Type: getEnv("YSS_DATABASE_TYPE", "sqlite"),
			DSN:  os.Getenv("YSS_DATABASE_DSN"),
			Path: getEnv("YSS_DATABASE_PATH", "data/yss.db"),
		},
		JWT: JWTConfig{
			Secret:      getEnv("YSS_JWT_SECRET", "change-me-in-production"),
			ExpireHours: getEnvInt("YSS_JWT_EXPIRE_HOURS", 72),
		},
		Yggdrasil: YggdrasilConfig{
			ServerName:            getEnv("YSS_YGGDRASIL_SERVER_NAME", "YggdrasilSkinServer"),
			ImplementationName:    getEnv("YSS_YGGDRASIL_IMPL_NAME", "YSS"),
			ImplementationVersion: getEnv("YSS_YGGDRASIL_IMPL_VERSION", "0.1.0"),
			SkinDomains:           SplitCSV(getEnv("YSS_YGGDRASIL_SKIN_DOMAINS", "localhost")),
			EnableNonEmailLogin:   getEnvBool("YSS_YGGDRASIL_NON_EMAIL_LOGIN", true),
		},
		Storage: StorageConfig{
			TextureDir: getEnv("YSS_STORAGE_TEXTURE_DIR", "data/textures"),
			YsmDir:     getEnv("YSS_STORAGE_YSM_DIR", "data/ysm"),
			BaseURL:    getEnv("YSS_STORAGE_BASE_URL", "http://localhost:8080"),
		},
		Microsoft: MicrosoftConfig{
			ClientID:     os.Getenv("YSS_MICROSOFT_CLIENT_ID"),
			ClientSecret: os.Getenv("YSS_MICROSOFT_CLIENT_SECRET"),
			RedirectURI:  getEnv("YSS_MICROSOFT_REDIRECT_URI", "http://localhost:8080/api/v1/auth/mojang/callback"),
		},
		Upload: UploadConfig{
			Enabled:         getEnvBool("YSS_UPLOAD_ENABLED", true),
			MaxSizeBytes:    getEnvInt64("YSS_UPLOAD_MAX_SIZE", 4*1024*1024),
			MaxYsmSizeBytes: getEnvInt64("YSS_UPLOAD_MAX_YSM_SIZE", 16*1024*1024),
			MaxWidth:        getEnvInt("YSS_UPLOAD_MAX_WIDTH", 1024),
			MaxHeight:       getEnvInt("YSS_UPLOAD_MAX_HEIGHT", 1024),
		},
	}
}

// Addr 返回监听地址，如 0.0.0.0:8080。
func (c *Config) Addr() string {
	return c.Server.Host + ":" + strconv.Itoa(c.Server.Port)
}

// ExpireDuration 返回 JWT 过期时长。
func (c *Config) ExpireDuration() time.Duration {
	return time.Duration(c.JWT.ExpireHours) * time.Hour
}

// SplitCSV 把逗号分隔的字符串拆成切片。
func SplitCSV(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getEnvInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

func getEnvBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

