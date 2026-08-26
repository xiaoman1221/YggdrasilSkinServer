import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/auth'
import { Button, Field, Input } from '../components/ui'
import AuthAside from '../components/AuthAside'
import { useToast } from '../components/Toast'

export default function ResetPassword() {
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
      toast.show('缺少重置令牌，请通过邮件中的链接进入', 'err')
      return
    }
    if (password.length < 6) {
      toast.show('密码至少 6 位', 'err')
      return
    }
    if (password !== confirm) {
      toast.show('两次输入的密码不一致', 'err')
      return
    }
    setBusy(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err: any) {
      toast.show(err?.message || '重置失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split-auth">
      <AuthAside tagline="设置新密码。" />
      <main className="auth-main">
        {done ? (
          <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
            <div>
              <h1>重置成功</h1>
              <p className="hint">密码已更新，即将跳转到登录页……</p>
            </div>
            <p className="auth-switch">
              <Link to="/login">前往登录</Link>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div>
              <h1>重置密码</h1>
              <p className="hint">{token ? '请输入新密码' : '缺少重置令牌'}</p>
            </div>
            <div className="fields">
              <Field label="新密码" hint="至少 6 位">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
              </Field>
              <Field label="确认新密码">
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </Field>
              <Button type="submit" variant="primary" size="lg" disabled={busy || !token}>
                {busy ? '提交中…' : '重置密码'}
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
