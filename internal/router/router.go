package router

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/handler"
	"YggdrasilSkinServer/internal/middleware"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Setup 构建 Gin 引擎并注册全部路由。
func Setup(cfg *config.Config) *gin.Engine {
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length", "X-Authlib-Injector-API-Location"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	// 静态纹理与模型文件：内容 hash 命名，内容不可变，可长缓存
	immutable := func() gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
			c.Next()
		}
	}
	texturesGroup := r.Group("/", immutable())
	texturesGroup.Static("/textures", cfg.Storage.TextureDir)

	// 前端托管：web/dist 存在时由后端直接提供 SPA，否则提供最小首页
	registerWebFrontend(r, cfg)

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 服务层
	settingsSvc := service.NewSettingService(database.DB)
	loginRecordSvc := service.NewLoginRecordService(database.DB)
	mojangSvc := service.NewMojangService(cfg, settingsSvc)
	log.Printf("[mojang] enabled=%v client_id=%q redirect=%q", mojangSvc.Enabled(), cfg.Microsoft.ClientID, cfg.Microsoft.RedirectURI)
	if err := settingsSvc.Seed(cfg); err != nil {
		log.Printf("[settings] seed failed: %v", err)
	}
	authSvc := service.NewAuthService(database.DB, cfg, settingsSvc)
	profileSvc := service.NewProfileService(database.DB, cfg)
	textureSvc := service.NewTextureService(database.DB, cfg, settingsSvc)
	ysmSvc := service.NewYsmService(database.DB, cfg, settingsSvc)
	librarySvc := service.NewTextureLibraryService(database.DB, cfg)
	yggSvc := service.NewYggdrasilService(database.DB, cfg, textureSvc, loginRecordSvc, settingsSvc)
	mailSvc := service.NewMailService(settingsSvc, cfg)
	oauthSvc := service.NewOauthGoService(settingsSvc, cfg)
	captchaSvc := service.NewCaptchaService(settingsSvc)
	passkeySvc, err := service.NewPasskeyService(database.DB, cfg, settingsSvc)
	if err != nil {
		log.Printf("[passkey] WebAuthn disabled: %v", err)
		passkeySvc = nil
	}

	// 处理器
	authHandler := handler.NewAuthHandler(authSvc, textureSvc, mailSvc, oauthSvc, settingsSvc, captchaSvc, passkeySvc)
	captchaHandler := handler.NewCaptchaHandler(captchaSvc)
	profileHandler := handler.NewProfileHandler(profileSvc, textureSvc)
	ysmHandler := handler.NewYsmHandler(ysmSvc, profileSvc, cfg)
	wardrobeHandler := handler.NewWardrobeHandler(textureSvc, librarySvc)
	libraryHandler := handler.NewTextureLibraryHandler(librarySvc, textureSvc)
	adminHandler := handler.NewAdminHandler(profileSvc, librarySvc, textureSvc, settingsSvc, mailSvc, authSvc)
	siteHandler := handler.NewSiteHandler(settingsSvc, mojangSvc)
	loginRecordHandler := handler.NewLoginRecordHandler(loginRecordSvc)
	mojangHandler := handler.NewMojangHandler(cfg, mojangSvc, textureSvc)
	yggHandler := handler.NewYggdrasilHandler(yggSvc)

	registerYggdrasilRoutes(r, yggHandler)
	registerV1Routes(r, cfg, authHandler, captchaHandler, profileHandler, wardrobeHandler, libraryHandler, adminHandler, siteHandler, loginRecordHandler, mojangHandler, ysmHandler)
	// YSM 模型下载：免费模型公开，付费模型由 handler 校验作者/管理员权限
	r.GET("/ysm/:file", ysmHandler.ServeFile)

	return r
}

