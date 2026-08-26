/** 将字节数格式化为可读的 KB / MB 字符串。 */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}
