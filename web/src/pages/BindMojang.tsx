import { useEffect } from 'react'
import { BadgeCheck, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { useTranslation } from 'react-i18next'

export default function BindMojang() {
  const [params] = useSearchParams()
  const { refreshUser } = useAuth()
  const { t } = useTranslation()
  const result = params.get('result')
  const message = params.get('message')
  const name = params.get('name')
  const uuid = params.get('uuid')
  const profileName = params.get('profile')

  useEffect(() => {
    if (result === 'success') refreshUser()
  }, [result, refreshUser])

  const success = result === 'success'

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <header className="page-head">
        <h1 className="page-title">{t('bindMojang.title')}</h1>
        <p className="page-sub">{t('bindMojang.subtitle')}</p>
      </header>

      <div className="panel">
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
          {success ? (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ok)', fontWeight: 600, margin: 0 }}>
                <BadgeCheck size={20} strokeWidth={1.5} />
                {t('bindMojang.success.title')}
              </p>
              <dl className="kv">
                <dt>{t('bindMojang.success.fieldPremiumName')}</dt>
                <dd>{name || '—'}</dd>
                <dt>{t('bindMojang.success.fieldPremiumUuid')}</dt>
                <dd>{uuid || '—'}</dd>
              </dl>
              <p className="data" style={{ margin: 0, color: 'var(--text-3)' }}>
                {t('bindMojang.success.detail', { name: profileName || name || '—' })}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Link to="/" className="btn btn-primary">{t('bindMojang.btnBack')}</Link>
              </div>
            </>
          ) : (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', fontWeight: 600, margin: 0 }}>
                <XCircle size={20} strokeWidth={1.5} />
                {t('bindMojang.fail.title')}
              </p>
              <p className="data" style={{ margin: 0 }}>{message || t('bindMojang.fail.unknownError')}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Link to="/" className="btn btn-primary">{t('bindMojang.btnBack')}</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
