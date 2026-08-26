import { useCallback, useEffect, useState } from 'react'
import { Box, Download, Pencil, Save, Shield, Trash2 } from 'lucide-react'
import { adminApi, AdminProfile, AdminTexture, AdminUser, AdminYsmModel, SiteSettings, TextureReport } from '../api/admin'
import { LibraryItem } from '../api/library'
import { formatSize } from '../utils/format'
import { useAuth } from '../stores/auth'
import { useToast } from '../components/Toast'
import {
  Button,
  Empty,
  Field,
  Input,
  Modal,
  Pager,
  Panel,
  Segmented,
  Spinner,
  StatusTag,
  Switch,
  Table,
  Textarea,
  TextLink,
} from '../components/ui'
import type { Column } from '../components/ui'

const PAGE_SIZE = 15

type Tab = 'settings' | 'users' | 'profiles' | 'textures' | 'ysm'

export default function Admin() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('settings')

  if (user?.id !== 1) {
    return (
      <div>
        <h1 className="page-title">管理</h1>
        <div className="empty" style={{ marginTop: 16 }}>
          仅超级管理员（UID = 1）可访问此页面
        </div>
      </div>
    )
  }

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">管理</h1>
        <p className="page-sub">超级管理员（UID = 1）</p>
      </header>

      <div style={{ marginBottom: 20 }}>
        <Segmented<Tab>
          options={[
            { value: 'settings', label: '站点设置' },
            { value: 'users', label: '用户管理' },
            { value: 'profiles', label: '档案管理' },
            { value: 'textures', label: '材质管理' },
            { value: 'ysm', label: '模型管理' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'settings' && <SettingsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'textures' && <TexturesTab />}
      {tab === 'ysm' && <YsmTab />}
    </div>
  )
}

/* ================= 站点设置 ================= */

const emptySettings: SiteSettings = {
  site_name: '',
  site_announcement: '',
  site_url: '',
  allow_register: 'true',
  allow_upload: 'true',
  max_upload_size_mb: '4',
  allow_ysm_upload: 'true',
  max_ysm_size_mb: '16',
  upload_max_width: '',
  upload_max_height: '',
  yggdrasil_server_name: '',
  yggdrasil_impl_name: '',
  yggdrasil_impl_version: '',
  yggdrasil_skin_domains: '',
  yggdrasil_non_email_login: 'true',
  jwt_expire_hours: '',
  mojang_client_id: '',
  mojang_client_secret: '',
  mojang_redirect_uri: '',
  smtp_host: '',
  smtp_port: '465',
  smtp_username: '',
  smtp_password: '',
  smtp_from: '',
  oauthgo_enabled: 'false',
  oauthgo_api_base: 'https://o.1v.fit',
  oauthgo_app_id: '',
  oauthgo_app_key: '',
}