// registerYggdrasilRoutes 注册 Yggdrasil 协议路由（原生响应，不套 envelope）。
func registerYggdrasilRoutes(r *gin.Engine, h *handler.YggdrasilHandler) {
	y := r.Group("/api/yggdrasil")
	{
		y.GET("", h.Metadata)
		y.GET("/", h.Metadata)

		auth := y.Group("/authserver")
		{
			auth.POST("/authenticate", h.Authenticate)
			auth.POST("/refresh", h.Refresh)
			auth.POST("/validate", h.Validate)
			auth.POST("/invalidate", h.Invalidate)
			auth.POST("/signout", h.Signout)
		}

		sess := y.Group("/sessionserver/session/minecraft")
		{
			sess.POST("/join", h.Join)
			sess.GET("/hasJoined", h.HasJoined)
			sess.GET("/profile/:uuid", h.Profile)
		}

		api := y.Group("/api")
		{
			api.POST("/profiles/minecraft", h.ProfilesMinecraft)
			up := api.Group("/user/profile/:uuid")
			{
				up.GET("", h.UserProfile)
				up.GET("/names", h.UserNames)
				up.PUT("/:type", h.UploadTexture) // skin|cape
				up.DELETE("/:type", h.DeleteTexture)
			}
		}

		y.GET("/textures/:hash", h.Texture)
		y.GET("/keys", h.Keys)
	}
}

