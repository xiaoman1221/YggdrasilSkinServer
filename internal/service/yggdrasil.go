package service

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// tokenTTL 是 Yggdrasil accessToken 的有效期。
const tokenTTL = 30 * 24 * time.Hour

// LenientInt 是宽松整数：兼容 JSON 数字与数字字符串（部分启动器发送 "version":"1"）。
type LenientInt int

// UnmarshalJSON 实现宽松整数解析。
func (v *LenientInt) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	var n int64
	if err := json.Unmarshal(data, &n); err == nil {
		*v = LenientInt(n)
		return nil
	}
	var f float64
	if err := json.Unmarshal(data, &f); err == nil {
		*v = LenientInt(f)
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		if parsed, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64); err == nil {
			*v = LenientInt(parsed)
			return nil
		}
	}
	return errors.New("invalid integer value")
}

// LenientBool 是宽松布尔：兼容 JSON 布尔与 "true"/"false"/"1"/"0" 字符串。
type LenientBool bool

// UnmarshalJSON 实现宽松布尔解析。
func (b *LenientBool) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	var v bool
	if err := json.Unmarshal(data, &v); err == nil {
		*b = LenientBool(v)
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "true", "1", "yes", "on":
			*b = true
		default:
			*b = false
		}
		return nil
	}
	var n float64
	if err := json.Unmarshal(data, &n); err == nil {
		*b = n != 0
		return nil
	}
	return errors.New("invalid boolean value")
}

// ProfileRef 是 Yggdrasil 协议中的档案引用，兼容两种 selectedProfile 格式：
// - 标准（Mojang/authlib-injector）发送 UUID 字符串
// - 部分客户端发送 {id, name} 对象
type ProfileRef struct {
	ID   string
	Name string
}

// UnmarshalJSON 先按 UUID 字符串解析，失败再按 {id, name} 对象解析。
func (p *ProfileRef) UnmarshalJSON(data []byte) error {
	var id string
	if err := json.Unmarshal(data, &id); err == nil {
		p.ID = id
		return nil
	}
	var g GameProfile
	if err := json.Unmarshal(data, &g); err == nil {
		p.ID = g.ID
		p.Name = g.Name
		return nil
	}
	return errors.New("selectedProfile must be a UUID string or {id,name} object")
}

// Agent 是 Yggdrasil authenticate 请求中的客户端信息。
type Agent struct {
	Name    string     `json:"name"`
	Version LenientInt `json:"version"`
}

// AuthenticateRequest 对应 POST authserver/authenticate 的请求体。
type AuthenticateRequest struct {
	Username        string       `json:"username"`
	Password        string       `json:"password"`
	ClientToken     string       `json:"clientToken"`
	RequestUser     LenientBool  `json:"requestUser"`
	Agent           *Agent       `json:"agent"`
	SelectedProfile *GameProfile `json:"selectedProfile"`
}

// RefreshRequest 对应 POST authserver/refresh 的请求体。
type RefreshRequest struct {
	AccessToken     string       `json:"accessToken"`
	ClientToken     string       `json:"clientToken"`
	RequestUser     LenientBool  `json:"requestUser"`
	SelectedProfile *GameProfile `json:"selectedProfile"`
}

// ValidateRequest 对应 POST authserver/validate 的请求体。
type ValidateRequest struct {
	AccessToken string `json:"accessToken"`
	ClientToken string `json:"clientToken"`
}

// SignoutRequest 对应 POST authserver/signout 的请求体。
type SignoutRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// InvalidateRequest 对应 POST authserver/invalidate 的请求体。
type InvalidateRequest struct {
	AccessToken string `json:"accessToken"`
	ClientToken string `json:"clientToken"`
}

// JoinRequest 对应 POST sessionserver/session/minecraft/join 的请求体。
type JoinRequest struct {
	AccessToken     string      `json:"accessToken"`
	SelectedProfile *ProfileRef `json:"selectedProfile"`
	ServerID        string      `json:"serverId"`
}

