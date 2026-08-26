package util

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims 是站点自身 JWT 的载荷（与 Yggdrasil 令牌相互独立）。
type Claims struct {
	UserID   uint   `json:"uid"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateToken 为用户生成 JWT。
func GenerateToken(secret string, expire time.Duration, userID uint, username string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expire)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "YggdrasilSkinServer",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// ParseToken 解析并校验 JWT，返回 Claims。
func ParseToken(secret, tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