// registerV1Routes 注册项目 API 路由（统一 envelope）。
func registerV1Routes(
	r *gin.Engine,
	cfg *config.Config,
	authHandler *handler.AuthHandler,
	captchaHandler *handler.CaptchaHandler,
	profileHandler *handler.ProfileHandler,
	wardrobeHandler *handler.WardrobeHandler,
	libraryHandler *handler.TextureLibraryHandler,
	adminHandler *handler.AdminHandler,
	siteHandler *handler.SiteHandler,
	loginRecordHandler *handler.LoginRecordHandler,
	mojangHandler *handler.MojangHandler,
	ysmHandler *handler.YsmHandler,
) {
	v1 := r.Group("/api/v1")

	// 公开站点信息
	v1.GET("/site/info", siteHandler.Info)
	v1.GET("/auth/mojang/callback", mojangHandler.Callback)
	// 图形验证码
	v1.GET("/captcha", captchaHandler.Get)
	v1.GET("/captcha/policy", captchaHandler.Policy)

	// 账号与站点 API
	auth := v1.Group("/auth")
	{
		auth.POST("/setup", authHandler.Setup)
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/refresh", authHandler.Refresh)
		auth.POST("/logout", authHandler.Logout)
		auth.GET("/me", middleware.AuthRequired(cfg), authHandler.Me)
		auth.GET("/sessions", middleware.AuthRequired(cfg), authHandler.ListSessions)
		auth.DELETE("/sessions", middleware.AuthRequired(cfg), authHandler.RevokeOtherSessions)
		auth.DELETE("/sessions/:id", middleware.AuthRequired(cfg), authHandler.RevokeSession)
		auth.PUT("/avatar", middleware.AuthRequired(cfg), authHandler.SetAvatar)
		auth.POST("/avatar/upload", middleware.AuthRequired(cfg), authHandler.UploadAvatar)
		auth.DELETE("/avatar", middleware.AuthRequired(cfg), authHandler.ClearAvatar)
		auth.GET("/login-records", middleware.AuthRequired(cfg), loginRecordHandler.Mine)
		auth.GET("/mojang/authorize", middleware.AuthRequired(cfg), mojangHandler.Authorize)
		// 个人资料与密码
		auth.PUT("/profile", middleware.AuthRequired(cfg), authHandler.UpdateProfile)
		auth.PUT("/password", middleware.AuthRequired(cfg), authHandler.ChangePassword)
		// 忘记密码
		auth.POST("/forgot-password", authHandler.ForgotPassword)
		auth.POST("/reset-password", authHandler.ResetPassword)
		// OauthGo 第三方登录
		auth.GET("/oauth/providers", authHandler.OAuthProviders)
		auth.GET("/oauth/authorize", authHandler.OAuthAuthorize)
		auth.GET("/oauth/callback", authHandler.OAuthCallback)
		// Passkey / WebAuthn 通行密钥登录
		auth.POST("/passkey/login/begin", authHandler.PasskeyBeginLogin)
		auth.POST("/passkey/login/finish", authHandler.PasskeyFinishLogin)
		passkey := auth.Group("/passkey", middleware.AuthRequired(cfg))
		{
			passkey.POST("/register/begin", authHandler.PasskeyBeginRegistration)
			passkey.POST("/register/finish", authHandler.PasskeyFinishRegistration)
			passkey.GET("/credentials", authHandler.PasskeyCredentials)
			passkey.DELETE("/credentials/:id", authHandler.PasskeyRemove)
		}
	}

	// Minecraft profile（当前用户）
	profiles := v1.Group("/profiles/minecraft", middleware.AuthRequired(cfg))
	{
		profiles.GET("", profileHandler.List)
		profiles.POST("", profileHandler.Create)
		profiles.GET("/:uuid/textures", profileHandler.Textures)
		profiles.PUT("/:uuid/textures/:type", profileHandler.BindTexture)
		profiles.DELETE("/:uuid/textures/:type", profileHandler.UnbindTexture)
		profiles.PUT("/:uuid/name", profileHandler.Rename)
		profiles.PUT("/:uuid/ysm/:model_id", ysmHandler.Bind)
		profiles.DELETE("/:uuid/ysm", ysmHandler.Unbind)
		profiles.DELETE("/:uuid", profileHandler.Delete)
	}

	// wardrobe 材质
	wardrobe := v1.Group("/wardrobe", middleware.AuthRequired(cfg))
	{
		wardrobe.GET("/textures", wardrobeHandler.List)
		wardrobe.POST("/textures/:texture_id", wardrobeHandler.Upload)
		wardrobe.PUT("/textures/:texture_id", wardrobeHandler.Update)
		wardrobe.DELETE("/textures/:texture_id", wardrobeHandler.Delete)
		wardrobe.POST("/textures/:texture_id/library-submission", wardrobeHandler.SubmitLibrary)
		wardrobe.DELETE("/textures/:texture_id/library-submission", wardrobeHandler.RemoveSubmission)
		wardrobe.GET("/ysm", ysmHandler.List)
		wardrobe.POST("/ysm", ysmHandler.Upload)
		wardrobe.PUT("/ysm/:model_id", ysmHandler.UpdateMeta)
		wardrobe.DELETE("/ysm/:model_id", ysmHandler.Delete)
	}

	// 公共材质库
	library := v1.Group("/texture-library")
	{
		library.GET("/tags", libraryHandler.Tags)
		library.GET("/textures", libraryHandler.List)
		library.GET("/textures/:texture_id", libraryHandler.Get)

		libraryAuth := library.Group("/textures/:texture_id", middleware.AuthRequired(cfg))
		{
			libraryAuth.POST("/copy", libraryHandler.Copy)
			libraryAuth.POST("/reports", libraryHandler.Report)
		}
	}

	// 管理员 API（admin 拥有全部权限）
	admin := v1.Group("/admin", middleware.AuthRequired(cfg), middleware.RequirePermission(model.PermAdmin))
	{
		admin.GET("/minecraft-profiles", adminHandler.ListProfiles)
		admin.GET("/minecraft-profiles/:uuid", adminHandler.GetProfile)
		admin.GET("/minecraft-profiles/:uuid/textures", adminHandler.ProfileTextures)
		admin.DELETE("/minecraft-profiles/:uuid/textures/:type", adminHandler.UnbindTexture)
		admin.DELETE("/minecraft-textures/:hash", adminHandler.DeleteTextureFile)
		admin.PUT("/minecraft-profiles/:uuid/name", adminHandler.RenameProfile)
		admin.DELETE("/minecraft-profiles/:uuid", adminHandler.DeleteProfile)
		admin.GET("/audit-logs", adminHandler.AuditLogs)
		admin.GET("/login-records", loginRecordHandler.AdminList)
		admin.GET("/textures", adminHandler.ListTextures)
		admin.DELETE("/textures/:texture_id", adminHandler.DeleteTextureByID)
		admin.GET("/ysm", ysmHandler.AdminList)
		admin.DELETE("/ysm/:model_id", ysmHandler.AdminDelete)
		admin.DELETE("/login-records/:record_id", loginRecordHandler.AdminDelete)
		admin.POST("/login-records/batch-delete", loginRecordHandler.AdminBatchDelete)
	}

	// 用户管理（admin 或拥有 user_manage scope 的 operator）
	userAdmin := v1.Group("/admin/users",
		middleware.AuthRequired(cfg), middleware.RequireAnyPermission(model.PermUserManage))
	{
		userAdmin.GET("", adminHandler.ListUsers)
		userAdmin.GET("/:user_id/minecraft-profiles", adminHandler.ListUserProfiles)
		userAdmin.PUT("/:user_id", adminHandler.UpdateUser)
		userAdmin.PUT("/:user_id/permissions", adminHandler.SetUserPermissions)
		userAdmin.DELETE("/:user_id", adminHandler.DeleteUser)
	}

	// 材质库管理（admin 或拥有 texture_library scope 的 operator）
	libAdmin := v1.Group("/admin/texture-library",
		middleware.AuthRequired(cfg), middleware.RequireAnyPermission(model.PermTextureLibrary))
	{
		libAdmin.GET("/textures", adminHandler.LibraryTextures)
		libAdmin.POST("/textures/:texture_id/:action", adminHandler.SetLibraryStatus)
		libAdmin.GET("/reports", adminHandler.Reports)
		libAdmin.POST("/reports/:report_id/:action", adminHandler.HandleReport)
	}

	// 站点基础设置（超级管理员 UID=1）
	superAdmin := v1.Group("/admin/settings", middleware.AuthRequired(cfg), middleware.RequireSuperAdmin())
	{
		superAdmin.GET("", adminHandler.GetSettings)
		superAdmin.PUT("", adminHandler.UpdateSettings)
		superAdmin.POST("/email-test", adminHandler.EmailTest)
	}
}

