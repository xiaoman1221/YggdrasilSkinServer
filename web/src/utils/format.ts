/** 将字节数格式化为可读的 KB / MB 字符串。 */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

/** 头像/纹理 URL 统一解析：外部绝对地址直接返回，站内地址转为相对路径。 */
export function assetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  try {
    const u = new URL(url, window.location.origin)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.pathname
  } catch {
    /* 非法 URL 返回空串，避免 javascript:/data: 等协议被用作资源地址 */
  }
  return ''
}

/**
 * 安全外部链接：仅允许 http(s) 或同源相对路径，用于渲染用户可控的跳转地址
 * （如购买链接），杜绝 javascript:/data: 等协议造成的存储型 XSS。
 * 返回空串表示该地址不安全，调用方应隐藏链接。
 */
export function safeExternalUrl(url: string | undefined | null): string {
  if (!url) return ''
  try {
    const u = new URL(url, window.location.origin)
    if (u.protocol === 'http:' || u.protocol === 'https:') return url
    if (u.origin === window.location.origin) return u.pathname + u.search + u.hash
  } catch {
    /* ignore */
  }
  return ''
}
