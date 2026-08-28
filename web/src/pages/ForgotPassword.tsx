import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api/auth'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import AuthLangSwitch from '../components/AuthLangSwitch'
import { useToast } from '../components/Toast'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    try {
      await authApi.forgotPassword(email.trim())
      setSent(true)
    } catch (err: any) {
      toast.show(err?.message || t('forgotPassword.toast.sendFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside tagline={t('forgotPassword.tagline')} />
      <main className="auth-main">
        <AuthLangSwitch />
        {sent ? (
          <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
            <div>
              <h1>{t('forgotPassword.sent.title')}</h1>
              <p className="hint">{t('forgotPassword.sent.hint')}</p>
            </div>
            <p className="auth-switch">
              <Link to="/login">{t('forgotPassword.link.backToLogin')}</Link>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div>
              <h1>{t('forgotPassword.title')}</h1>
              <p className="hint">{t('forgotPassword.hint')}</p>
            </div>
            <div className="fields">
              <Field label={t('forgotPassword.field.email')}>
                <Input
                  className="mono"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('forgotPassword.field.emailPlaceholder')}
                  autoFocus
                />
              </Field>
              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                {busy ? t('forgotPassword.btn.sending') : t('forgotPassword.btn.send')}
              </Button>
            </div>
            <p className="auth-switch">
              <Link to="/login">{t('forgotPassword.link.backToLogin')}</Link>
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