// GameProfile 是 Yggdrasil 协议中的游戏档案。
type GameProfile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Property 是 Yggdrasil 协议中的属性（如 textures）。
type Property struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	Signature string `json:"signature,omitempty"`
}

// SessionProfile 是 sessionserver 返回的完整档案。
type SessionProfile struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Properties []Property `json:"properties"`
}

// serverSession 保存 join 阶段的服务端会话信息。
type serverSession struct {
	serverID  string
	profileID string
	joinedAt  time.Time
}

// YggdrasilService 实现 Yggdrasil / authlib-injector 协议的核心逻辑。
type YggdrasilService struct {
	db          *gorm.DB
	cfg         *config.Config
	textureSvc  *TextureService
	loginRecord *LoginRecordService
	settings    *SettingService

	mu   sync.Mutex
	sess map[string]serverSession // username -> serverSession
}

// NewYggdrasilService 创建 YggdrasilService。
func NewYggdrasilService(db *gorm.DB, cfg *config.Config, textureSvc *TextureService, loginRecord *LoginRecordService, settings *SettingService) *YggdrasilService {
	return &YggdrasilService{
		db:          db,
		cfg:         cfg,
		textureSvc:  textureSvc,
		loginRecord: loginRecord,
		settings:    settings,
		sess:        make(map[string]serverSession),
	}
}

// Metadata 返回 authlib-injector 元数据（serverName/skinDomains 等读自站点设置）。
func (s *YggdrasilService) Metadata() gin.H {
	serverName := s.settings.Get(model.SettingServerName, s.cfg.Yggdrasil.ServerName)
	implName := s.settings.Get(model.SettingImplName, s.cfg.Yggdrasil.ImplementationName)
	implVersion := s.settings.Get(model.SettingImplVersion, s.cfg.Yggdrasil.ImplementationVersion)
	nonEmail := s.settings.GetBool(model.SettingNonEmailLogin, s.cfg.Yggdrasil.EnableNonEmailLogin)
	domains := config.SplitCSV(s.settings.Get(model.SettingSkinDomains, strings.Join(s.cfg.Yggdrasil.SkinDomains, ",")))
	return gin.H{
		"meta": gin.H{
			"serverName":                          serverName,
			"implementationName":                  implName,
			"implementationVersion":               implVersion,
			"feature.non_email_login":             nonEmail,
			"feature.username_check":              true,
			"feature.enable_profile_key":          true,
			"feature.enable_mojang_anti_features": true,
		},
		"skinDomains": domains,
		// TODO: 接入 RSA 签名后在此返回 signaturePublickey
	}
}

// Authenticate 处理登录：校验账号密码，签发 accessToken，并记录登录日志。
func (s *YggdrasilService) Authenticate(req *AuthenticateRequest, ip, userAgent string) (int, gin.H) {
	if req == nil || strings.TrimSpace(req.Username) == "" || req.Password == "" {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", "username and password are required")
	}

	account := strings.TrimSpace(req.Username)
	var user model.User
	err := s.db.Where("email = ? OR username = ?", strings.ToLower(account), account).
		First(&user).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	if err != nil || !util.CheckPassword(user.PasswordHash, req.Password) {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Invalid credentials. Invalid username or password.")
	}
	s.ensureYggdrasilUUID(&user)

	profiles, err := s.userProfiles(user.ID)
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}

	selected := s.resolveSelectedProfile(profiles, req.SelectedProfile)
	token, err := s.issueToken(s.db, user.ID, req.ClientToken, selected)
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}

	// 记录登录：档案 / 时间 / IP / 启动器
	profileID, profileName := "", ""
	if selected != nil {
		profileID = selected.UUID
		profileName = selected.Name
	}
	if err := s.loginRecord.Record(user.ID, profileID, profileName, ip, userAgent, RecordTypeLogin); err != nil {
		// 记录失败不影响登录
		s.db.Logger.Error(nil, "record login failed: %v", err)
	}

	return http.StatusOK, s.authResponse(token, req.ClientToken, bool(req.RequestUser), profiles, selected, &user)
}

