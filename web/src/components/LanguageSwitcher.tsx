import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Languages } from 'lucide-react'
import { SUPPORTED_LANGS, type LangCode, setLang } from '../i18n'

export default function LanguageSwitcher({ variant = 'topbar' }: { variant?: 'topbar' | 'settings' }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const current = (i18n.language || 'zh-CN') in SUPPORTED_LANGS ? (i18n.language as LangCode) : ('zh-CN' as LangCode)

  if (variant === 'settings') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
        {(Object.keys(SUPPORTED_LANGS) as LangCode[]).map((code) => {
          const active = code === current
          return (
            <button
              key={code}
              type="button"
              className={`btn ${active ? 'btn-primary' : 'btn-outline'}`}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => setLang(code)}
            >
              {active ? <Check size={16} strokeWidth={2} /> : <Languages size={16} strokeWidth={1.5} />}
              {SUPPORTED_LANGS[code].native}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="lang-switch-wrap" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title={SUPPORTED_LANGS[current].label}
        onClick={() => setOpen((o) => !o)}
      >
        <Languages size={15} strokeWidth={1.5} />
        {SUPPORTED_LANGS[current].native}
      </button>
      {open ? (
        <div
          className="lang-dropdown"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 100,
            minWidth: 172,
            background: 'var(--bg2, #fff)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {(Object.keys(SUPPORTED_LANGS) as LangCode[]).map((code) => {
            const active = code === current
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLang(code)
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontSize: 13,
                  textAlign: 'left',
                  color: 'var(--text, inherit)',
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--line, #eee)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {SUPPORTED_LANGS[code].native}
                {active ? (
                  <Check size={14} strokeWidth={2.5} style={{ marginLeft: 'auto' }} />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
