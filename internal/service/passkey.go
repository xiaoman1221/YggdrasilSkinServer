package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"gorm.io/gorm"
)

// passkeySessionTTL 是 WebAuthn 挑战（begin→finish）会话的有效期。
const passkeySessionTTL = 5 * time.Minute

// ErrPasskeyNotFound 表示指定的通行密钥不存在或不属于当前用户。
var ErrPasskeyNotFound = errors.New("passkey credential not found")

// pendingPasskey 是一次 WebAuthn 流程的待完成会话（内存存储，重启即失效）。
type pendingPasskey struct {
	Kind      string // register / login
	UserID    uint
	Session   *webauthn.SessionData
	ExpiresAt time.Time
}

// PasskeyService 负责 WebAuthn 通行密钥的注册、登录与凭证管理。
type PasskeyService struct {
	db       *gorm.DB
	cfg      *config.Config
	settings *SettingService
	wa       *webauthn.WebAuthn

	mu      sync.Mutex
	pending map[string]*pendingPasskey
}

// NewPasskeyService 创建 PasskeyService。RP 配置从站点设置（site_url/site_name）派生。
func NewPasskeyService(db *gorm.DB, cfg *config.Config, settings *SettingService) (*PasskeyService, error) {
	siteURL := strings.TrimRight(settings.Get(model.SettingSiteURL, cfg.Storage.BaseURL), "/")
	u, err := url.Parse(siteURL)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid site_url for WebAuthn: %s", siteURL)
	}
	wa, err := webauthn.New(&webauthn.Config{
		RPID:          u.Hostname(),
		RPDisplayName: settings.Get(model.SettingSiteName, "YSS 皮肤站"),
		RPOrigins:     []string{siteURL},
	})
	if err != nil {
		return nil, err
	}
	return &PasskeyService{
		db:       db,
		cfg:      cfg,
		settings: settings,
		wa:       wa,
		pending:  make(map[string]*pendingPasskey),
	}, nil
}

// webauthnUser 把站点用户适配为 WebAuthn User。
type webauthnUser struct {
	id          []byte
	name        string
	displayName string
	creds       []webauthn.Credential
}