// registerWebFrontend 托管前端构建产物（web/dist）：
//   - /assets/* 静态资源
//   - 首页 / 返回 index.html 并带 X-Authlib-Injector-API-Location 头
//   - 未匹配的非 API 路径回退到 index.html（SPA），/api、/textures 保持 JSON 404
//
// 每次请求动态检查 dist 是否存在：启动后构建前端无需重启即可生效。
func registerWebFrontend(r *gin.Engine, cfg *config.Config) {
	dist := cfg.Server.WebDist
	index := filepath.Join(dist, "index.html")

	serveIndex := func(c *gin.Context) {
		c.Header("X-Authlib-Injector-API-Location", "/api/yggdrasil/")
		if _, err := os.Stat(index); err == nil {
			c.File(index)
			return
		}
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, "<h1>YggdrasilSkinServer</h1><p>Authlib-injector API location: <code>/api/yggdrasil/</code></p>")
	}

	if _, err := os.Stat(dist); err == nil {
		r.Static("/assets", filepath.Join(dist, "assets"))
	}

	r.GET("/", serveIndex)

	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/textures/") || strings.HasPrefix(p, "/ysm/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		// 真实存在的静态文件（favicon 等）直接返回，否则回退 SPA
		fp := filepath.Join(dist, filepath.FromSlash(p))
		if info, err := os.Stat(fp); err == nil && !info.IsDir() {
			c.File(fp)
			return
		}
		serveIndex(c)
	})
}
