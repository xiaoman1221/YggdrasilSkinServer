import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api/auth'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import { useToast } from '../components/Toast'

export default function ResetPassword() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      toast.show(t('resetPassword.toast.missingToken'), 'err')
      return
    }
    if (password.length < 6) {
      toast.show(t('resetPassword.toast.passwordTooShort'), 'err')
      return
    }
    if (password !== confirm) {
      toast.show(t('resetPassword.toast.passwordMismatch'), 'err')
      return
    }
    setBusy(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err: any) {
      toast.show(err?.message || t('resetPassword.toast.resetFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside tagline={t('resetPassword.tagline')} />
      <main className="auth-main">
        {done ? (
          <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
            <div>
              <h1>{t('resetPassword.done.title')}</h1>
              <p className="hint">{t('resetPassword.done.hint')}</p>
            </div>
            <p className="auth-switch">
              <Link to="/login">{t('resetPassword.done.linkLogin')}</Link>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div>
              <h1>{t('resetPassword.title')}</h1>
              <p className="hint">{token ? t('resetPassword.hint.enterPassword') : t('resetPassword.hint.missingToken')}</p>
            </div>
            <div className="fields">
              <Field label={t('resetPassword.field.newPassword')} hint={t('resetPassword.field.newPasswordHint')}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
              </Field>
              <Field label={t('resetPassword.field.confirmPassword')}>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </Field>
              <Button type="submit" variant="primary" size="lg" disabled={busy || !token}>
                {busy ? t('resetPassword.btn.submitting') : t('resetPassword.btn.reset')}
              </Button>
            </div>
            <p className="auth-switch">
              <Link to="/login">{t('resetPassword.link.backToLogin')}</Link>
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
