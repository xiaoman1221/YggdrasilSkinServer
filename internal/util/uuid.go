package util

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// NewUUID 生成一个带连字符的随机 UUID（用于 Minecraft 档案）。
func NewUUID() string {
	return uuid.NewString()
}

// NormalizeUUID 移除连字符，返回 32 位无连字符 UUID。
func NormalizeUUID(id string) string {
	return strings.ReplaceAll(strings.ToLower(id), "-", "")
}

// ToHyphenatedUUID 将 32 位无连字符的 UUID 还原为 8-4-4-4-12 带连字符格式。
func ToHyphenatedUUID(normalized string) string {
	normalized = strings.ToLower(normalized)
	if len(normalized) != 32 || strings.Contains(normalized, "-") {
		return normalized
	}
	return normalized[0:8] + "-" + normalized[8:12] + "-" + normalized[12:16] + "-" + normalized[16:20] + "-" + normalized[20:32]
}

// UUIDQueryFormats 返回同一 UUID 在库中可能存在的两种存储格式（带/不带连字符），
// 用于替代 REPLACE(uuid,...) 这类无法命中索引的查询条件。
func UUIDQueryFormats(uuid string) []string {
	normalized := NormalizeUUID(uuid)
	return []string{normalized, ToHyphenatedUUID(normalized)}
}

// IsHex 判断字符串是否为非空十六进制串。
func IsHex(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}
	return true
}

// RandomToken 生成用于 Yggdrasil accessToken 的随机十六进制字符串。
func RandomToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// 理论上不会失败；失败时退化为时间戳+随机数，避免 panic
		return fmt.Sprintf("%d-%x", time.Now().UnixNano(), b)
	}
	return hex.EncodeToString(b)
}
