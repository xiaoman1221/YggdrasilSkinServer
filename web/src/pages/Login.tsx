import { useEffect, useState } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import { authApi, OAuthProvider } from '../api/auth'
import { captchaApi } from '../api/captcha'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import AuthLangSwitch from '../components/AuthLangSwitch'
import CaptchaField, { CaptchaValue } from '../components/CaptchaField'
import { useToast } from '../components/Toast'
import { getPasskey } from '../lib/webauthn'

export default function Login() {
  const { t } = useTranslation()
  const { login, refreshUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [oauth, setOauth] = useState<OAuthProvider[]>([])
  const [captchaPolicy, setCaptchaPolicy] = useState('off')
  const [captchaRequired, setCaptchaRequired] = useState(false)
  const [captcha, setCaptcha] = useState<CaptchaValue>({ id: '', image: '', code: '' })

  useEffect(() => {
    authApi
      .oauthProviders()
      .then((res) => {
        if (res.enabled) setOauth((res.providers || []).filter((p) => p.allowed !== false))
      })
      .catch(() => {})
    captchaApi
      .policy()
      .then((res) => {
        setCaptchaPolicy(res.policy || 'off')
        if (res.policy === 'always') {
          setCaptchaRequired(true)
          refreshCaptcha()
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshCaptcha() {
    try {
      const res = await captchaApi.get()
      setCaptcha((prev) => ({ ...prev, id: res.id, image: res.image, code: '' }))
    } catch {
      /* ignore */
    }
  }

  async function oauthLogin(type: string) {
    try {
      const res = await authApi.oauthAuthorize(type)
      window.location.href = res.url
    } catch (err: any) {
      toast.show(err?.message || t('login.toast.oauthUrlFailed'), 'err')
    }
  }

  async function passkeyLogin() {
    if (!account.trim()) {
      toast.show(t('login.toast.accountRequired'), 'err')
      return
    }
    setBusy(true)
    try {
      const { sessionId, options } = await authApi.passkeyLoginBegin(account.trim())
      const response = await getPasskey(options)
      const res = await authApi.passkeyLoginFinish(sessionId, response)
      localStorage.setItem('yss_access_token', res.accessToken)
      localStorage.setItem('yss_refresh_token', res.refreshToken)
      toast.show(t('login.toast.loginSuccess'), 'ok')
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('login.toast.passkeyFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!account || !password) {
      toast.show(t('login.toast.credentialsRequired'), 'err')
      return
    }
    if (captchaRequired && (!captcha.id || !captcha.code.trim())) {
      toast.show(t('login.toast.captchaRequired'), 'err')
      return
    }
    setBusy(true)
    try {
      await login(account, password, {
        captchaId: captchaRequired ? captcha.id : undefined,
        captchaCode: captchaRequired ? captcha.code.trim() : undefined,
      })
      toast.show(t('login.toast.loginSuccess'), 'ok')
      navigate('/', { replace: true })
    } catch (err: any) {
      if (err?.response?.data?.error?.details?.captcha) {
        setCaptchaRequired(true)
        refreshCaptcha()
      }
      toast.show(err?.response?.data?.error?.message || err.message || t('login.toast.loginFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside
        tagline={
          <>
            {t('login.tagline1')}
            <br />
            {t('login.tagline2')}
          </>
        }
      />

      <main className="auth-main">
        <AuthLangSwitch />
        <form className="auth-form" onSubmit={onSubmit}>
          <div>
            <h1>{t('login.title')}</h1>
            <p className="hint">{t('login.hint')}</p>
          </div>
          <div className="fields">
            <Field label={t('login.field.account')}>
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={t('login.field.accountPlaceholder')}
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label={t('login.field.password')}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Field>
            {captchaRequired || captchaPolicy === 'always' ? (
              <CaptchaField value={captcha} onChange={setCaptcha} onRefresh={refreshCaptcha} />
            ) : null}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {t('login.btn.login')}
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={passkeyLogin}>
              <KeyRound size={16} strokeWidth={1.5} />
              {t('login.btn.passkey')}
            </Button>
            {oauth.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <span className="field-label">{t('login.oauthLabel')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {oauth.map((p) => (
                    <Button key={p.name} size="sm" onClick={() => oauthLogin(p.name)}>
                      {p.display_name || p.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <p className="auth-switch" style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <Link to="/register">{t('login.link.register')}</Link>
            <Link to="/forgot-password">{t('login.link.forgotPassword')}</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