// Refresh 刷新 accessToken。
func (s *YggdrasilService) Refresh(req *RefreshRequest) (int, gin.H) {
	if req == nil || req.AccessToken == "" {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", "accessToken is required")
	}

	token, status, errResp := s.lookupValidToken(req.AccessToken, req.ClientToken)
	if status != 0 {
		return status, errResp
	}

	var user model.User
	if err := s.db.First(&user, token.UserID).Error; err != nil {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Invalid token.")
	}
	s.ensureYggdrasilUUID(&user)

	profiles, err := s.userProfiles(user.ID)
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}

	selected := s.resolveSelectedProfile(profiles, req.SelectedProfile)

	// 事务内原子地作废旧令牌并签发新令牌，避免中途失败导致凭据丢失
	var newToken *model.Token
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.Token{}, "access_token = ?", token.AccessToken).Error; err != nil {
			return err
		}
		var createErr error
		newToken, createErr = s.issueToken(tx, user.ID, req.ClientToken, selected)
		return createErr
	}); err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}

	return http.StatusOK, s.authResponse(newToken, req.ClientToken, bool(req.RequestUser), profiles, selected, &user)
}

// Validate 校验 accessToken 是否有效。
func (s *YggdrasilService) Validate(req *ValidateRequest) (int, gin.H) {
	if req == nil || req.AccessToken == "" {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", "accessToken is required")
	}
	_, status, errResp := s.lookupValidToken(req.AccessToken, req.ClientToken)
	if status != 0 {
		return status, errResp
	}
	return http.StatusNoContent, nil
}

// Signout 使指定用户的所有令牌失效。
func (s *YggdrasilService) Signout(req *SignoutRequest) (int, gin.H) {
	if req == nil || strings.TrimSpace(req.Username) == "" || req.Password == "" {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", "username and password are required")
	}
	account := strings.TrimSpace(req.Username)
	var user model.User
	err := s.db.Where("email = ? OR username = ?", strings.ToLower(account), account).
		First(&user).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		// 真实 DB 故障不应被静默吞掉
		s.db.Logger.Error(nil, "signout query failed: %v", err)
		return http.StatusNoContent, nil
	}
	if err == nil && util.CheckPassword(user.PasswordHash, req.Password) {
		s.db.Delete(&model.Token{}, "user_id = ?", user.ID)
	}
	return http.StatusNoContent, nil
}

// Invalidate 使指定 accessToken 失效。
func (s *YggdrasilService) Invalidate(req *InvalidateRequest) (int, gin.H) {
	if req == nil || req.AccessToken == "" {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", "accessToken is required")
	}
	s.db.Delete(&model.Token{}, "access_token = ?", req.AccessToken)
	return http.StatusNoContent, nil
}

// SessionProfile 按 UUID 返回完整档案（含 textures）。
func (s *YggdrasilService) SessionProfile(uuid string) (int, any) {
	profile, err := s.findProfile(uuid)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return yggdrasilError(http.StatusNotFound, "IllegalArgumentException", "Invalid uuid.")
	}
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	return http.StatusOK, s.toSessionProfile(profile)
}

// Join 处理服务端加入请求（记录 serverId）。
func (s *YggdrasilService) Join(req *JoinRequest, ip, userAgent string) (int, gin.H) {
	if req == nil || req.AccessToken == "" || req.SelectedProfile == nil || req.SelectedProfile.ID == "" || req.ServerID == "" {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", "accessToken, selectedProfile and serverId are required")
	}

	token, status, errResp := s.lookupValidToken(req.AccessToken, "")
	if status != 0 {
		return status, errResp
	}
	if token.ProfileID != "" && !strings.EqualFold(util.NormalizeUUID(token.ProfileID), util.NormalizeUUID(req.SelectedProfile.ID)) {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Invalid token.")
	}

	profile, err := s.findProfile(token.ProfileID)
	if err != nil {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Invalid token.")
	}

	s.mu.Lock()
	// 顺手清理已过期（>5min）且未被消费的会话，防止 map 无限增长
	now := time.Now()
	for k, v := range s.sess {
		if now.Sub(v.joinedAt) > 5*time.Minute {
			delete(s.sess, k)
		}
	}
	s.sess[strings.ToLower(profile.Name)] = serverSession{
		serverID:  req.ServerID,
		profileID: profile.UUID,
		joinedAt:  now,
	}
	s.mu.Unlock()
	// 记录进入服务器行为（服务器 IP 为请求来源）
	if err := s.loginRecord.Record(token.UserID, profile.UUID, profile.Name, ip, userAgent, RecordTypeJoin); err != nil {
		s.db.Logger.Error(nil, "record join failed: %v", err)
	}
	return http.StatusNoContent, nil
}

