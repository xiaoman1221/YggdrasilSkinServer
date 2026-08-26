import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { authApi } from '../api/auth'
import { Button, Field, Input } from '../components/ui'
import { useToast } from '../components/Toast'

const endpoints: [string, string][] = [
  ['POST', '/api/yggdrasil/authserver/authenticate'],
  ['POST', '/api/yggdrasil/authserver/refresh'],
  ['POST', '/api/yggdrasil/authserver/validate'],
  ['GET', '/api/yggdrasil/sessionserver/session/minecraft/profile/{uuid}'],
  ['POST', '/api/yggdrasil/api/profiles/minecraft'],
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [oauth, setOauth] = useState<{ name: string; display_name?: string }[]>([])

  useEffect(() => {
    authApi
      .oauthProviders()
      .then((res) => {
        if (res.enabled) setOauth(res.providers || [])
      })
      .catch(() => {})
  }, [])

  async function oauthLogin(type: string) {
    try {
      const res = await authApi.oauthAuthorize(type)
      window.location.href = res.url
    } catch (err: any) {
      toast.show(err?.message || '获取授权地址失败', 'err')
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!account || !password) {
      toast.show('请输入账号与密码', 'err')
      return
    }
    setBusy(true)
    try {
      await login(account, password)
      toast.show('登录成功', 'ok')
      navigate('/', { replace: true })
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '登录失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <aside className="auth-aside">
        <div>
          <div className="wordmark">YSS</div>
          <p className="tagline">
            自托管 Minecraft 皮肤站与 Yggdrasil 认证服务器。
          </p>
          <p className="tagline">
            天上如是，地下亦然。
          </p>
          <ul className="ep">
            {endpoints.map(([m, p]) => (
              <li key={p}>
                <span className="m">{m}</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="foot">YggdrasilSkinServer · authlib-injector compatible</div>
      </aside>

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
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              登录
              <ArrowRight size={16} strokeWidth={1.5} />
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
          <p className="switch" style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <Link to="/register">注册</Link>
            <Link to="/forgot-password">忘记密码</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
