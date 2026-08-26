import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { authApi } from '../api/auth'
import { useToast } from '../components/Toast'
import { Button, Field, Input, Panel } from '../components/ui'

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [profileBusy, setProfileBusy] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)

  async function saveProfile() {
    if (profileBusy) return
    setProfileBusy(true)
    try {
      await authApi.updateProfile({ username: username.trim(), email: email.trim() })
      await refreshUser()
      toast.show('基本信息已保存', 'ok')
    } catch (err: any) {
      toast.show(err?.message || '保存失败', 'err')
    } finally {
      setProfileBusy(false)
    }
  }

  async function savePassword() {
    if (pwdBusy) return
    if (!current || !next) {
      toast.show('请填写原密码与新密码', 'err')
      return
    }
    if (next.length < 6) {
      toast.show('新密码至少 6 位', 'err')
      return
    }
    if (next !== confirm) {
      toast.show('两次输入的新密码不一致', 'err')
      return
    }
    setPwdBusy(true)
    try {
      await authApi.changePassword({ current, new: next })
      toast.show('密码已修改，请重新登录', 'ok')
      await logout()
      navigate('/login', { replace: true })
    } catch (err: any) {
      toast.show(err?.message || '修改失败', 'err')
    } finally {
      setPwdBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, display: 'grid', gap: 20 }}>
      <header className="page-head">
        <h1 className="page-title">个人设置</h1>
        <p className="page-sub">UID #{user?.id}{user?.oauth_type ? ` · ${user.oauth_type} 登录` : ''}</p>
      </header>

      <Panel title="基本信息">
        <div className="panel-body">
          <dl className="kv">
            <dt>头像</dt>
            <dd>
              在「个人皮肤」页对皮肤材质点击「设为头像」即可更换
            </dd>
            <dt>权限</dt>
            <dd>{user?.permissions}</dd>
            <dt>第三方登录</dt>
            <dd>{user?.oauth_type ? `已绑定 ${user.oauth_type}` : '未绑定'}</dd>
          </dl>
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <Field label="用户名" hint="3-16 位字母数字下划线">
              <Input className="mono" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="邮箱">
              <Input className="mono" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button variant="primary" disabled={profileBusy} onClick={saveProfile}>
              {profileBusy ? '保存中…' : '保存基本信息'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="修改密码">
        <div className="panel-body">
          <div style={{ display: 'grid', gap: 14 }}>
            <Field label="原密码">
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="新密码" hint="至少 6 位">
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="确认新密码">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button variant="primary" disabled={pwdBusy} onClick={savePassword}>
              {pwdBusy ? '提交中…' : '修改密码'}
            </Button>
            <p className="hint" style={{ margin: 0 }}>
              修改成功后所有登录会话将失效，需要重新登录。
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}
