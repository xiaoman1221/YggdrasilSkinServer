export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'yss_theme'

const mql =
  typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    : null

export function systemTheme(): ResolvedTheme {
  return mql?.matches ? 'dark' : 'light'
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    if (t === 'light' || t === 'dark' || t === 'auto') return t
  } catch {
    /* ignore */
  }
  // 默认跟随系统
  return 'auto'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'auto' ? systemTheme() : mode
}

/** 把当前生效的主题色应用到 <html> 上并广播变更。 */
export function applyTheme(mode: ThemeMode) {
  const theme = resolveTheme(mode)
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('ts:themechange', { detail: { theme, mode } }))
}

export function setThemeMode(mode: ThemeMode) {
  applyTheme(mode)
}

export function initTheme() {
  // 跟随系统时监听系统切换，实时响应
  mql?.addEventListener?.('change', () => applyTheme(getStoredThemeMode()))
  applyTheme(getStoredThemeMode())
}
