import { useCallback, useEffect, useState } from 'react'
import {
  Apple,
  Building2,
  Cloud,
  Code2,
  Compass,
  Gamepad2,
  GitBranch,
  Globe,
  MessageCircle,
  MessagesSquare,
  Monitor,
  Play,
  Search,
  Share2,
  Smartphone,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { authApi, OAuthProvider, PasskeyCredential, SessionInfo } from '../api/auth'
import { assetUrl } from '../utils/format'
import { createPasskey } from '../lib/webauthn'
import { useToast } from '../components/Toast'
import { Button, Empty, Field, Input, Panel, Spinner, StatusTag } from '../components/ui'
import ThemeSwitcher from '../components/ThemeSwitcher'
import { useTranslation } from 'react-i18next'

/** OauthGo 渠道 → 图标映射（未匹配时使用通用地球图标）。 */
const providerIcons: Record<string, LucideIcon> = {
  gitee: Code2,
  github: GitBranch,
  qq: MessageCircle,
  wechat: MessagesSquare,
  weixin: MessagesSquare,
  alipay: Wallet,
  dingtalk: Building2,
  baidu: Compass,
  weibo: Share2,
  douyin: Play,
  xiaomi: Smartphone,
  feishu: Cloud,
  microsoft: Monitor,
  google: Search,
  apple: Apple,
  steam: Gamepad2,
  discord: MessagesSquare,
  facebook: Users,
}

function ProviderIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = providerIcons[name] || Globe
  return <Icon size={size} strokeWidth={1.75} />
}

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [profileBusy, setProfileBusy] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsBusy, setSessionsBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([])
  const [passkeyLoading, setPasskeyLoading] = useState(true)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([])
  const [oauthLoading, setOauthLoading] = useState(true)
  const [oauthBusy, setOauthBusy] = useState(false)

  const refreshToken = localStorage.getItem('yss_refresh_token') || ''

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await authApi.listSessions(refreshToken)
      setSessions(res.sessions || [])
    } catch {
      /* ignore */
    } finally {
      setSessionsLoading(false)
    }
  }, [refreshToken])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const loadPasskeys = useCallback(async () => {
    setPasskeyLoading(true)
    try {
      const res = await authApi.passkeyCredentials()
      setPasskeys(res.credentials || [])
    } catch {
      /* ignore */
    } finally {
      setPasskeyLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPasskeys()
  }, [loadPasskeys])

  const loadOauthProviders = useCallback(async () => {
    setOauthLoading(true)
    try {
      const res = await authApi.oauthProviders()
      setOauthProviders(res.enabled ? (res.providers || []).filter((p) => p.allowed !== false) : [])
    } catch {
      /* ignore */
    } finally {
      setOauthLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOauthProviders()
  }, [loadOauthProviders])

  async function bindOauth(type: string) {
    setOauthBusy(true)
    try {
      const res = await authApi.oauthBindAuthorize(type)
      window.location.href = res.url
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('settings.oauth.bindFail'), 'err')
    } finally {
      setOauthBusy(false)
    }
  }

  function providerName(type: string): string {
    return oauthProviders.find((p) => p.name === type)?.display_name || type
  }

  async function unbindOauth(oauthType: string) {
    if (!oauthType) return
    if (!window.confirm(t('settings.oauth.unbindConfirm', { name: providerName(oauthType) }))) return
    setOauthBusy(true)
    try {
      await authApi.oauthUnbind(oauthType)
      await refreshUser()
      toast.show(t('settings.oauth.unbindOk'), 'ok')
    } catch (err: any) {
      toast.show(err?.message || t('settings.oauth.unbindFail'), 'err')
    } finally {
      setOauthBusy(false)
    }
  }

  async function registerPasskey() {
    setPasskeyBusy(true)
    try {
      const { sessionId, options } = await authApi.passkeyRegisterBegin()
      const response = await createPasskey(options)
      await authApi.passkeyRegisterFinish(sessionId, response)
      toast.show(t('settings.passkey.added'), 'ok')
      loadPasskeys()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('settings.passkey.registerFail'), 'err')
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function removePasskey(p: PasskeyCredential) {
    if (!window.confirm(t('settings.passkey.deleteConfirm', { name: p.name }))) return
    try {
      await authApi.passkeyRemove(p.id)
      toast.show(t('settings.passkey.deleted'), 'ok')
      loadPasskeys()
    } catch (err: any) {
      toast.show(err?.message || t('settings.passkey.deleteFail'), 'err')
    }
  }

  async function revoke(s: SessionInfo) {
    if (s.current) {
      toast.show(t('settings.sessions.revokeCurrentError'), 'err')
      return
    }
    try {
      await authApi.revokeSession(s.id)
      toast.show(t('settings.sessions.revokeOk'), 'ok')
      loadSessions()
    } catch (err: any) {
      toast.show(err?.message || t('settings.sessions.revokeFail'), 'err')
    }
  }

  async function revokeOthers() {
    if (!window.confirm(t('settings.sessions.revokeAllConfirm'))) return
    setSessionsBusy(true)
    try {
      await authApi.revokeOtherSessions(refreshToken)
      toast.show(t('settings.sessions.revokeAllOk'), 'ok')
      loadSessions()
    } catch (err: any) {
      toast.show(err?.message || t('settings.sessions.revokeFail'), 'err')
    } finally {
      setSessionsBusy(false)
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.show(t('settings.avatar.selectImage'), 'err')
      return
    }
    setAvatarBusy(true)
    try {
      await authApi.uploadAvatar(file)
      await refreshUser()
      toast.show(t('settings.avatar.updated'), 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('settings.avatar.uploadFail'), 'err')
    } finally {
      setAvatarBusy(false)
      e.target.value = ''
    }
  }

  async function saveProfile() {
    if (profileBusy) return
    setProfileBusy(true)
    try {
      await authApi.updateProfile({ username: username.trim(), email: email.trim() })
      await refreshUser()
      toast.show(t('settings.profile.saved'), 'ok')
    } catch (err: any) {
      toast.show(err?.message || t('settings.profile.saveFail'), 'err')
    } finally {
      setProfileBusy(false)
    }
  }

  async function savePassword() {
    if (pwdBusy) return
    if (!current || !next) {
      toast.show(t('settings.password.validation.bothRequired'), 'err')
      return
    }
    if (next.length < 6) {
      toast.show(t('settings.password.validation.minLength'), 'err')
      return
    }
    if (next !== confirm) {
      toast.show(t('settings.password.validation.mismatch'), 'err')
      return
    }
    setPwdBusy(true)
    try {
      await authApi.changePassword({ current, new: next })
      toast.show(t('settings.password.changed'), 'ok')
      await logout()
      navigate('/login', { replace: true })
    } catch (err: any) {
      toast.show(err?.message || t('settings.password.fail'), 'err')
    } finally {
      setPwdBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, display: 'grid', gap: 20 }}>
      <header className="page-head">
        <h1 className="page-title">{t('settings.pageTitle')}</h1>
        <p className="page-sub">UID #{user?.id}{user?.oauth_type ? t('settings.loginType', { type: user.oauth_type }) : ''}</p>
      </header>

      <Panel title={t('settings.theme.title')}>
        <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
          <ThemeSwitcher />
          <p className="hint" style={{ margin: 0 }}>{t('settings.theme.hint')}</p>
        </div>
      </Panel>

      <Panel title="基本信息">
        <div className="panel-body">
          <dl className="kv">
            <dt>头像</dt>
            <dd>
              {user?.avatar_url ? (
                <img
                  src={assetUrl(user.avatar_url)}
                  alt="头像"
                  style={{ width: 48, height: 48, borderRadius: 8, border: '1px solid var(--line)', imageRendering: 'pixelated' }}
                />
              ) : (
                '未设置'
              )}
            </dd>
            <dt>权限</dt>
            <dd>{user?.permissions}</dd>
            <dt>第三方登录</dt>
            <dd>
              {(user?.oauth_bindings || []).length > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  {(user?.oauth_bindings || []).map((b) => (
                    <span key={b.oauth_type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={b.nickname}>
                      <ProviderIcon name={b.oauth_type} size={16} />
                      {providerName(b.oauth_type)}
                    </span>
                  ))}
                </span>
              ) : (
                '未绑定'
              )}
            </dd>
          </dl>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              {avatarBusy ? '上传中…' : '上传头像'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={uploadAvatar}
                disabled={avatarBusy}
              />
            </label>
            {user?.avatar_url ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await authApi.clearAvatar()
                    await refreshUser()
                    toast.show('头像已清除', 'ok')
                  } catch (err: any) {
                    toast.show(err?.message || '清除失败', 'err')
                  }
                }}
              >
                清除头像
              </Button>
            ) : null}
            <span className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
              PNG/JPG 等图片，最大 1MB；也可以到「个人皮肤」页对皮肤点击「设为头像」
            </span>
          </div>
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

      <Panel title="第三方登录">
        <div className="panel-body">
          <p className="hint" style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)' }}>
            绑定第三方账号后，可用它快捷登录本站。点击下方对应图标即可绑定 / 解绑。
          </p>
          {oauthLoading ? (
            <Spinner label="加载第三方登录渠道" />
          ) : oauthProviders.length === 0 ? (
            <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
              第三方登录未启用，或站点未配置可用渠道。
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: 'var(--bg-muted)',
                }}
              >
                {(user?.oauth_bindings || []).length > 0 ? (
                  <>
                    <span style={{ fontSize: 14, color: 'var(--text)' }}>
                      已绑定 {(user?.oauth_bindings || []).length} 个第三方账号
                    </span>
                    {(user?.oauth_bindings || []).map((b) => (
                      <span key={b.oauth_type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={b.nickname}>
                        <ProviderIcon name={b.oauth_type} size={20} />
                        <span className="mono" style={{ fontSize: 14, color: 'var(--text)' }}>
                          {providerName(b.oauth_type)}
                        </span>
                      </span>
                    ))}
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>可点击下方对应图标解绑</span>
                  </>
                ) : (
                  <span style={{ fontSize: 14, color: 'var(--text)' }}>未绑定第三方账号</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {oauthProviders.map((p) => {
                  const isBound = (user?.oauth_bindings || []).some((b) => b.oauth_type === p.name)
                  return (
                    <button
                      key={p.name}
                      type="button"
                      title={`${isBound ? '解绑' : '绑定'} ${p.display_name || p.name}`}
                      disabled={oauthBusy}
                      onClick={() => (isBound ? unbindOauth(p.name) : bindOauth(p.name))}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: `1px solid ${isBound ? 'var(--accent)' : 'var(--line)'}`,
                        background: isBound ? 'var(--accent-soft)' : 'transparent',
                        color: isBound ? 'var(--accent-deep)' : 'var(--text-2)',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <ProviderIcon name={p.name} size={22} />
                      <span>{p.display_name || p.name}</span>
                      {isBound ? <span style={{ fontSize: 12 }}>已绑定</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="登录设备"
        extra={
          <Button size="sm" disabled={sessionsBusy || sessions.length <= 1} onClick={revokeOthers}>
            {sessionsBusy ? '处理中…' : '下线其他设备'}
          </Button>
        }
      >
        <div className="panel-body">
          {sessionsLoading ? (
            <Spinner label="加载会话" />
          ) : sessions.length === 0 ? (
            <Empty text="没有有效会话" />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    background: 'var(--bg-muted)',
                  }}
                >
                  <span style={{ color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}>
                    <Smartphone size={18} strokeWidth={1.5} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>
                        {s.ip || '未知 IP'}
                      </span>
                      {s.current ? <StatusTag kind="on">当前设备</StatusTag> : null}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={s.user_agent}
                    >
                      {s.user_agent || '未知设备'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      登录于 {new Date(s.created_at).toLocaleString()} · 有效期至 {new Date(s.expires_at).toLocaleString()}
                    </div>
                  </div>
                  {!s.current ? (
                    <Button size="sm" variant="ghost" onClick={() => revoke(s)}>
                      下线
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="通行密钥（Passkey）"
        extra={
          <Button size="sm" disabled={passkeyBusy} onClick={registerPasskey}>
            {passkeyBusy ? '处理中…' : '添加通行密钥'}
          </Button>
        }
      >
        <div className="panel-body">
          <p className="hint" style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)' }}>
            使用系统指纹、人脸或安全密钥免密登录。需要 HTTPS 或 localhost 环境（浏览器安全上下文）。
          </p>
          {passkeyLoading ? (
            <Spinner label="加载通行密钥" />
          ) : passkeys.length === 0 ? (
            <Empty text="尚未绑定通行密钥" />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {passkeys.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    background: 'var(--bg-muted)',
                  }}
                >
                  <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)' }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    绑定于 {new Date(p.created_at).toLocaleString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => removePasskey(p)}>
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