function SettingsTab() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<SiteSettings>(emptySettings)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.getSettings()
      setForm({ ...emptySettings, ...res.settings })
    } catch (err: any) {
      toast.show(err.message || '加载设置失败', 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const set = (key: keyof SiteSettings, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  async function sendTestEmail() {
    if (!testTo.trim()) {
      toast.show('请填写测试收件邮箱', 'err')
      return
    }
    setTesting(true)
    try {
      await adminApi.emailTest(testTo.trim())
      toast.show('测试邮件已发送', 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '发送失败', 'err')
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await adminApi.updateSettings({
        site_name: form.site_name.trim() || 'YSS',
        site_announcement: form.site_announcement,
        site_url: form.site_url.trim(),
        allow_register: String(form.allow_register === 'true'),
        allow_upload: String(form.allow_upload === 'true'),
        max_upload_size_mb: String(Math.max(1, parseInt(form.max_upload_size_mb, 10) || 4)),
        allow_ysm_upload: String(form.allow_ysm_upload === 'true'),
        max_ysm_size_mb: String(Math.max(1, parseInt(form.max_ysm_size_mb, 10) || 16)),
        upload_max_width: String(Math.max(0, parseInt(form.upload_max_width, 10) || 0)),
        upload_max_height: String(Math.max(0, parseInt(form.upload_max_height, 10) || 0)),
        yggdrasil_server_name: form.yggdrasil_server_name.trim(),
        yggdrasil_impl_name: form.yggdrasil_impl_name.trim(),
        yggdrasil_impl_version: form.yggdrasil_impl_version.trim(),
        yggdrasil_skin_domains: form.yggdrasil_skin_domains.trim(),
        yggdrasil_non_email_login: String(form.yggdrasil_non_email_login === 'true'),
        jwt_expire_hours: String(Math.max(1, parseInt(form.jwt_expire_hours, 10) || 72)),
        mojang_client_id: form.mojang_client_id.trim(),
        mojang_client_secret: form.mojang_client_secret.trim(),
        mojang_redirect_uri: form.mojang_redirect_uri.trim(),
        smtp_host: form.smtp_host.trim(),
        smtp_port: String(Math.max(1, parseInt(form.smtp_port, 10) || 465)),
        smtp_username: form.smtp_username.trim(),
        smtp_password: form.smtp_password,
        smtp_from: form.smtp_from.trim(),
        oauthgo_enabled: String(form.oauthgo_enabled === 'true'),
        oauthgo_api_base: form.oauthgo_api_base.trim() || 'https://o.1v.fit',
        oauthgo_app_id: form.oauthgo_app_id.trim(),
        oauthgo_app_key: form.oauthgo_app_key,
      })
      setForm({ ...emptySettings, ...res.settings })
      toast.show('设置已保存', 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '保存失败', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="加载设置" />

  return (
    <div style={{ maxWidth: 880, display: 'grid', gap: 20 }}>
      <Panel title="基础信息">
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="站点名称">
              <Input value={form.site_name} onChange={(e) => set('site_name', e.target.value)} placeholder="YSS 皮肤站" />
            </Field>
            <Field label="对外站点地址" hint="用于拼接皮肤 URL（原 YSS_STORAGE_BASE_URL）">
              <Input className="mono" value={form.site_url} onChange={(e) => set('site_url', e.target.value)} placeholder="http://localhost:8080" />
            </Field>
          </div>
          <Field label="站点公告" hint="显示在控制台顶部">
            <Textarea value={form.site_announcement} onChange={(e) => set('site_announcement', e.target.value)} placeholder="欢迎使用 YSS 皮肤站……" />
          </Field>
        </div>
      </Panel>

      <Panel title="Yggdrasil 协议">
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="服务器名称">
              <Input value={form.yggdrasil_server_name} onChange={(e) => set('yggdrasil_server_name', e.target.value)} />
            </Field>
            <Field label="皮肤域名" hint="逗号分隔">
              <Input value={form.yggdrasil_skin_domains} onChange={(e) => set('yggdrasil_skin_domains', e.target.value)} placeholder="localhost" />
            </Field>
            <Field label="实现名称">
              <Input value={form.yggdrasil_impl_name} onChange={(e) => set('yggdrasil_impl_name', e.target.value)} />
            </Field>
            <Field label="实现版本">
              <Input value={form.yggdrasil_impl_version} onChange={(e) => set('yggdrasil_impl_version', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>允许用户名登录</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>关闭后仅支持邮箱登录</div>
            </div>
            <Switch checked={form.yggdrasil_non_email_login === 'true'} onChange={(v) => set('yggdrasil_non_email_login', String(v))} />
          </div>
        </div>
      </Panel>

      <Panel title="功能与上传">
        <div className="panel-body" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>开放注册</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>关闭后新用户将无法注册</div>
            </div>
            <Switch checked={form.allow_register === 'true'} onChange={(v) => set('allow_register', String(v))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>允许上传</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>关闭后用户无法上传材质</div>
            </div>
            <Switch checked={form.allow_upload === 'true'} onChange={(v) => set('allow_upload', String(v))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="单文件大小上限（MB）">
              <Input className="mono" type="number" min={1} value={form.max_upload_size_mb} onChange={(e) => set('max_upload_size_mb', e.target.value)} />
            </Field>
            <Field label="最大宽度（px，0 不限）">
              <Input className="mono" type="number" min={0} value={form.upload_max_width} onChange={(e) => set('upload_max_width', e.target.value)} />
            </Field>
            <Field label="最大高度（px，0 不限）">
              <Input className="mono" type="number" min={0} value={form.upload_max_height} onChange={(e) => set('upload_max_height', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>允许上传 YSM 模型</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>关闭后用户无法上传 .ysm / .zip 模型</div>
            </div>
            <Switch checked={form.allow_ysm_upload === 'true'} onChange={(v) => set('allow_ysm_upload', String(v))} />
          </div>
          <div style={{ maxWidth: 240 }}>
            <Field label="YSM 模型大小上限（MB）">
              <Input className="mono" type="number" min={1} value={form.max_ysm_size_mb} onChange={(e) => set('max_ysm_size_mb', e.target.value)} />
            </Field>
          </div>
          <Field label="站点 JWT 有效期（小时）">
            <Input className="mono" type="number" min={1} value={form.jwt_expire_hours} onChange={(e) => set('jwt_expire_hours', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="正版认证（Microsoft OAuth）">
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Field label="Client ID">
              <Input className="mono" value={form.mojang_client_id} onChange={(e) => set('mojang_client_id', e.target.value)} />
            </Field>
            <Field label="Client Secret">
              <Input className="mono" type="password" value={form.mojang_client_secret} onChange={(e) => set('mojang_client_secret', e.target.value)} />
            </Field>
            <Field label="回调地址" hint="须与 Azure 注册的重定向 URI 完全一致">
              <Input className="mono" value={form.mojang_redirect_uri} onChange={(e) => set('mojang_redirect_uri', e.target.value)} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="邮件（SMTP）">
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            用于忘记密码邮件；端口 465 为隐式 TLS，587 为 STARTTLS。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <Field label="SMTP 服务器">
              <Input className="mono" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.example.com" />
            </Field>
            <Field label="端口">
              <Input className="mono" type="number" value={form.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} placeholder="465" />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="账号">
              <Input className="mono" value={form.smtp_username} onChange={(e) => set('smtp_username', e.target.value)} />
            </Field>
            <Field label="密码 / 授权码">
              <Input className="mono" type="password" value={form.smtp_password} onChange={(e) => set('smtp_password', e.target.value)} />
            </Field>
          </div>
          <Field label="发件人" hint="留空使用账号；可带名称，如 &quot;YSS 皮肤站&quot; <noreply@example.com>">
            <Input className="mono" value={form.smtp_from} onChange={(e) => set('smtp_from', e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ width: 280 }}>
              <Field label="测试发送">
                <Input
                  className="mono"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="填写收件邮箱后点击右侧按钮"
                />
              </Field>
            </div>
            <Button disabled={testing || !form.smtp_host.trim()} onClick={sendTestEmail}>
              {testing ? '发送中…' : '发送测试邮件'}
            </Button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            修改 SMTP 配置后请先保存设置，再进行测试发送。
          </p>
        </div>
      </Panel>

      <Panel title="第三方登录（OauthGo）">
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            聚合 QQ / 微信 / Gitee 等渠道，平台 <a href="https://o.1v.fit/docs" target="_blank" rel="noreferrer">o.1v.fit</a>。
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>启用 OauthGo 登录</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>启用并配置后，登录页显示第三方登录按钮</div>
            </div>
            <Switch checked={form.oauthgo_enabled === 'true'} onChange={(v) => set('oauthgo_enabled', String(v))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="API 地址">
              <Input className="mono" value={form.oauthgo_api_base} onChange={(e) => set('oauthgo_api_base', e.target.value)} placeholder="https://o.1v.fit" />
            </Field>
            <Field label="AppID">
              <Input className="mono" value={form.oauthgo_app_id} onChange={(e) => set('oauthgo_app_id', e.target.value)} />
            </Field>
            <Field label="AppKey">
              <Input className="mono" type="password" value={form.oauthgo_app_key} onChange={(e) => set('oauthgo_app_key', e.target.value)} />
            </Field>
            <Field label="回调地址（只读）" hint="需加入 OauthGo 应用白名单">
              <Input className="mono" readOnly value={`${form.site_url.trim() || 'https://你的站点'}/api/v1/auth/oauth/callback`} />
            </Field>
          </div>
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save size={16} strokeWidth={1.5} />
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </div>
  )
}

/* ================= 用户管理 ================= */

function UsersTab() {
  const toast = useToast()
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [editFor, setEditFor] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState({ username: '', email: '', new_password: '' })
  const [editBusy, setEditBusy] = useState(false)

  const load = useCallback(
    async (p: number, kw: string) => {
      setLoading(true)
      try {
        const res = await adminApi.listUsers({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE, keyword: kw || undefined })
        setUsers(res.users)
        setTotal(res.total)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page, keyword)
  }, [load, page, keyword])

  async function setPerm(u: AdminUser, perm: string) {
    try {
      await adminApi.setUserPermissions(u.id, perm)
      toast.show(`已更新 ${u.username} 权限`, 'ok')
      load(page, keyword)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '操作失败', 'err')
    }
  }

  function openEdit(u: AdminUser) {
    setEditForm({ username: u.username, email: u.email, new_password: '' })
    setEditFor(u)
  }

  async function saveEdit() {
    if (!editFor || editBusy) return
    setEditBusy(true)
    try {
      await adminApi.updateUser(editFor.id, editForm)
      toast.show('用户信息已更新', 'ok')
      setEditFor(null)
      load(page, keyword)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '保存失败', 'err')
    } finally {
      setEditBusy(false)
    }
  }

  async function remove(u: AdminUser) {
    if (!window.confirm(`确认删除用户 ${u.username}？其档案、材质、令牌将被一并删除。`)) return
    try {
      await adminApi.deleteUser(u.id)
      toast.show('已删除', 'ok')
      load(page, keyword)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '删除失败', 'err')
    }
  }

  // 删除保护：不能删除自己与超级管理员
  const canDelete = (u: AdminUser) => u.id !== 1 && u.id !== me?.id

  const columns: Column<AdminUser>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (u) => <span className="data">{u.id}</span> },
    { key: 'username', title: '用户名', render: (u) => <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username}</span> },
    { key: 'email', title: '邮箱', width: 220, render: (u) => <span className="data">{u.email}</span> },
    {
      key: 'perms',
      title: '权限',
      width: 110,
      render: (u) =>
        u.id === 1 ? (
          <StatusTag kind="on">超级管理员</StatusTag>
        ) : (
          <StatusTag kind={u.permissions.includes('admin') ? 'on' : 'off'}>{u.permissions}</StatusTag>
        ),
    },
    {
      key: 'mojang',
      title: '正版',
      width: 140,
      render: (u) => (u.mojang_name ? <span className="data">{u.mojang_name}</span> : <span className="data" style={{ color: 'var(--text-3)' }}>—</span>),
    },
    { key: 'created', title: '注册时间', width: 170, render: (u) => <span className="data">{new Date(u.created_at).toLocaleString()}</span> },
    {
      key: 'actions',
      title: '操作',
      width: 200,
      render: (u) =>
        u.id === 1 ? null : (
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <TextLink onClick={() => setPerm(u, u.permissions.includes('admin') ? 'user' : 'admin')}>
              <Shield size={13} strokeWidth={1.5} />
              {u.permissions.includes('admin') ? '取消管理员' : '设为管理员'}
            </TextLink>
            <TextLink onClick={() => openEdit(u)}>
              <Pencil size={13} strokeWidth={1.5} />
              编辑
            </TextLink>
            {canDelete(u) ? (
              <TextLink danger onClick={() => remove(u)}>
                <Trash2 size={13} strokeWidth={1.5} />
                删除
              </TextLink>
            ) : null}
          </span>
        ),
    },
  ]

  return (
    <Panel
      title="用户管理"
      extra={
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="搜索用户名 / 邮箱"
          value={keyword}
          onChange={(e) => {
            setPage(1)
            setKeyword(e.target.value)
          }}
        />
      }
    >
      {loading ? (
        <Spinner label="加载用户" />
      ) : users.length === 0 ? (
        <Empty text="没有用户" />
      ) : (
        <>
          <Table columns={columns} data={users} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      <Modal
        open={!!editFor}
        title={`编辑用户 · ${editFor?.username ?? ''}`}
        onClose={() => setEditFor(null)}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditFor(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={editBusy} onClick={saveEdit}>
              {editBusy ? '保存中…' : '保存'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="用户名" hint="3-16 位字母数字下划线">
            <Input
              className="mono"
              value={editForm.username}
              onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
            />
          </Field>
          <Field label="邮箱">
            <Input
              className="mono"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="重置密码" hint="留空表示不修改；重置后该用户所有会话将失效">
            <Input
              className="mono"
              type="password"
              value={editForm.new_password}
              onChange={(e) => setEditForm((f) => ({ ...f, new_password: e.target.value }))}
              placeholder="至少 6 位"
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Modal>
    </Panel>
  )
}

/* ================= 档案管理 ================= */

function ProfilesTab() {
  const toast = useToast()
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [renameTarget, setRenameTarget] = useState<AdminProfile | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await adminApi.listProfiles({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setProfiles(res.profiles)
        setTotal(res.total)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page)
  }, [load, page])

  async function doRename() {
    if (!renameTarget || !/^[A-Za-z0-9_]{3,16}$/.test(name)) return
    try {
      await adminApi.renameProfile(renameTarget.uuid, name)
      toast.show('改名成功', 'ok')
      setRenameTarget(null)
      setName('')
      load(page)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '改名失败', 'err')
    }
  }

  async function remove(p: AdminProfile) {
    if (!window.confirm(`确认删除档案 ${p.name}？`)) return
    try {
      await adminApi.deleteProfile(p.uuid)
      toast.show('已删除', 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err.message || '删除失败', 'err')
    }
  }

  const columns: Column<AdminProfile>[] = [
    { key: 'name', title: '名称', width: 130, render: (p) => <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</span> },
    { key: 'uuid', title: 'UUID', render: (p) => <span className="data">{p.uuid}</span> },
    { key: 'owner', title: '所属用户', width: 90, align: 'right', render: (p) => <span className="data">#{p.user_id}</span> },
    {
      key: 'tex',
      title: '皮肤/披风',
      width: 130,
      render: (p) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <StatusTag kind={p.skin_texture_id ? 'on' : 'off'}>{p.skin_texture_id ? '皮肤' : '—'}</StatusTag>
          <StatusTag kind={p.cape_texture_id ? 'on' : 'off'}>{p.cape_texture_id ? '披风' : '—'}</StatusTag>
        </span>
      ),
    },
    { key: 'created', title: '创建时间', width: 170, render: (p) => <span className="data">{new Date(p.created_at).toLocaleString()}</span> },
    {
      key: 'actions',
      title: '操作',
      width: 110,
      render: (p) => (
        <span style={{ display: 'inline-flex', gap: 12 }}>
          <TextLink
            onClick={() => {
              setRenameTarget(p)
              setName(p.name)
            }}
          >
            改名
          </TextLink>
          <TextLink danger onClick={() => remove(p)}>
            删除
          </TextLink>
        </span>
      ),
    },
  ]

  return (
    <>
      <Panel title="档案管理">
        {loading ? (
          <Spinner label="加载档案" />
        ) : profiles.length === 0 ? (
          <Empty text="没有档案" />
        ) : (
          <>
            <Table columns={columns} data={profiles} />
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Panel>

      <Modal
        open={!!renameTarget}
        title="受控改名"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button variant="primary" onClick={doRename}>保存</Button>
          </>
        }
      >
        <Field label="新名称">
          <Input className="mono" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

/* ================= 材质管理 ================= */

type TexSub = 'all' | 'review' | 'reports'

function TexturesTab() {
  const [sub, setSub] = useState<TexSub>('all')
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <Segmented<TexSub>
          options={[
            { value: 'all', label: '全部材质' },
            { value: 'review', label: '材质库审核' },
            { value: 'reports', label: '举报处理' },
          ]}
          value={sub}
          onChange={setSub}
        />
      </div>
      {sub === 'all' && <AllTextures />}
      {sub === 'review' && <ReviewTab />}
      {sub === 'reports' && <ReportsTab />}
    </div>
  )
}

function ReviewTab() {
  const toast = useToast()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const load = useCallback(
    async (p: number, st: string) => {
      setLoading(true)
      try {
        const res = await adminApi.listLibraryTextures({ status: st || undefined, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setItems(res.items)
        setTotal(res.total)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page, status)
  }, [load, page, status])

  async function act(item: LibraryItem, action: 'approve' | 'reject' | 'unpublish') {
    try {
      await adminApi.setLibraryStatus(item.id, action)
      toast.show('已处理', 'ok')
      load(page, status)
    } catch (err: any) {
      toast.show(err.message || '操作失败', 'err')
    }
  }

  const columns: Column<LibraryItem>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (i) => <span className="data">{i.id}</span> },
    { key: 'title', title: '标题', width: 180, render: (i) => <span className="mono" style={{ color: 'var(--text)' }}>{i.title || '未命名'}</span> },
    { key: 'author', title: '作者', width: 80, align: 'right', render: (i) => <span className="data">#{i.author}</span> },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (i) => <StatusTag kind={i.status === 'approved' ? 'on' : i.status === 'pending' ? 'warn' : 'off'}>{i.status}</StatusTag>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 190,
      render: (i) =>
        i.status === 'pending' ? (
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <TextLink onClick={() => act(i, 'approve')}>通过</TextLink>
            <TextLink danger onClick={() => act(i, 'reject')}>拒绝</TextLink>
          </span>
        ) : i.status === 'approved' ? (
          <TextLink danger onClick={() => act(i, 'unpublish')}>下架</TextLink>
        ) : null,
    },
  ]

  return (
    <Panel
      title="材质库审核"
      extra={
        <Segmented<'all' | 'pending' | 'approved'>
          options={[
            { value: 'all', label: '全部' },
            { value: 'pending', label: '待审核' },
            { value: 'approved', label: '已通过' },
          ]}
          value={(status || 'all') as 'all' | 'pending' | 'approved'}
          onChange={(v) => {
            setPage(1)
            setStatus(v === 'all' ? '' : v)
          }}
        />
      }
    >
      {loading ? (
        <Spinner label="加载审核" />
      ) : items.length === 0 ? (
        <Empty text="没有待处理条目" />
      ) : (
        <>
          <Table columns={columns} data={items} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </Panel>
  )
}

function ReportsTab() {
  const toast = useToast()
  const [reports, setReports] = useState<TextureReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  const load = useCallback(
    async (p: number, st: string) => {
      setLoading(true)
      try {
        const res = await adminApi.listReports({ status: st || undefined, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setReports(res.reports)
        setTotal(res.total)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page, status)
  }, [load, page, status])

  async function act(r: TextureReport, action: 'accept' | 'reject') {
    try {
      await adminApi.handleReport(r.id, action)
      toast.show('已处理', 'ok')
      load(page, status)
    } catch (err: any) {
      toast.show(err.message || '操作失败', 'err')
    }
  }

  const columns: Column<TextureReport>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (r) => <span className="data">{r.id}</span> },
    { key: 'item', title: '材质条目', width: 90, align: 'right', render: (r) => <span className="data">#{r.item_id}</span> },
    { key: 'reporter', title: '举报人', width: 80, align: 'right', render: (r) => <span className="data">#{r.reporter_id}</span> },
    { key: 'reason', title: '原因', render: (r) => <span className="data">{r.reason || '—'}</span> },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (r) => <StatusTag kind={r.status === 'pending' ? 'warn' : 'off'}>{r.status}</StatusTag>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 140,
      render: (r) =>
        r.status === 'pending' ? (
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <TextLink onClick={() => act(r, 'accept')}>接受</TextLink>
            <TextLink danger onClick={() => act(r, 'reject')}>驳回</TextLink>
          </span>
        ) : null,
    },
  ]

  return (
    <Panel
      title="举报处理"
      extra={
        <Segmented<'all' | 'pending'>
          options={[
            { value: 'all', label: '全部' },
            { value: 'pending', label: '待处理' },
          ]}
          value={(status || 'all') as 'all' | 'pending'}
          onChange={(v) => {
            setPage(1)
            setStatus(v === 'all' ? '' : v)
          }}
        />
      }
    >
      {loading ? (
        <Spinner label="加载举报" />
      ) : reports.length === 0 ? (
        <Empty text="没有举报记录" />
      ) : (
        <>
          <Table columns={columns} data={reports} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </Panel>
  )
}

function AllTextures() {
  const toast = useToast()
  const [items, setItems] = useState<AdminTexture[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await adminApi.listTextures({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setItems(res.textures)
        setTotal(res.total)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page)
  }, [load, page])

  async function remove(t: AdminTexture) {
    if (!window.confirm(`确认删除材质 #${t.id}？`)) return
    try {
      await adminApi.deleteTexture(t.id)
      toast.show('已删除', 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err.message || '删除失败', 'err')
    }
  }

  const columns: Column<AdminTexture>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (t) => <span className="data">{t.id}</span> },
    { key: 'owner', title: '用户', width: 80, align: 'right', render: (t) => <span className="data">#{t.user_id}</span> },
    {
      key: 'preview',
      title: '预览',
      width: 64,
      render: (t) => <img className="thumb" src={new URL(t.url, window.location.origin).pathname} alt="" />,
    },
    { key: 'type', title: '类型', width: 80, render: (t) => <StatusTag kind={t.type === 'skin' ? 'on' : 'warn'}>{t.type === 'skin' ? '皮肤' : '披风'}</StatusTag> },
    { key: 'model', title: '模型', width: 80, render: (t) => <span className="data">{t.model}</span> },
    { key: 'size', title: '尺寸', width: 100, align: 'right', render: (t) => <span className="data">{t.width}×{t.height}</span> },
    { key: 'hash', title: 'Hash', render: (t) => <span className="data">{t.hash}</span> },
    {
      key: 'actions',
      title: '操作',
      width: 80,
      render: (t) => (
        <TextLink danger onClick={() => remove(t)}>
          <Trash2 size={13} strokeWidth={1.5} />
          删除
        </TextLink>
      ),
    },
  ]

  return (
    <Panel title="全部材质">
      {loading ? (
        <Spinner label="加载材质" />
      ) : items.length === 0 ? (
        <Empty text="没有材质" />
      ) : (
        <>
          <Table columns={columns} data={items} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </Panel>
  )
}

/* ================= YSM 模型管理 ================= */

function YsmTab() {
  const toast = useToast()
  const [items, setItems] = useState<AdminYsmModel[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await adminApi.listYsmModels({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setItems(res.models)
        setTotal(res.total)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page)
  }, [load, page])

  async function remove(m: AdminYsmModel) {
    if (!window.confirm(`确认删除模型「${m.name}」（#${m.id}）？已绑定该模型的档案将解除绑定。`)) return
    try {
      await adminApi.deleteYsmModel(m.id)
      toast.show('已删除', 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err.message || '删除失败', 'err')
    }
  }

  const columns: Column<AdminYsmModel>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (m) => <span className="data">{m.id}</span> },
    { key: 'owner', title: '用户', width: 80, align: 'right', render: (m) => <span className="data">#{m.user_id}</span> },
    {
      key: 'preview',
      title: '预览',
      width: 64,
      render: () => (
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-muted)', color: 'var(--text-3)' }}>
          <Box size={18} strokeWidth={1.5} />
        </span>
      ),
    },
    { key: 'name', title: '名称', render: (m) => <span className="mono">{m.name}</span> },
    {
      key: 'format',
      title: '格式',
      width: 70,
      render: (m) => <StatusTag kind={m.format === 'ysm' ? 'on' : 'warn'}>{m.format.toUpperCase()}</StatusTag>,
    },
    { key: 'size', title: '大小', width: 90, align: 'right', render: (m) => <span className="data tabular-nums">{formatSize(m.size)}</span> },
    { key: 'hash', title: 'Hash', render: (m) => <span className="data">{m.hash.slice(0, 16)}…</span> },
    {
      key: 'actions',
      title: '操作',
      width: 150,
      render: (m) => (
        <span style={{ display: 'inline-flex', gap: 12 }}>
          <a className="link-btn" href={m.url} download>
            <Download size={13} strokeWidth={1.5} />
            下载
          </a>
          <TextLink danger onClick={() => remove(m)}>
            <Trash2 size={13} strokeWidth={1.5} />
            删除
          </TextLink>
        </span>
      ),
    },
  ]

  return (
    <Panel title="全部 YSM 模型">
      {loading ? (
        <Spinner label="加载模型" />
      ) : items.length === 0 ? (
        <Empty text="没有 YSM 模型" />
      ) : (
        <>
          <Table columns={columns} data={items} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </Panel>
  )
}
