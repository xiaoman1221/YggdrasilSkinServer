package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"

	"gorm.io/gorm"
)

// 站点业务错误。
var (
	ErrUserExists         = errors.New("user already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrSetupAlreadyDone   = errors.New("setup already done")
	ErrInvalidRefresh     = errors.New("invalid refresh token")
	ErrUserNotFound       = errors.New("user not found")
	ErrRegistrationClosed = errors.New("registration is closed")
	ErrInvalidUsername    = errors.New("username must be 3-16 letters, digits or underscore")
	ErrInvalidEmail       = errors.New("invalid email address")
	ErrEmailExists        = errors.New("email already exists")
	ErrWrongPassword      = errors.New("current password is incorrect")
	ErrOAuthBound         = errors.New("该第三方账号已绑定其他账号")
	ErrOAuthNotFound      = errors.New("该第三方账号尚未绑定本站账号")
	ErrEmailNotFound      = errors.New("no user found with this email")
	ErrInvalidResetToken  = errors.New("invalid or expired reset token")
	ErrSessionNotFound    = errors.New("session not found")
)

// sessionTTL 是站点 refresh 会话的有效期。
const sessionTTL = 30 * 24 * time.Hour

// AuthService 负责站点账号体系（setup/register/login/refresh/logout）。
type AuthService struct {
	db       *gorm.DB
	cfg      *config.Config
	settings *SettingService
}

// Cfg 返回配置引用（供 handler 读取过期时长等）。
func (s *AuthService) Cfg() *config.Config { return s.cfg }

// UploadAvatar 上传并保存用户头像（安全重编码为 PNG，最大 512x512、1MB），返回公开 URL。
func (s *AuthService) UploadAvatar(userID uint, data []byte) (string, error) {
	if int64(len(data)) > 1<<20 {
		return "", errors.New("avatar file too large (max 1 MB)")
	}
	processed, _, _, err := util.ProcessPNG(data, 512, 512)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.cfg.Storage.TextureDir, 0o755); err != nil {
		return "", err
	}
	filename := fmt.Sprintf("avatar_%d_%s.png", userID, util.HashPNG(processed)[:16])
	dst := filepath.Join(s.cfg.Storage.TextureDir, filename)
	if err := os.WriteFile(dst, processed, 0o644); err != nil {
		return "", err
	}
	return s.settings.TextureURL(filename[:len(filename)-4], s.cfg.Storage.BaseURL), nil
}

// NewAuthService 创建 AuthService。
func NewAuthService(db *gorm.DB, cfg *config.Config, settings *SettingService) *AuthService {
	return &AuthService{db: db, cfg: cfg, settings: settings}
}