func (u *webauthnUser) WebAuthnID() []byte                         { return u.id }
func (u *webauthnUser) WebAuthnName() string                       { return u.name }
func (u *webauthnUser) WebAuthnDisplayName() string                { return u.displayName }
func (u *webauthnUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

// webauthnID 生成稳定的用户 handle（不超过 64 字节）。
func webauthnID(userID uint) []byte {
	return []byte(fmt.Sprintf("yss-user-%d", userID))
}

// loadCredentials 读取用户已绑定的凭证（损坏记录跳过）。
func (s *PasskeyService) loadCredentials(userID uint) ([]webauthn.Credential, error) {
	var rows []model.PasskeyCredential
	if err := s.db.Where("user_id = ?", userID).Find(&rows).Error; err != nil {
		return nil, err
	}
	creds := make([]webauthn.Credential, 0, len(rows))
	for _, row := range rows {
		var c webauthn.Credential
		if err := json.Unmarshal([]byte(row.Data), &c); err != nil {
			continue
		}
		creds = append(creds, c)
	}
	return creds, nil
}

// BeginRegistration 开始注册流程，返回供浏览器使用的选项与一次性 sessionId。
func (s *PasskeyService) BeginRegistration(user *model.User) (*protocol.CredentialCreation, string, error) {
	creds, err := s.loadCredentials(user.ID)
	if err != nil {
		return nil, "", err
	}
	wu := &webauthnUser{id: webauthnID(user.ID), name: user.Username, displayName: user.Username, creds: creds}
	options, sessionData, err := s.wa.BeginRegistration(wu)
	if err != nil {
		return nil, "", err
	}
	return options, s.storePending("register", user.ID, sessionData), nil
}

// FinishRegistration 校验并保存注册响应。
func (s *PasskeyService) FinishRegistration(user *model.User, sessionID string, response json.RawMessage) (*webauthn.Credential, error) {
	pending, ok := s.takePending(sessionID, "register")
	if !ok {
		return nil, errors.New("passkey session not found or expired, please retry")
	}
	if pending.UserID != user.ID {
		return nil, errors.New("passkey session user mismatch")
	}
	creds, err := s.loadCredentials(user.ID)
	if err != nil {
		return nil, err
	}
	wu := &webauthnUser{id: webauthnID(user.ID), name: user.Username, displayName: user.Username, creds: creds}
	req, err := http.NewRequest(http.MethodPost, "/", bytes.NewReader(response))
	if err != nil {
		return nil, err
	}
	credential, err := s.wa.FinishRegistration(wu, *pending.Session, req)
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(credential)
	if err != nil {
		return nil, err
	}
	row := &model.PasskeyCredential{
		UserID:       user.ID,
		CredentialID: base64.RawURLEncoding.EncodeToString(credential.ID),
		Name:         "Passkey " + time.Now().Format("2006-01-02 15:04"),
		Data:         string(data),
	}
	if err := s.db.Create(row).Error; err != nil {
		return nil, err
	}
	return credential, nil
}

// BeginLogin 开始登录流程：按账号查找用户并生成断言选项。
func (s *PasskeyService) BeginLogin(account string) (*protocol.CredentialAssertion, string, error) {
	account = strings.TrimSpace(account)
	if account == "" {
		return nil, "", ErrInvalidCredentials
	}
	var user model.User
	err := s.db.Where("email = ? OR username = ?", strings.ToLower(account), account).First(&user).Error
	if err != nil {
		return nil, "", ErrInvalidCredentials
	}
	creds, err := s.loadCredentials(user.ID)
	if err != nil {
		return nil, "", err
	}
	if len(creds) == 0 {
		return nil, "", errors.New("该账号尚未绑定通行密钥")
	}
	wu := &webauthnUser{id: webauthnID(user.ID), name: user.Username, displayName: user.Username, creds: creds}
	options, sessionData, err := s.wa.BeginLogin(wu)
	if err != nil {
		return nil, "", err
	}
	return options, s.storePending("login", user.ID, sessionData), nil
}

// FinishLogin 校验断言响应并返回对应站点用户。
func (s *PasskeyService) FinishLogin(sessionID string, response json.RawMessage) (*model.User, error) {
	pending, ok := s.takePending(sessionID, "login")
	if !ok {
		return nil, errors.New("passkey session not found or expired, please retry")
	}
	var user model.User
	if err := s.db.First(&user, pending.UserID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	creds, err := s.loadCredentials(user.ID)
	if err != nil {
		return nil, err
	}
	wu := &webauthnUser{id: webauthnID(user.ID), name: user.Username, displayName: user.Username, creds: creds}
	req, err := http.NewRequest(http.MethodPost, "/", bytes.NewReader(response))
	if err != nil {
		return nil, err
	}
	verified, err := s.wa.FinishLogin(wu, *pending.Session, req)
	if err != nil {
		return nil, err
	}
	// 回写最新签名计数，防止克隆认证器重放
	if data, err := json.Marshal(verified); err == nil {
		s.db.Model(&model.PasskeyCredential{}).
			Where("user_id = ? AND credential_id = ?", user.ID, base64.RawURLEncoding.EncodeToString(verified.ID)).
			Update("data", string(data))
	}
	return &user, nil
}

// ListCredentials 返回用户已绑定的通行密钥列表。
func (s *PasskeyService) ListCredentials(userID uint) ([]model.PasskeyCredential, error) {
	var rows []model.PasskeyCredential
	if err := s.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// RemoveCredential 删除指定通行密钥（仅限本人）。
func (s *PasskeyService) RemoveCredential(userID, rowID uint) error {
	res := s.db.Delete(&model.PasskeyCredential{}, "id = ? AND user_id = ?", rowID, userID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrPasskeyNotFound
	}
	return nil
}

func (s *PasskeyService) storePending(kind string, userID uint, sessionData *webauthn.SessionData) string {
	sessionID := strings.ReplaceAll(fmt.Sprintf("pk_%d_%d", userID, time.Now().UnixNano()), " ", "")
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pending[sessionID] = &pendingPasskey{
		Kind:      kind,
		UserID:    userID,
		Session:   sessionData,
		ExpiresAt: time.Now().Add(passkeySessionTTL),
	}
	return sessionID
}

func (s *PasskeyService) takePending(sessionID, kind string) (*pendingPasskey, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.pending[sessionID]
	if !ok {
		return nil, false
	}
	delete(s.pending, sessionID)
	if p.Kind != kind || time.Now().After(p.ExpiresAt) {
		return nil, false
	}
	return p, true
}
