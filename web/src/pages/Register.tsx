import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { authApi, OAuthProvider } from '../api/auth'
import { captchaApi } from '../api/captcha'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import AuthLangSwitch from '../components/AuthLangSwitch'
import CaptchaField, { CaptchaValue } from '../components/CaptchaField'
import { useToast } from '../components/Toast'
import { useTranslation } from 'react-i18next'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaRequired, setCaptchaRequired] = useState(false)
  const [captcha, setCaptcha] = useState<CaptchaValue>({ id: '', image: '', code: '' })
  const [oauth, setOauth] = useState<OAuthProvider[]>([])

  useEffect(() => {
    captchaApi
      .policy()
      .then((res) => {
        if (res.policy === 'always') {
          setCaptchaRequired(true)
          refreshCaptcha()
        }
      })
      .catch(() => {})
    authApi
      .oauthProviders()
      .then((res) => {
        if (res.enabled) setOauth((res.providers || []).filter((p) => p.allowed !== false))
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
      toast.show(err?.response?.data?.error?.message || err.message || t('register.toast.oauthUrlFailed'), 'err')
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      toast.show(t('register.toast.usernameInvalid'), 'err')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.show(t('register.toast.emailInvalid'), 'err')
      return
    }
    if (password.length < 6) {
      toast.show(t('register.toast.passwordTooShort'), 'err')
      return
    }
    if (captchaRequired && (!captcha.id || !captcha.code.trim())) {
      toast.show(t('register.toast.captchaRequired'), 'err')
      return
    }
    setBusy(true)
    try {
      await register(username, email, password, {
        captchaId: captchaRequired ? captcha.id : undefined,
        captchaCode: captchaRequired ? captcha.code.trim() : undefined,
      })
      toast.show(t('register.toast.registerSuccess'), 'ok')
      navigate('/login', { replace: true })
    } catch (err: any) {
      if (err?.response?.data?.error?.details?.captcha) {
        refreshCaptcha()
      }
      toast.show(err?.response?.data?.error?.message || err.message || t('register.toast.registerFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside tagline={t('register.tagline')} />

      <main className="auth-main">
        <AuthLangSwitch />
        <form className="auth-form" onSubmit={onSubmit}>
          <div>
            <h1>{t('register.title')}</h1>
            <p className="hint">{t('register.hint')}</p>
          </div>
          <div className="fields">
            <Field label={t('register.field.username')}>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('register.field.usernamePlaceholder')}
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label={t('register.field.email')}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('register.field.emailPlaceholder')}
                autoComplete="email"
              />
            </Field>
            <Field label={t('register.field.password')} hint={t('register.field.passwordHint')}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
            {captchaRequired ? (
              <CaptchaField value={captcha} onChange={setCaptcha} onRefresh={refreshCaptcha} />
            ) : null}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {t('register.btn.register')}
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
            {oauth.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <span className="field-label">{t('register.oauthLabel')}</span>
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
          <p className="auth-switch">
            {t('register.switch.hasAccount')}<Link to="/login">{t('register.switch.login')}</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
