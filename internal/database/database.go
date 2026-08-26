package database

import (
	"fmt"
	"os"
	"path/filepath"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"

	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB 是全局数据库实例。
var DB *gorm.DB

// Init 根据配置初始化数据库连接并自动迁移表结构。
func Init(cfg *config.Config) error {
	var (
		dialector gorm.Dialector
		err       error
	)

	switch cfg.Database.Type {
	case "sqlite":
		// 确保 SQLite 文件所在目录存在
		if dir := filepath.Dir(cfg.Database.Path); dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return fmt.Errorf("create sqlite dir: %w", err)
			}
		}
		dialector = sqlite.Open(cfg.Database.Path)
	case "mysql":
		dialector = mysql.Open(cfg.Database.DSN)
	case "postgres", "postgresql":
		dialector = postgres.Open(cfg.Database.DSN)
	default:
		return fmt.Errorf("unsupported database type: %s", cfg.Database.Type)
	}

	logLevel := logger.Warn
	if cfg.Server.Mode == "debug" {
		logLevel = logger.Info
	}

	DB, err = gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}

	if err := AutoMigrate(); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}
	return nil
}

// AutoMigrate 同步数据表结构。
func AutoMigrate() error {
	return DB.AutoMigrate(
		&model.User{},
		&model.Session{},
		&model.Profile{},
		&model.Texture{},
		&model.YsmModel{},
		&model.TextureTag{},
		&model.TextureLibraryItem{},
		&model.TextureReport{},
		&model.Token{},
		&model.Setting{},
		&model.LoginRecord{},
		&model.AuditLog{},
		&model.PasswordReset{},
		&model.PasskeyCredential{},
	)
}


