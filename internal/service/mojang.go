package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
)

// MojangProfile 是正版认证成功后获取到的 Minecraft 档案信息。
type MojangProfile struct {
	UUID      string
	Name      string
	SkinURL   string
	SkinModel string // classic / slim
}

// MojangService 实现 Microsoft OAuth + Xbox Live + Minecraft 正版认证流程。
type MojangService struct {
	cfg      *config.Config
	settings *SettingService
	client   *http.Client
}

// NewMojangService 创建 MojangService。
func NewMojangService(cfg *config.Config, settings *SettingService) *MojangService {
	return &MojangService{
		cfg:      cfg,
		settings: settings,
		client:   &http.Client{Timeout: 15 * time.Second},
	}
}

// clientID / clientSecret / redirectURI 均读自站点设置（可在管理端修改）。
func (s *MojangService) clientID() string {
	return s.settings.Get(model.SettingMojangClientID, s.cfg.Microsoft.ClientID)
}

func (s *MojangService) clientSecret() string {
	return s.settings.Get(model.SettingMojangClientSecret, s.cfg.Microsoft.ClientSecret)
}

func (s *MojangService) redirectURI() string {
	return s.settings.Get(model.SettingMojangRedirectURI, s.cfg.Microsoft.RedirectURI)
}

// Enabled 返回正版绑定是否已配置（需要 Azure 应用注册）。
func (s *MojangService) Enabled() bool {
	return s.clientID() != "" && s.clientSecret() != ""
}

// AuthorizeURL 构造 Microsoft 登录授权地址（含 state）。
func (s *MojangService) AuthorizeURL(state string) string {
	q := url.Values{}
	q.Set("client_id", s.clientID())
	q.Set("response_type", "code")
	q.Set("redirect_uri", s.redirectURI())
	q.Set("scope", "XboxLive.signin offline_access")
	q.Set("prompt", "select_account")
	q.Set("state", state)
	return "https://login.live.com/oauth20_authorize.srf?" + q.Encode()
}

// Exchange 使用回调 code 换取 Minecraft 档案（UUID/名称/皮肤）。
func (s *MojangService) Exchange(code string) (*MojangProfile, error) {
	msToken, err := s.exchangeCodeForToken(code)
	if err != nil {
		return nil, err
	}

	uhs, xblToken, err := s.authenticateXboxLive(msToken)
	if err != nil {
		return nil, err
	}

	xstsToken, err := s.authorizeXSTS(xblToken)
	if err != nil {
		return nil, err
	}

	mcToken, err := s.loginWithXbox(uhs, xstsToken)
	if err != nil {
		return nil, err
	}

	return s.fetchProfile(mcToken)
}

// exchangeCodeForToken 用授权 code 换取 Microsoft access_token。
func (s *MojangService) exchangeCodeForToken(code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", s.clientID())
	form.Set("client_secret", s.clientSecret())
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", s.redirectURI())

	var resp struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	if err := s.postForm("https://login.live.com/oauth20_token.srf", form, &resp); err != nil {
		return "", err
	}
	if resp.AccessToken == "" {
		return "", fmt.Errorf("microsoft token error: %s %s", resp.Error, resp.Description)
	}
	return resp.AccessToken, nil
}

// authenticateXboxLive 用 MS token 换取 XBL token，返回 user hash 与 token。
func (s *MojangService) authenticateXboxLive(msToken string) (uhs, token string, err error) {
	body := map[string]any{
		"Properties": map[string]any{
			"AuthMethod": "RPS",
			"SiteName":   "user.auth.xboxlive.com",
			"RpsTicket":  "d=" + msToken,
		},
		"RelyingParty": "http://auth.xboxlive.com",
		"TokenType":    "JWT",
	}
	var resp struct {
		Token string `json:"Token"`
		DisplayClaims struct {
			XUI []struct {
				UHS string `json:"uhs"`
			} `json:"xui"`
		} `json:"DisplayClaims"`
	}
	if err := s.postJSON("https://user.auth.xboxlive.com/user/authenticate", body, &resp); err != nil {
		return "", "", err
	}
	if resp.Token == "" || len(resp.DisplayClaims.XUI) == 0 {
		return "", "", errors.New("xbox live authentication failed")
	}
	return resp.DisplayClaims.XUI[0].UHS, resp.Token, nil
}

// authorizeXSTS 用 XBL token 换取 XSTS token。
func (s *MojangService) authorizeXSTS(xblToken string) (string, error) {
	body := map[string]any{
		"Properties": map[string]any{
			"SandboxId":  "RETAIL",
			"UserTokens": []string{xblToken},
		},
		"RelyingParty": "rp://api.minecraftservices.com/",
		"TokenType":    "JWT",
	}
	var resp struct {
		Token string `json:"Token"`
	}
	if err := s.postJSON("https://xsts.auth.xboxlive.com/xsts/authorize", body, &resp); err != nil {
		return "", err
	}
	if resp.Token == "" {
		return "", errors.New("xsts authorization failed")
	}
	return resp.Token, nil
}

// loginWithXbox 用 XSTS token 登录 Minecraft 服务，返回 MC access_token。
func (s *MojangService) loginWithXbox(uhs, xstsToken string) (string, error) {
	identityToken := fmt.Sprintf("XBL3.0 x=%s;%s", uhs, xstsToken)
	body := map[string]any{"identityToken": identityToken}
	var resp struct {
		AccessToken string `json:"access_token"`
	}
	if err := s.postJSON("https://api.minecraftservices.com/authentication/login_with_xbox", body, &resp); err != nil {
		return "", err
	}
	if resp.AccessToken == "" {
		return "", errors.New("minecraft login failed")
	}
	return resp.AccessToken, nil
}

// fetchProfile 获取 Minecraft 档案（UUID/名称/皮肤）。
func (s *MojangService) fetchProfile(mcToken string) (*MojangProfile, error) {
	var resp struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Skins []struct {
			URL     string `json:"url"`
			Variant string `json:"variant"` // CLASSIC / SLIM
		} `json:"skins"`
	}
	req, err := http.NewRequest("GET", "https://api.minecraftservices.com/minecraft/profile", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+mcToken)
	raw, err := s.do(req)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	if resp.ID == "" {
		return nil, errors.New("minecraft profile is empty (no purchased game?)")
	}
	profile := &MojangProfile{
		UUID: resp.ID,
		Name: resp.Name,
	}
	if len(resp.Skins) > 0 {
		profile.SkinURL = resp.Skins[0].URL
		if strings.EqualFold(resp.Skins[0].Variant, "SLIM") {
			profile.SkinModel = "slim"
		} else {
			profile.SkinModel = "classic"
		}
	}
	return profile, nil
}

// DownloadSkin 下载 Mojang 皮肤 PNG。
func (s *MojangService) DownloadSkin(skinURL string) ([]byte, error) {
	req, err := http.NewRequest("GET", skinURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "YggdrasilSkinServer/0.1 (+https://github.com/)")
	raw, err := s.do(req)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

func (s *MojangService) postForm(u string, form url.Values, out any) error {
	req, err := http.NewRequest("POST", u, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	raw, err := s.do(req)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

func (s *MojangService) postJSON(u string, body any, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", u, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	raw, err := s.do(req)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

func (s *MojangService) do(req *http.Request) ([]byte, error) {
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mojang api %s: %d %s", req.URL.Host, resp.StatusCode, truncate(string(raw), 200))
	}
	return raw, nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
}

