import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Field, Input } from './ui'

export interface CaptchaValue {
  id: string
  image: string
  code: string
}

export default function CaptchaField({
  value,
  onChange,
  onRefresh,
}: {
  value: CaptchaValue
  onChange: (v: CaptchaValue) => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <Field label={t('captcha.label')} hint={t('captcha.hint')}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <Input
          className="mono"
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          placeholder={t('captcha.placeholder')}
          autoComplete="off"
          maxLength={8}
        />
        {value.image ? (
          <img
            src={value.image}
            alt={t('captcha.imageAlt')}
            title={t('captcha.imageTitle')}
            onClick={onRefresh}
            style={{
              width: 110,
              height: 42,
              cursor: 'pointer',
              borderRadius: 6,
              border: '1px solid var(--line)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 110, height: 42 }}
            onClick={onRefresh}
            title={t('captcha.refreshTitle')}
          >
            <RefreshCw size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </Field>
  )
}