// HasJoined 校验服务端会话并返回档案（会话一次性消费）。
func (s *YggdrasilService) HasJoined(username, serverID string) (int, any) {
	key := strings.ToLower(username)
	s.mu.Lock()
	sess, ok := s.sess[key]
	delete(s.sess, key)
	s.mu.Unlock()

	if !ok || sess.serverID != serverID || time.Since(sess.joinedAt) > 5*time.Minute {
		return http.StatusNoContent, nil
	}

	profile, err := s.findProfile(sess.profileID)
	if err != nil {
		return http.StatusNoContent, nil
	}
	return http.StatusOK, s.toSessionProfile(profile)
}

// ProfilesByNames 批量按名称查询 UUID（POST api/profiles/minecraft）。
func (s *YggdrasilService) ProfilesByNames(names []string) (int, any) {
	// Mojang 协议限制单次最多 10 个名称
	if len(names) > 10 {
		names = names[:10]
	}
	if len(names) == 0 {
		return http.StatusOK, []any{}
	}

	var profiles []model.Profile
	if err := s.db.Where("name IN ?", names).Find(&profiles).Error; err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}

	result := make([]GameProfile, 0, len(profiles))
	for _, p := range profiles {
		result = append(result, GameProfile{
			ID:   util.NormalizeUUID(p.UUID),
			Name: p.Name,
		})
	}
	return http.StatusOK, result
}

// UserProfile 返回旧版 API 的玩家档案。
func (s *YggdrasilService) UserProfile(uuid string) (int, any) {
	return s.SessionProfile(uuid)
}

// UserNames 返回玩家名称历史。
func (s *YggdrasilService) UserNames(uuid string) (int, any) {
	profile, err := s.findProfile(uuid)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return yggdrasilError(http.StatusNotFound, "IllegalArgumentException", "Invalid uuid.")
	}
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	// 当前未实现改名历史，仅返回当前名称
	return http.StatusOK, []gin.H{
		{"name": profile.Name, "changedToAt": profile.CreatedAt.UnixMilli()},
	}
}

// Keys 返回 1.19.4+ 的密钥列表（暂未启用签名）。
func (s *YggdrasilService) Keys() gin.H {
	return gin.H{"keys": []any{}}
}

// MaxTextureUploadBytes 返回当前站点设置的材质上传大小上限（字节）。
func (s *YggdrasilService) MaxTextureUploadBytes() int64 {
	return int64(s.settings.GetInt(model.SettingMaxUploadSizeMB, 4)) * 1024 * 1024
}

// UserByAccessToken 通过 Yggdrasil accessToken 解析用户（供上传等协议接口使用）。
func (s *YggdrasilService) UserByAccessToken(accessToken string) (*model.User, *model.Token, error) {
	var token model.Token
	if err := s.db.Where("access_token = ?", accessToken).First(&token).Error; err != nil {
		return nil, nil, errors.New("invalid token")
	}
	if token.IsExpired() {
		return nil, nil, errors.New("invalid token")
	}
	var user model.User
	if err := s.db.First(&user, token.UserID).Error; err != nil {
		return nil, nil, errors.New("invalid token")
	}
	return &user, &token, nil
}

