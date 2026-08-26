import { useEffect, useState } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { authApi, OAuthProvider } from '../api/auth'
import { captchaApi } from '../api/captcha'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import CaptchaField, { CaptchaValue } from '../components/CaptchaField'
import { useToast } from '../components/Toast'
import { getPasskey } from '../lib/webauthn'

export default function Login() {
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
      toast.show(err?.message || '获取授权地址失败', 'err')
    }
  }

  async function passkeyLogin() {
    if (!account.trim()) {
      toast.show('请先输入邮箱或用户名', 'err')
      return
    }
    setBusy(true)
    try {
      const { sessionId, options } = await authApi.passkeyLoginBegin(account.trim())
      const response = await getPasskey(options)
      const res = await authApi.passkeyLoginFinish(sessionId, response)
      localStorage.setItem('yss_access_token', res.accessToken)
      localStorage.setItem('yss_refresh_token', res.refreshToken)
      toast.show('登录成功', 'ok')
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '通行密钥登录失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!account || !password) {
      toast.show('请输入账号与密码', 'err')
      return
    }
    if (captchaRequired && (!captcha.id || !captcha.code.trim())) {
      toast.show('请输入图形验证码', 'err')
      return
    }
    setBusy(true)
    try {
      await login(account, password, {
        captchaId: captchaRequired ? captcha.id : undefined,
        captchaCode: captchaRequired ? captcha.code.trim() : undefined,
      })
      toast.show('登录成功', 'ok')
      navigate('/', { replace: true })
    } catch (err: any) {
      if (err?.response?.data?.error?.details?.captcha) {
        setCaptchaRequired(true)
        refreshCaptcha()
      }
      toast.show(err?.response?.data?.error?.message || err.message || '登录失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside
        tagline={
          <>
            自托管 Minecraft 皮肤站与 Yggdrasil 认证服务器。
            <br />
            天上如是，地下亦然。
          </>
        }
      />

      <main className="auth-main">
        <form className="auth-form" onSubmit={onSubmit}>
          <div>
            <h1>登录</h1>
            <p className="hint">使用邮箱或用户名</p>
          </div>
          <div className="fields">
            <Field label="邮箱或用户名">
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="you@example.com / Steve"
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="密码">
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
              登录
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={passkeyLogin}>
              <KeyRound size={16} strokeWidth={1.5} />
              使用通行密钥登录
            </Button>
            {oauth.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <span className="field-label">第三方登录</span>
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
            <Link to="/register">注册</Link>
            <Link to="/forgot-password">忘记密码</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
