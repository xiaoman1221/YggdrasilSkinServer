package service

import (
	"strings"
	"sync"
	"time"

	"YggdrasilSkinServer/internal/model"

	"github.com/mojocn/base64Captcha"
)

// 图形验证码策略（与 SettingCaptchaPolicy 对应）。
const (
	CaptchaOff         = "off"          // 关闭
	CaptchaAlways      = "always"       // 登录/注册始终需要
	CaptchaAfterFailed = "after_failed" // 连续登录失败后需要
)

const (
	failThreshold = 3                  // 连续失败次数阈值
	failWindow    = 10 * time.Minute   // 失败计数窗口
)

// failEntry 记录某个账号+IP 的连续失败次数。
type failEntry struct {
	count int
	at    time.Time
}

// CaptchaService 提供图形验证码的生成/校验，以及「失败后要求」策略的失败计数。
type CaptchaService struct {
	settings *SettingService
	captcha  *base64Captcha.Captcha

	mu     sync.Mutex
	failed map[string]*failEntry
}

// NewCaptchaService 创建 CaptchaService。
func NewCaptchaService(settings *SettingService) *CaptchaService {
	return &CaptchaService{
		settings: settings,
		captcha:  base64Captcha.NewCaptcha(base64Captcha.NewDriverDigit(48, 140, 4, 0.6, 60), base64Captcha.DefaultMemStore),
		failed:   make(map[string]*failEntry),
	}
}

// Policy 返回当前验证码策略。
func (s *CaptchaService) Policy() string {
	return strings.TrimSpace(s.settings.Get(model.SettingCaptchaPolicy, CaptchaOff))
}

// Generate 生成一张图形验证码，返回 id 与 dataURL 图片。
// base64Captcha.Generate 返回的 b64s 已含 data:image/png;base64, 前缀。
func (s *CaptchaService) Generate() (id, image string, err error) {
	id, b64s, _, err := s.captcha.Generate()
	if err != nil {
		return "", "", err
	}
	return id, b64s, nil
}

// Verify 校验验证码；无论对错都会消耗该验证码（防重放）。
func (s *CaptchaService) Verify(id, answer string) bool {
	return s.captcha.Verify(strings.TrimSpace(id), strings.TrimSpace(answer), true)
}

// RequiredFor 判断指定动作（login/register）当前是否需要验证码。
func (s *CaptchaService) RequiredFor(key, action string) bool {
	switch s.Policy() {
	case CaptchaAlways:
		return true
	case CaptchaAfterFailed:
		return action == "login" && s.FailedCount(key) >= failThreshold
	default:
		return false
	}
}

// RecordFailure 记录一次登录失败。
func (s *CaptchaService) RecordFailure(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	e, ok := s.failed[key]
	if !ok || now.Sub(e.at) > failWindow {
		s.failed[key] = &failEntry{count: 1, at: now}
		return
	}
	e.count++
	e.at = now
}

// ResetFailure 清除某账号的失败计数（登录成功后调用）。
func (s *CaptchaService) ResetFailure(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.failed, key)
}

// FailedCount 返回某账号当前连续失败次数。
func (s *CaptchaService) FailedCount(key string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.failed[key]
	if !ok {
		return 0
	}
	if time.Since(e.at) > failWindow {
		delete(s.failed, key)
		return 0
	}
	return e.count
}