// UploadTexture 处理 Yggdrasil 上传接口：
// 把上传的 PNG 保存为 wardrobe 材质并绑定到档案。
func (s *YggdrasilService) UploadTexture(token *model.Token, profileUUID, texType string, data []byte) (int, gin.H) {
	profile, err := s.findProfile(profileUUID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Invalid profile.")
	}
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	if profile.UserID != token.UserID {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Profile does not belong to the token holder.")
	}

	texture, err := s.textureSvc.Create(token.UserID, texType, model.TextureModelClassic, data, "", "")
	if err != nil {
		return yggdrasilError(http.StatusBadRequest, "IllegalArgumentException", err.Error())
	}

	if texType == model.TextureTypeSkin {
		profile.SkinTextureID = &texture.ID
	} else {
		profile.CapeTextureID = &texture.ID
	}
	if err := s.db.Save(profile).Error; err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	return http.StatusOK, gin.H{"url": s.settings.TextureURL(texture.Hash, s.cfg.Storage.BaseURL)}
}

// DeleteTexture 处理 Yggdrasil 删除接口：解绑档案上的皮肤/披风。
func (s *YggdrasilService) DeleteTexture(token *model.Token, profileUUID, texType string) (int, gin.H) {
	profile, err := s.findProfile(profileUUID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Invalid profile.")
	}
	if err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	if profile.UserID != token.UserID {
		return yggdrasilError(http.StatusForbidden, "ForbiddenOperationException", "Profile does not belong to the token holder.")
	}

	if texType == model.TextureTypeSkin {
		profile.SkinTextureID = nil
	} else {
		profile.CapeTextureID = nil
	}
	if err := s.db.Save(profile).Error; err != nil {
		return yggdrasilError(http.StatusInternalServerError, "InternalServerError", err.Error())
	}
	return http.StatusNoContent, nil
}

// TexturePathByHash 按 hash 解析本地纹理文件路径。
func (s *YggdrasilService) TexturePathByHash(hash string) (string, error) {
	if len(hash) != 64 || !util.IsHex(hash) {
		return "", errors.New("invalid hash")
	}
	path := filepath.Join(s.cfg.Storage.TextureDir, hash+".png")
	if _, err := os.Stat(path); err != nil {
		return "", err
	}
	return path, nil
}

// --- 内部辅助 ---

// ensureYggdrasilUUID 确保站点账号已有稳定的 Yggdrasil 用户 UUID。
// 历史账号可能在字段引入前注册，首次登录时补齐并持久化。
func (s *YggdrasilService) ensureYggdrasilUUID(user *model.User) {
	if user.YggdrasilUUID != "" {
		return
	}
	user.YggdrasilUUID = util.NewUUID()
	s.db.Model(user).Update("yggdrasil_uuid", user.YggdrasilUUID)
}

func (s *YggdrasilService) userProfiles(userID uint) ([]model.Profile, error) {
	var profiles []model.Profile
	err := s.db.Where("user_id = ?", userID).Find(&profiles).Error
	return profiles, err
}

// resolveSelectedProfile 从可用档案中解析选中的档案；未指定或无效时返回第一个。
func (s *YggdrasilService) resolveSelectedProfile(profiles []model.Profile, selected *GameProfile) *model.Profile {
	if selected != nil && selected.ID != "" {
		for i := range profiles {
			if strings.EqualFold(util.NormalizeUUID(profiles[i].UUID), util.NormalizeUUID(selected.ID)) {
				return &profiles[i]
			}
		}
	}
	if len(profiles) > 0 {
		return &profiles[0]
	}
	return nil
}

// issueToken 生成并持久化一个新的 accessToken（clientToken 直接写入，避免二次 Save）。
func (s *YggdrasilService) issueToken(tx *gorm.DB, userID uint, clientToken string, profile *model.Profile) (*model.Token, error) {
	token := &model.Token{
		AccessToken: util.RandomToken(),
		ClientToken: clientToken,
		UserID:      userID,
		ExpiresAt:   time.Now().Add(tokenTTL),
	}
	if profile != nil {
		token.ProfileID = profile.UUID
	}
	if err := tx.Create(token).Error; err != nil {
		return nil, err
	}
	return token, nil
}

