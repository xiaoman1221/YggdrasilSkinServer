/** 将字节数格式化为可读的 KB / MB 字符串。 */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

/** 头像/纹理 URL 统一解析：外部绝对地址直接返回，站内地址转为相对路径。 */
export function assetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return new URL(url, window.location.origin).pathname
}
