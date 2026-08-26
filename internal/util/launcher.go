package util

import "strings"

// 常见启动器特征（按优先级匹配，小写子串）。
var launcherPatterns = []struct {
	name string
	pat  string
}{
	{"HMCL", "hmcl"},
	{"PCL", "pcl"},
	{"BakaXL", "bakaxl"},
	{"MultiMC", "multimc"},
	{"Prism Launcher", "prism"},
	{"ATLauncher", "atlauncher"},
	{"GDLauncher", "gdlauncher"},
	{"Lunar Client", "lunarclient"},
	{"CurseForge", "curseforge"},
	{"Modrinth", "modrinth"},
	{"FCL", "fcl"},
	{"Minecraft Launcher", "minecraft launcher"},
}

// DetectLauncher 从 User-Agent 解析启动器名称；无法识别时返回「未知」。
func DetectLauncher(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if strings.TrimSpace(ua) == "" {
		return "未知"
	}
	for _, p := range launcherPatterns {
		if strings.Contains(ua, p.pat) {
			return p.name
		}
	}
	// 兜底：取 UA 首段（如 "CustomLauncher/1.0"）
	first := strings.TrimSpace(userAgent)
	if idx := strings.IndexAny(first, " /("); idx > 0 {
		first = first[:idx]
	}
	if first != "" && len(first) <= 32 {
		return first
	}
	return "未知"
}