// Setup 初始化站点：仅当系统中没有任何用户时允许，创建首个管理员。
func (s *AuthService) Setup(username, email, password string) (*model.User, error) {
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(strings.ToLower(email))
	if err := validateCredentials(username, email, password); err != nil {
		return nil, err
	}

	var count int64
	s.db.Model(&model.User{}).Count(&count)
	if count > 0 {
		return nil, ErrSetupAlreadyDone
	}

	hash, err := util.HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &model.User{
		Email:        email,
		Username:     username,
		PasswordHash: hash,
		Permissions:  "admin",
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// Register 注册普通用户。
func (s *AuthService) Register(email, username, password string) (*model.User, error) {
	if !s.settings.GetBool(model.SettingAllowRegister, true) {
		return nil, ErrRegistrationClosed
	}
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(strings.ToLower(email))
	if err := validateCredentials(username, email, password); err != nil {
		return nil, err
	}

	var count int64
	s.db.Model(&model.User{}).
		Where("email = ? OR username = ?", email, username).
		Count(&count)
	if count > 0 {
		return nil, ErrUserExists
	}

	hash, err := util.HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &model.User{
		Email:        email,
		Username:     username,
		PasswordHash: hash,
		Permissions:  "user",
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// Login 通过邮箱或用户名 + 密码登录，创建会话并返回用户与会话。
func (s *AuthService) Login(account, password, ip, userAgent string) (*model.User, *model.Session, error) {
	account = strings.TrimSpace(account)
	if account == "" || password == "" {
		return nil, nil, ErrInvalidCredentials
	}

	var user model.User
	err := s.db.Where("email = ? OR username = ?", strings.ToLower(account), account).
		First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, nil, err
	}
	if !util.CheckPassword(user.PasswordHash, password) {
		return nil, nil, ErrInvalidCredentials
	}

	session, err := s.createSession(user.ID, ip, userAgent)
	if err != nil {
		return nil, nil, err
	}
	return &user, session, nil
}

// Refresh 用 refreshToken 换取新的访问令牌与会话。
func (s *AuthService) Refresh(refreshToken string) (*model.User, *model.Session, error) {
	if strings.TrimSpace(refreshToken) == "" {
		return nil, nil, ErrInvalidRefresh
	}

	var session model.Session
	err := s.db.Where("refresh_token = ?", refreshToken).First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || session.IsExpired() {
		return nil, nil, ErrInvalidRefresh
	}
	if err != nil {
		return nil, nil, err
	}

	var user model.User
	if err := s.db.First(&user, session.UserID).Error; err != nil {
		return nil, nil, ErrUserNotFound
	}

	// 事务内原子地作废旧会话并签发新会话，避免中途失败导致用户被登出
	newSession, err := s.createSessionInTx(s.db, user.ID, session.IP, session.UserAgent, func(tx *gorm.DB) error {
		return tx.Delete(&model.Session{}, "id = ?", session.ID).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &user, newSession, nil
}

// Logout 使 refreshToken 对应的会话失效。
func (s *AuthService) Logout(refreshToken string) error {
	if strings.TrimSpace(refreshToken) == "" {
		return nil
	}
	return s.db.Delete(&model.Session{}, "refresh_token = ?", refreshToken).Error
}

// ListSessions 返回用户全部有效会话（按创建时间倒序）。
func (s *AuthService) ListSessions(userID uint) ([]model.Session, error) {
	var sessions []model.Session
	if err := s.db.Where("user_id = ? AND expires_at > ?", userID, time.Now()).
		Order("created_at DESC").Find(&sessions).Error; err != nil {
		return nil, err
	}
	return sessions, nil
}

// RevokeSession 使指定会话失效（仅限本人）。
func (s *AuthService) RevokeSession(sessionID, userID uint) error {
	res := s.db.Delete(&model.Session{}, "id = ? AND user_id = ?", sessionID, userID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrSessionNotFound
	}
	return nil
}

// RevokeOtherSessions 下线除 keepRefreshToken 外的全部会话。
func (s *AuthService) RevokeOtherSessions(userID uint, keepRefreshToken string) error {
	if strings.TrimSpace(keepRefreshToken) == "" {
		// 未指定保留会话时视为下线全部（当前会话由前端随后清除）
		return s.db.Delete(&model.Session{}, "user_id = ?", userID).Error
	}
	return s.db.Delete(&model.Session{}, "user_id = ? AND refresh_token <> ?", userID, keepRefreshToken).Error
}

// IssueAccessToken 为用户签发站点 JWT（访问令牌）。
func (s *AuthService) IssueAccessToken(user *model.User) (string, error) {
	hours := s.settings.GetInt(model.SettingJWTHours, s.cfg.JWT.ExpireHours)
	expire := time.Duration(hours) * time.Hour
	return util.GenerateToken(s.cfg.JWT.Secret, expire, user.ID, user.Username)
}

// CreateSessionForUser 为指定用户创建会话（OAuth 回调登录用）。
func (s *AuthService) CreateSessionForUser(userID uint, ip, userAgent string) (*model.Session, error) {
	return s.createSession(userID, ip, userAgent)
}

// createSession 创建并持久化会话，返回其 refreshToken。
func (s *AuthService) createSession(userID uint, ip, userAgent string) (*model.Session, error) {
	return s.createSessionInTx(s.db, userID, ip, userAgent, nil)
}

// createSessionInTx 在可选事务内创建会话；before 可为 nil，非 nil 时先执行（如作废旧会话）。
func (s *AuthService) createSessionInTx(db *gorm.DB, userID uint, ip, userAgent string, before func(tx *gorm.DB) error) (*model.Session, error) {
	var session *model.Session
	err := db.Transaction(func(tx *gorm.DB) error {
		if before != nil {
			if err := before(tx); err != nil {
				return err
			}
		}
		session = &model.Session{
			UserID:       userID,
			RefreshToken: util.RandomToken(),
			IP:           ip,
			UserAgent:    userAgent,
			ExpiresAt:    time.Now().Add(sessionTTL),
		}
		return tx.Create(session).Error
	})
	if err != nil {
		return nil, err
	}
	return session, nil
}

func validateCredentials(username, email, password string) error {
	if username == "" || email == "" || password == "" {
		return errors.New("username, email and password are required")
	}
	if len(password) < 6 {
		return errors.New("password must be at least 6 characters")
	}
	return nil
}

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)

// UpdateProfile 修改当前用户的基本信息（用户名/邮箱）。
func (s *AuthService) UpdateProfile(userID uint, username, email string) (*model.User, error) {
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(strings.ToLower(email))
	if !usernamePattern.MatchString(username) {
		return nil, ErrInvalidUsername
	}
	if !emailPattern.MatchString(email) {
		return nil, ErrInvalidEmail
	}
	var user model.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	var count int64
	s.db.Model(&model.User{}).Where("username = ? AND id <> ?", username, userID).Count(&count)
	if count > 0 {
		return nil, ErrUserExists
	}
	s.db.Model(&model.User{}).Where("email = ? AND id <> ?", email, userID).Count(&count)
	if count > 0 {
		return nil, ErrEmailExists
	}
	user.Username = username
	user.Email = email
	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// ChangePassword 修改当前用户密码（需验证原密码），并使其全部会话失效。
func (s *AuthService) ChangePassword(userID uint, current, next string) error {
	if len(next) < 6 {
		return errors.New("password must be at least 6 characters")
	}
	var user model.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return ErrUserNotFound
	}
	if user.PasswordHash != "" && !util.CheckPassword(user.PasswordHash, current) {
		return ErrWrongPassword
	}
	hash, err := util.HashPassword(next)
	if err != nil {
		return err
	}
	user.PasswordHash = hash
	if err := s.db.Save(&user).Error; err != nil {
		return err
	}
	// 使全部旧会话失效，强制重新登录
	return s.db.Delete(&model.Session{}, "user_id = ?", userID).Error
}

// CreatePasswordReset 为邮箱创建密码重置令牌（30 分钟有效）。
// 邮箱不存在时返回 ErrEmailNotFound；调用方应避免向客户端泄露该信息。
func (s *AuthService) CreatePasswordReset(email string) (token string, err error) {
	email = strings.TrimSpace(strings.ToLower(email))
	var user model.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		return "", ErrEmailNotFound
	}
	token = util.RandomToken() + util.RandomToken()
	reset := &model.PasswordReset{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(30 * time.Minute),
	}
	if err := s.db.Create(reset).Error; err != nil {
		return "", err
	}
	return token, nil
}

// ResetPassword 用重置令牌设置新密码，并使该用户全部会话失效。
func (s *AuthService) ResetPassword(token, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("password must be at least 6 characters")
	}
	var reset model.PasswordReset
	if err := s.db.Where("token = ?", token).First(&reset).Error; err != nil {
		return ErrInvalidResetToken
	}
	if time.Now().After(reset.ExpiresAt) {
		s.db.Delete(&reset)
		return ErrInvalidResetToken
	}
	var user model.User
	if err := s.db.First(&user, reset.UserID).Error; err != nil {
		return ErrUserNotFound
	}
	hash, err := util.HashPassword(newPassword)
	if err != nil {
		return err
	}
	user.PasswordHash = hash
	if err := s.db.Save(&user).Error; err != nil {
		return err
	}
	// 令牌一次性消费，旧会话全部失效
	s.db.Delete(&reset)
	return s.db.Delete(&model.Session{}, "user_id = ?", user.ID).Error
}

// AdminUpdateUser 管理员编辑用户基础信息（用户名/邮箱/重置密码，字段留空表示不修改）。
func (s *AuthService) AdminUpdateUser(userID uint, username, email, newPassword string) (*model.User, error) {
	var user model.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	if username = strings.TrimSpace(username); username != "" {
		if !usernamePattern.MatchString(username) {
			return nil, ErrInvalidUsername
		}
		var count int64
		s.db.Model(&model.User{}).Where("username = ? AND id <> ?", username, userID).Count(&count)
		if count > 0 {
			return nil, ErrUserExists
		}
		user.Username = username
	}
	if email = strings.TrimSpace(email); email != "" {
		email = strings.ToLower(email)
		if !emailPattern.MatchString(email) {
			return nil, ErrInvalidEmail
		}
		var count int64
		s.db.Model(&model.User{}).Where("email = ? AND id <> ?", email, userID).Count(&count)
		if count > 0 {
			return nil, ErrEmailExists
		}
		user.Email = email
	}
	if newPassword = strings.TrimSpace(newPassword); newPassword != "" {
		if len(newPassword) < 6 {
			return nil, errors.New("password must be at least 6 characters")
		}
		hash, err := util.HashPassword(newPassword)
		if err != nil {
			return nil, err
		}
		user.PasswordHash = hash
		// 密码被管理员重置后使全部会话失效
		if err := s.db.Delete(&model.Session{}, "user_id = ?", userID).Error; err != nil {
			return nil, err
		}
	}
	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// FindOrCreateOAuthUser 按 (type, openid) 查找绑定的用户；
// 未绑定时按邮箱匹配已有账号；仍无匹配时，若 autoCreate 为 true 则创建新账号，否则返回 ErrOAuthNotFound。
// avatar 为第三方平台头像地址（可为空），新账号或尚未设置头像的账号会使用它。
// 返回值 created 表示本次调用实际创建了新账号。
func (s *AuthService) FindOrCreateOAuthUser(oauthType, openid, nickname, email, avatar string, autoCreate bool) (user *model.User, created bool, err error) {
	var found model.User
	queryErr := s.db.Where("oauth_type = ? AND oauth_openid = ?", oauthType, openid).First(&found).Error
	if queryErr == nil {
		if found.AvatarURL == "" && avatar != "" {
			found.AvatarURL = avatar
			if err := s.db.Save(&found).Error; err != nil {
				return nil, false, err
			}
		}
		return &found, false, nil
	}
	if !errors.Is(queryErr, gorm.ErrRecordNotFound) {
		return nil, false, queryErr
	}
	// 未绑定：优先按邮箱匹配已有账号
	if email != "" {
		if err := s.db.Where("email = ?", strings.ToLower(email)).First(&found).Error; err == nil {
			// 邮箱已属于其它已绑定 OAuth 的账号：不再自动绑定，避免静默覆盖
			if found.OAuthType != "" && found.OAuthType != oauthType {
				return nil, false, ErrOAuthBound
			}
			found.OAuthType = oauthType
			found.OAuthOpenID = openid
			if found.AvatarURL == "" {
				found.AvatarURL = avatar
			}
			if err := s.db.Save(&found).Error; err != nil {
				return nil, false, err
			}
			return &found, false, nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, err
		}
	}
	if !autoCreate {
		return nil, false, ErrOAuthNotFound
	}
	// 创建新账号：邮箱为必填唯一字段，第三方未提供时使用占位邮箱
	username := strings.TrimSpace(nickname)
	if !usernamePattern.MatchString(username) {
		username = "user_" + openid[:min(10, len(openid))]
	}
	if email == "" {
		email = fmt.Sprintf("oauth_%s_%s@oauth.local", oauthType, openid)
	}
	hash, err := util.HashPassword(util.RandomToken())
	if err != nil {
		return nil, false, err
	}
	// 用户名冲突时追加随机后缀
	for i := 0; i < 5; i++ {
		var count int64
		s.db.Model(&model.User{}).Where("username = ?", username).Count(&count)
		if count == 0 {
			break
		}
		username = username[:min(10, len(username))] + "_" + util.RandomToken()[:4]
	}
	newUser := &model.User{
		Email:        strings.ToLower(email),
		Username:     username,
		PasswordHash: hash,
		Permissions:  "user",
		OAuthType:    oauthType,
		OAuthOpenID:  openid,
		AvatarURL:    avatar,
	}
	if err := s.db.Create(newUser).Error; err != nil {
		return nil, false, err
	}
	return newUser, true, nil
}

// BindOAuthUser 把第三方账号绑定到指定本站用户。
// 目标第三方账号已绑定其他用户时返回 ErrOAuthBound。
func (s *AuthService) BindOAuthUser(userID uint, oauthType, openid, nickname, email, avatar string) (*model.User, error) {
	var owner model.User
	err := s.db.Where("oauth_type = ? AND oauth_openid = ?", oauthType, openid).First(&owner).Error
	if err == nil {
		if owner.ID == userID {
			return &owner, nil // 已绑定到同一用户，视为成功
		}
		return nil, ErrOAuthBound
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var user model.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	user.OAuthType = oauthType
	user.OAuthOpenID = openid
	if user.AvatarURL == "" && avatar != "" {
		user.AvatarURL = avatar
	}
	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// UnbindOAuthUser 解除当前用户的第三方绑定。
func (s *AuthService) UnbindOAuthUser(userID uint) (*model.User, error) {
	var user model.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	if user.OAuthType == "" && user.OAuthOpenID == "" {
		return &user, nil // 未绑定，视为成功
	}
	user.OAuthType = ""
	user.OAuthOpenID = ""
	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
