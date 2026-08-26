import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/auth'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import { useToast } from '../components/Toast'

export default function ForgotPassword() {
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
      toast.show(err?.message || '发送失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside tagline="通过注册邮箱找回密码。" />
      <main className="auth-main">
        {sent ? (
          <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
            <div>
              <h1>邮件已发送</h1>
              <p className="hint">如果该邮箱已注册，你将收到一封包含重置链接的邮件（30 分钟内有效）。</p>
            </div>
            <p className="auth-switch">
              <Link to="/login">返回登录</Link>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div>
              <h1>忘记密码</h1>
              <p className="hint">输入注册邮箱，我们将发送重置链接</p>
            </div>
            <div className="fields">
              <Field label="注册邮箱">
                <Input
                  className="mono"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                />
              </Field>
              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                {busy ? '发送中…' : '发送重置邮件'}
              </Button>
            </div>
            <p className="auth-switch">
              <Link to="/login">返回登录</Link>
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
