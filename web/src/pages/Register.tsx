import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { Button, Field, Input } from '../components/ui'
import { useToast } from '../components/Toast'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

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
    setBusy(true)
    try {
      await register(username, email, password)
      toast.show('注册成功，请登录', 'ok')
      navigate('/login', { replace: true })
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '注册失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <aside className="auth-aside">
        <div>
          <div className="wordmark">YSS</div>
          <p className="tagline">创建一个站点账号，开始管理你的 Minecraft 档案与皮肤。</p>
          <ul className="ep">
            <li>
              <span className="m">POST</span>
              <span>/api/v1/auth/register</span>
            </li>
            <li>
              <span className="m">POST</span>
              <span>/api/v1/auth/login</span>
            </li>
            <li>
              <span className="m">GET</span>
              <span>/api/yggdrasil</span>
            </li>
          </ul>
        </div>
        <div className="foot">YggdrasilSkinServer · authlib-injector compatible</div>
      </aside>

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
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              注册
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
          </div>
          <p className="switch">
            已有账号？<Link to="/login">登录</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