// lookupValidToken 按 accessToken 查找未过期令牌；clientToken 非空时校验一致性。
// 返回 (token, 0, nil) 表示成功。
func (s *YggdrasilService) lookupValidToken(accessToken, clientToken string) (*model.Token, int, gin.H) {
	var token model.Token
	if err := s.db.Where("access_token = ?", accessToken).First(&token).Error; err != nil {
		return nil, http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."}
	}
	if token.IsExpired() {
		return nil, http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."}
	}
	if clientToken != "" && token.ClientToken != "" && token.ClientToken != clientToken {
		return nil, http.StatusForbidden, gin.H{"error": "ForbiddenOperationException", "errorMessage": "Invalid token."}
	}
	return &token, 0, nil
}

// authResponse 组装 authenticate/refresh 的响应体。
func (s *YggdrasilService) authResponse(token *model.Token, clientToken string, requestUser bool, profiles []model.Profile, selected *model.Profile, user *model.User) gin.H {
	available := make([]GameProfile, 0, len(profiles))
	for _, p := range profiles {
		available = append(available, GameProfile{ID: util.NormalizeUUID(p.UUID), Name: p.Name})
	}

	resp := gin.H{
		"accessToken":       token.AccessToken,
		"clientToken":       clientToken,
		"availableProfiles": available,
	}
	if selected != nil {
		resp["selectedProfile"] = GameProfile{ID: util.NormalizeUUID(selected.UUID), Name: selected.Name}
	}
	if requestUser && user != nil {
		// 站点账号在 Yggdrasil 协议中的稳定用户 ID（区别于各 Minecraft 档案 UUID）。
		// 新账号在创建时生成并持久化；历史账号无该字段时采用一次性兜底（不应在协议响应中暴露随机值）。
		userID := user.YggdrasilUUID
		if userID == "" {
			userID = util.NewUUID()
		}
		resp["user"] = gin.H{
			"id":         util.NormalizeUUID(userID),
			"properties": []any{},
		}
	}
	return resp
}

// findProfile 按带/不带连字符的 UUID 查询档案（预加载纹理）。
func (s *YggdrasilService) findProfile(uuid string) (*model.Profile, error) {
	normalized := util.NormalizeUUID(uuid)
	if normalized == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var profile model.Profile
	err := s.db.Preload("SkinTexture").Preload("CapeTexture").Preload("YsmModel").
		Where("uuid IN ?", util.UUIDQueryFormats(normalized)).First(&profile).Error
	return &profile, err
}

// toSessionProfile 将档案转为 sessionserver 响应。
func (s *YggdrasilService) toSessionProfile(p *model.Profile) SessionProfile {
	properties := make([]Property, 0, 1)
	textures := s.TexturesPayload(p)
	if textures != "" {
		properties = append(properties, Property{Name: "textures", Value: textures})
	}
	return SessionProfile{
		ID:         util.NormalizeUUID(p.UUID),
		Name:       p.Name,
		Properties: properties,
	}
}

// TexturesPayload 构建 base64 编码的 textures 属性值。
func (s *YggdrasilService) TexturesPayload(p *model.Profile) string {
	textures := map[string]any{}
	if p.SkinTexture != nil {
		skin := gin.H{"url": s.settings.TextureURL(p.SkinTexture.Hash, s.cfg.Storage.BaseURL)}
		if p.SkinTexture.Model == model.TextureModelSlim {
			skin["metadata"] = gin.H{"model": "slim"}
		}
		textures["SKIN"] = skin
	}
	if p.CapeTexture != nil {
		textures["CAPE"] = gin.H{"url": s.settings.TextureURL(p.CapeTexture.Hash, s.cfg.Storage.BaseURL)}
	}
	if p.YsmModel != nil {
		textures["YSM"] = gin.H{
			"url":  s.settings.YsmURL(p.YsmModel.Hash, p.YsmModel.Format, s.cfg.Storage.BaseURL),
			"name": p.YsmModel.Name,
		}
	}

	payload := gin.H{
		"timestamp":   time.Now().UnixMilli(),
		"profileId":   p.UUID,
		"profileName": p.Name,
		"textures":    textures,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

func yggdrasilError(status int, errorType, message string) (int, gin.H) {
	return status, gin.H{"error": errorType, "errorMessage": message}
}

