package middleware

import (
	"errors"
	"net/http"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/model"
	"YggdrasilSkinServer/internal/util"

	"github.com/gin-gonic/gin"
)

const (
	// ContextUserID 是 Gin Context 中用户 ID 的键。
	ContextUserID = "user_id"
	// ContextUsername 是 Gin Context 中用户名的键。
	ContextUsername = "username"
	// ContextUser 是 Gin Context 中已加载的当前用户对象的键。
	ContextUser = "current_user"
)

// AuthRequired 校验 Authorization: Bearer <jwt>，通过后把用户信息写入 Context。
func AuthRequired(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		tokenString := strings.TrimPrefix(header, "Bearer ")
		claims, err := util.ParseToken(cfg.JWT.Secret, tokenString)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextUsername, claims.Username)
		c.Next()
	}
}

// CurrentUser 从 Context 读取当前登录用户；同一请求内缓存查询结果，避免重复查库。
func CurrentUser(c *gin.Context) (*model.User, error) {
	if v, ok := c.Get(ContextUser); ok {
		if user, _ := v.(*model.User); user != nil {
			return user, nil
		}
	}
	idVal, exists := c.Get(ContextUserID)
	if !exists {
		return nil, errors.New("not authenticated")
	}
	uid, ok := idVal.(uint)
	if !ok {
		return nil, errors.New("invalid user id")
	}
	var user model.User
	if err := database.DB.First(&user, uid).Error; err != nil {
		return nil, err
	}
	c.Set(ContextUser, &user)
	return &user, nil
}

// RequirePermission 校验当前用户是否拥有指定权限。
func RequirePermission(perm string) gin.HandlerFunc {
	return RequireAnyPermission(perm)
}

// RequireAnyPermission 校验当前用户是否拥有任一指定权限。
// 超级管理员（UID=1）与 admin 权限拥有全部权限。
func RequireAnyPermission(perms ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := CurrentUser(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if user.ID == 1 || user.HasPermission(model.PermAdmin) {
			c.Next()
			return
		}
		for _, p := range perms {
			if user.HasPermission(p) {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	}
}

// RequireSuperAdmin 校验当前用户是否为超级管理员（UID = 1）。
func RequireSuperAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := CurrentUser(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if user.ID != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "super admin only"})
			return
		}
		c.Next()
	}
}
