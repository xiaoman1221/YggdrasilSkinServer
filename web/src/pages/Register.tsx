import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { authApi, OAuthProvider } from '../api/auth'
import { captchaApi } from '../api/captcha'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import CaptchaField, { CaptchaValue } from '../components/CaptchaField'
import { useToast } from '../components/Toast'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
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
      toast.show(err?.response?.data?.error?.message || err.message || '获取授权地址失败', 'err')
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      toast.show('用户名需为 3-16 位字母数字下划线', 'err')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.show('请输入有效邮箱', 'err')
      return
    }
    if (password.length < 6) {
      toast.show('密码至少 6 位', 'err')
      return
    }
    if (captchaRequired && (!captcha.id || !captcha.code.trim())) {
      toast.show('请输入图形验证码', 'err')
      return
    }
    setBusy(true)
    try {
      await register(username, email, password, {
        captchaId: captchaRequired ? captcha.id : undefined,
        captchaCode: captchaRequired ? captcha.code.trim() : undefined,
      })
      toast.show('注册成功，请登录', 'ok')
      navigate('/login', { replace: true })
    } catch (err: any) {
      if (err?.response?.data?.error?.details?.captcha) {
        refreshCaptcha()
      }
      toast.show(err?.response?.data?.error?.message || err.message || '注册失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside tagline="创建一个站点账号，开始管理你的 Minecraft 档案与皮肤。" />

      <main className="auth-main">
        <form className="auth-form" onSubmit={onSubmit}>
          <div>
            <h1>注册</h1>
            <p className="hint">创建站点账号</p>
          </div>
          <div className="fields">
            <Field label="用户名">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Steve"
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="邮箱">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="密码" hint="至少 6 位">
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
              注册
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
            {oauth.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <span className="field-label">第三方快捷登录</span>
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
            已有账号？<Link to="/login">登录</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
