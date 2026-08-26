package service

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"
)

// OauthGoService 对接 OauthGo（https://o.1v.fit）第三方登录聚合平台。
// 文档：REST 风格接口 /api/v1/oauth/*，信息接口用 MD5 签名。
type OauthGoService struct {
	settings *SettingService
	cfg      *config.Config

	mu    sync.Mutex
	binds map[string]*bindIntent
}

// bindIntent 是一次第三方绑定流程的服务器端凭证（防伪造绑定他人账号）。
type bindIntent struct {
	UserID    uint
	OAuthType string
	ExpiresAt time.Time
}

// NewOauthGoService 创建 OauthGoService。
func NewOauthGoService(settings *SettingService, cfg *config.Config) *OauthGoService {
	return &OauthGoService{settings: settings, cfg: cfg, binds: make(map[string]*bindIntent)}
}

// Enabled 判断 OauthGo 是否启用（需填写 appid/appkey）。
func (s *OauthGoService) Enabled() bool {
	if !s.settings.GetBool(model.SettingOauthEnabled, false) {
		return false
	}
	return s.settings.Get(model.SettingOauthAppID, "") != "" && s.settings.Get(model.SettingOauthAppKey, "") != ""
}

func (s *OauthGoService) apiBase() string {
	return strings.TrimRight(s.settings.Get(model.SettingOauthAPIBase, "https://o.1v.fit"), "/")
}

func (s *OauthGoService) appID() string  { return s.settings.Get(model.SettingOauthAppID, "") }
func (s *OauthGoService) appKey() string { return s.settings.Get(model.SettingOauthAppKey, "") }

// AutoCreate 是否允许未绑定的第三方账号自动创建本站账号。
func (s *OauthGoService) AutoCreate() bool {
	return s.settings.GetBool(model.SettingOauthAutoCreate, true)
}

// EnabledProviderNames 返回管理端勾选允许的登录渠道；空表示全部启用。
func (s *OauthGoService) EnabledProviderNames() []string {
	raw := strings.TrimSpace(s.settings.Get(model.SettingOauthProviders, ""))
	if raw == "" {
		return nil
	}
	var names []string
	if err := json.Unmarshal([]byte(raw), &names); err != nil {
		return nil
	}
	seen := make(map[string]bool, len(names))
	out := names[:0]
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}

// ProviderEnabled 判断指定渠道是否被允许（未配置渠道列表时全部允许）。
func (s *OauthGoService) ProviderEnabled(name string) bool {
	if name == "" {
		return false
	}
	names := s.EnabledProviderNames()
	if len(names) == 0 {
		return true
	}
	for _, n := range names {
		if n == name {
			return true
		}
	}
	return false
}

// CreateBindIntent 为当前用户创建一次绑定凭证，返回一次性 token。
func (s *OauthGoService) CreateBindIntent(userID uint, oauthType string) (string, error) {
	token := util.RandomToken()
	s.mu.Lock()
	s.binds[token] = &bindIntent{UserID: userID, OAuthType: oauthType, ExpiresAt: time.Now().Add(10 * time.Minute)}
	s.mu.Unlock()
	return token, nil
}

// ConsumeBindIntent 取出并销毁绑定凭证；无效/过期返回 ok=false。
func (s *OauthGoService) ConsumeBindIntent(token string) (userID uint, oauthType string, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	intent, exists := s.binds[token]
	if !exists {
		return 0, "", false
	}
	delete(s.binds, token)
	if time.Now().After(intent.ExpiresAt) {
		return 0, "", false
	}
	return intent.UserID, intent.OAuthType, true
}

// sign 按 key 升序拼接参数并追加 &key=<appkey> 后取 MD5（小写）。
func (s *OauthGoService) sign(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	raw := strings.Join(parts, "&") + "&key=" + s.appKey()
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// oauthResp 是 OauthGo 的统一响应结构。
type oauthResp struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// post 调用 OauthGo JSON 接口。
func (s *OauthGoService) post(path string, payload map[string]string, out *oauthResp) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(s.apiBase()+path, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("请求 OauthGo 失败: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("OauthGo 响应解析失败: %w", err)
	}
	if out.Code != 0 {
		return errors.New(out.Message)
	}
	return nil
}

// GetAuthURL 发起登录，返回第三方授权地址。
func (s *OauthGoService) GetAuthURL(oauthType, redirectURI string) (string, error) {
	var out oauthResp
	err := s.post("/api/v1/oauth/login", map[string]string{
		"appid":        s.appID(),
		"appkey":       s.appKey(),
		"type":         oauthType,
		"redirect_uri": redirectURI,
	}, &out)
	if err != nil {
		return "", err
	}
	var data struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(out.Data, &data); err != nil || data.URL == "" {
		return "", errors.New("OauthGo 未返回授权地址")
	}
	return data.URL, nil
}

// OauthUserInfo 是 OauthGo 返回的用户信息。
type OauthUserInfo struct {
	Type     string `json:"type"`
	OpenID   string `json:"openid"`
	UnionID  string `json:"unionid"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
	Email    string `json:"email"`
}

// providerDisplayNames 是常见第三方渠道的中文显示名（用于登录页按钮）。
var providerDisplayNames = map[string]string{
	"gitee":     "Gitee",
	"github":    "GitHub",
	"qq":        "QQ",
	"wechat":    "微信",
	"weixin":    "微信",
	"alipay":    "支付宝",
	"dingtalk":  "钉钉",
	"baidu":     "百度",
	"weibo":     "微博",
	"douyin":    "抖音",
	"xiaomi":    "小米",
	"feishu":    "飞书",
	"microsoft": "Microsoft",
	"google":    "Google",
	"apple":     "Apple",
	"steam":     "Steam",
}

// GetUserInfo 用一次性 code 换取用户信息。
func (s *OauthGoService) GetUserInfo(oauthType, code string) (*OauthUserInfo, error) {
	params := map[string]string{
		"appid": s.appID(),
		"type":  oauthType,
		"code":  code,
	}
	payload := map[string]string{
		"appid": params["appid"],
		"type":  oauthType,
		"code":  code,
		"sign":  s.sign(params),
	}
	var out oauthResp
	if err := s.post("/api/v1/oauth/userinfo", payload, &out); err != nil {
		return nil, err
	}
	var info OauthUserInfo
	if err := json.Unmarshal(out.Data, &info); err != nil {
		return nil, fmt.Errorf("用户信息解析失败: %w", err)
	}
	if info.OpenID == "" {
		return nil, errors.New("OauthGo 未返回 openid")
	}
	return &info, nil
}

// ListProviders 获取平台已开通的登录渠道（公开接口，无需应用凭证）。
func (s *OauthGoService) ListProviders() ([]map[string]any, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(s.apiBase() + "/api/oauth/providers")
	if err != nil {
		return nil, fmt.Errorf("请求 OauthGo 失败: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var wrapped struct {
		Code    int              `json:"code"`
		Message string           `json:"message"`
		Data    []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(data, &wrapped); err != nil {
		return nil, fmt.Errorf("渠道列表解析失败: %w", err)
	}
	if wrapped.Code != 0 {
		return nil, errors.New(wrapped.Message)
	}
	providers := wrapped.Data
	// 补充前端可展示的中文渠道名
	for _, p := range providers {
		if name, _ := p["name"].(string); name != "" {
			if _, ok := p["display_name"]; !ok {
				if dn, ok2 := providerDisplayNames[name]; ok2 {
					p["display_name"] = dn
				} else {
					p["display_name"] = name
				}
			}
		}
	}
	return providers, nil
}
