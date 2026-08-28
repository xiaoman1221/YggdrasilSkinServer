import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import jaJP from './locales/ja-JP'
import koKR from './locales/ko-KR'
import frFR from './locales/fr-FR'
import deDE from './locales/de-DE'
import esES from './locales/es-ES'
import ptBR from './locales/pt-BR'
import ruRU from './locales/ru-RU'

export const SUPPORTED_LANGS = {
  'zh-CN': { label: '简体中文', native: '简体中文' },
  'en-US': { label: 'English', native: 'English' },
  'ja-JP': { label: '日本語', native: '日本語' },
  'ko-KR': { label: '한국어', native: '한국어' },
  'fr-FR': { label: 'Français', native: 'Français' },
  'de-DE': { label: 'Deutsch', native: 'Deutsch' },
  'es-ES': { label: 'Español', native: 'Español' },
  'pt-BR': { label: 'Português', native: 'Português (Brasil)' },
  'ru-RU': { label: 'Русский', native: 'Русский' },
} as const

export type LangCode = keyof typeof SUPPORTED_LANGS

const STORAGE_KEY = 'yss_lang'

export function getStoredLang(): LangCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored in SUPPORTED_LANGS) return stored as LangCode
  } catch {
    /* ignore */
  }
  return 'zh-CN'
}

export function persistLang(code: LangCode) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    /* ignore */
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
    'ja-JP': { translation: jaJP },
    'ko-KR': { translation: koKR },
    'fr-FR': { translation: frFR },
    'de-DE': { translation: deDE },
    'es-ES': { translation: esES },
    'pt-BR': { translation: ptBR },
    'ru-RU': { translation: ruRU },
  },
  lng: getStoredLang(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export function setLang(code: LangCode) {
  persistLang(code)
  void i18n.changeLanguage(code)
  document.documentElement.lang = code
}

export default i18n
