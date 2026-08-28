import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getStoredThemeMode, setThemeMode, type ThemeMode } from '../lib/theme'

/** A compact three-mode theme control shared by the top bar and settings page. */
export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ThemeMode>(getStoredThemeMode)

  useEffect(() => {
    const sync = (event: Event) => setMode((event as CustomEvent<{ mode: ThemeMode }>).detail.mode)
    window.addEventListener('ts:themechange', sync)
    return () => window.removeEventListener('ts:themechange', sync)
  }, [])

  const options: { value: ThemeMode; label: string; icon: JSX.Element }[] = [
    { value: 'light', label: t('settings.theme.light'), icon: <Sun size={15} /> },
    { value: 'dark', label: t('settings.theme.dark'), icon: <Moon size={15} /> },
    { value: 'auto', label: t('settings.theme.auto'), icon: <Monitor size={15} /> },
  ]

  return (
    <div className={`theme-switcher${compact ? ' theme-switcher-compact' : ''}`} role="group" aria-label={t('settings.theme.title')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={mode === option.value ? 'active' : ''}
          aria-pressed={mode === option.value}
          title={option.label}
          onClick={() => {
            setThemeMode(option.value)
            setMode(option.value)
          }}
        >
          {option.icon}
          {!compact ? <span>{option.label}</span> : null}
        </button>
      ))}
    </div>
  )
}
