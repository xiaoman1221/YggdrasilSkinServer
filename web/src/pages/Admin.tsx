import { useCallback, useEffect, useState } from 'react'
import { Box, Download, Flag, Pencil, Save, Shield, Trash2 } from 'lucide-react'
import { adminApi, AdminProfile, AdminTexture, AdminUser, AdminYsmModel, SiteSettings, TextureReport } from '../api/admin'
import { authApi, OAuthProvider } from '../api/auth'
import { LibraryItem, YsmLibraryItem } from '../api/library'
import { FONT_PRESETS } from '../lib/fonts'
import { downloadYsmFile } from '../api/profile'
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

// parseBgImages 把后台存储的 JSON 数组（或逗号/换行分隔文本）解析为 URL 列表。
function parseBgImages(raw: string): string[] {
  const t = (raw || '').trim()
  if (!t) return []
  try {
    const arr = JSON.parse(t)
    if (Array.isArray(arr)) return arr.map((s) => String(s).trim()).filter(Boolean)
  } catch {
    /* fall through */
  }
  return t
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// parseProviderNames 解析 oauthgo_providers 设置（JSON 数组字符串）。
function parseProviderNames(raw: string): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

// toggleProvider 在 JSON 数组字符串中增删一个渠道名。
function toggleProvider(raw: string, name: string): string {
  const set = new Set(parseProviderNames(raw))
  if (set.has(name)) set.delete(name)
  else set.add(name)
  return JSON.stringify([...set])
}

type Tab = 'settings' | 'users' | 'profiles' | 'textures' | 'ysm' | 'library'

export default function Admin() {
  const { user } = useAuth()
  const perms = (user?.permissions || '').split(',').map((p) => p.trim())
  const isSuper = user?.id === 1
  const isAdmin = isSuper || perms.includes('admin')
  const canUsers = isAdmin || perms.includes('user_manage')
  const canLibrary = isAdmin || perms.includes('texture_library')

  if (!isSuper && !isAdmin && !canUsers && !canLibrary) {
    return (
      <div>
        <h1 className="page-title">管理</h1>
        <div className="empty" style={{ marginTop: 16 }}>
          当前账号无管理权限
        </div>
      </div>
    )
  }

  const tabs: { value: Tab; label: string }[] = [
    ...(isSuper ? [{ value: 'settings' as Tab, label: '站点设置' }] : []),
    ...(canUsers ? [{ value: 'users' as Tab, label: '用户管理' }] : []),
    ...(isAdmin ? [{ value: 'profiles' as Tab, label: '档案管理' }] : []),
    ...(isAdmin ? [{ value: 'textures' as Tab, label: '材质管理' }] : []),
    ...(isAdmin ? [{ value: 'ysm' as Tab, label: '模型管理' }] : []),
    ...(canLibrary ? [{ value: 'library' as Tab, label: '皮肤库审核' }] : []),
  ]
  const [tab, setTab] = useState<Tab>(tabs[0]?.value || 'settings')
  const activeTab = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value
  const roleText = isSuper
    ? '超级管理员（UID = 1）'
    : isAdmin
      ? '管理员'
      : `operator（${perms.filter((p) => p !== 'user').join(' / ') || 'user'}）`

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">管理</h1>
        <p className="page-sub">{roleText}</p>
      </header>

      <div style={{ marginBottom: 20 }}>
        <Segmented<Tab> options={tabs} value={activeTab} onChange={setTab} />
      </div>

      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'profiles' && <ProfilesTab />}
      {activeTab === 'textures' && <TexturesTab />}
      {activeTab === 'ysm' && <YsmTab />}
      {activeTab === 'library' && <LibraryTab />}
    </div>
  )
}

/* ================= 站点设置 ================= */

const emptySettings: SiteSettings = {
  site_name: '',
  site_announcement: '',
  site_url: '',
  global_font_family: '',
  global_font_url: '',
  global_font_size: '16',
  auth_bg_images: '',
  allow_register: 'true',
  allow_upload: 'true',
  max_upload_size_mb: '4',
  allow_ysm_upload: 'true',
  max_ysm_size_mb: '16',
  library_auto_distribute: 'false',
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
  oauthgo_providers: '',
  oauthgo_auto_create: 'true',
  captcha_policy: 'off',
}

function SettingsTab() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<SiteSettings>(emptySettings)
  const [providers, setProviders] = useState<OAuthProvider[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.getSettings()
      setForm({ ...emptySettings, ...res.settings })
      authApi
        .oauthProviders()
        .then((r) => setProviders(r.providers || []))
        .catch(() => setProviders([]))
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
        global_font_family: form.global_font_family.trim(),
        global_font_url: form.global_font_url.trim(),
        global_font_size: String(Math.max(12, Math.min(24, parseInt(form.global_font_size, 10) || 16))),
        auth_bg_images: JSON.stringify(parseBgImages(form.auth_bg_images)),
        allow_register: String(form.allow_register === 'true'),
        allow_upload: String(form.allow_upload === 'true'),
        max_upload_size_mb: String(Math.max(1, parseInt(form.max_upload_size_mb, 10) || 4)),
        allow_ysm_upload: String(form.allow_ysm_upload === 'true'),
        max_ysm_size_mb: String(Math.max(1, parseInt(form.max_ysm_size_mb, 10) || 16)),
        library_auto_distribute: String(form.library_auto_distribute === 'true'),
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
        oauthgo_providers: parseProviderNames(form.oauthgo_providers).length
          ? JSON.stringify(parseProviderNames(form.oauthgo_providers))
          : '',
        oauthgo_auto_create: String(form.oauthgo_auto_create !== 'false'),
        captcha_policy: form.captcha_policy || 'off',
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
          <div>
            <span className="field-label">全局字体</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 14px' }}>
              {FONT_PRESETS.map((p) => {
                const active =
                  (form.global_font_family || '') === p.family && (form.global_font_url || '') === p.url
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      set('global_font_family', p.family)
                      set('global_font_url', p.url)
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      color: active ? 'var(--accent-deep)' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="字体名称（font-family）" hint="自定义字体时填写 CSS 字体栈">
                <Input
                  className="mono"
                  value={form.global_font_family}
                  onChange={(e) => set('global_font_family', e.target.value)}
                  placeholder='"Noto Sans SC", sans-serif'
                />
              </Field>
              <Field label="字体文件 URL" hint=".ttf / .woff2；留空使用系统字体">
                <Input
                  className="mono"
                  value={form.global_font_url}
                  onChange={(e) => set('global_font_url', e.target.value)}
                  placeholder="https://example.com/font.woff2"
                />
              </Field>
            </div>
            <div style={{ maxWidth: 200, marginTop: 14 }}>
              <Field label="全局字号（px）" hint="默认 16；数值越大文字越大">
                <Input
                  className="mono"
                  type="number"
                  min={12}
                  max={24}
                  value={form.global_font_size}
                  onChange={(e) => set('global_font_size', e.target.value)}
                />
              </Field>
            </div>
          </div>
          <Field
            label="认证页随机背景图"
            hint="每行一个图片 URL；登录/注册/找回密码等页面会随机展示其中一张"
          >
            <Textarea
              className="mono"
              value={parseBgImages(form.auth_bg_images).join('\n')}
              onChange={(e) => set('auth_bg_images', e.target.value)}
              placeholder={'https://example.com/bg1.png\nhttps://example.com/bg2.jpg'}
              rows={4}
            />
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>审核通过后自动分发到所有玩家仓库</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>开启后，新审核通过的公共皮肤/YSM 模型会自动复制到所有用户的个人仓库（按内容去重）</div>
            </div>
            <Switch checked={form.library_auto_distribute === 'true'} onChange={(v) => set('library_auto_distribute', String(v))} />
          </div>
          <Field label="站点 JWT 有效期（小时）">
            <Input className="mono" type="number" min={1} value={form.jwt_expire_hours} onChange={(e) => set('jwt_expire_hours', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="登录安全">
        <div className="panel-body" style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>图形验证码策略</div>
            <Segmented
              options={[
                { value: 'off', label: '关闭' },
                { value: 'always', label: '登录/注册始终需要' },
                { value: 'after_failed', label: '连续登录失败后需要' },
              ]}
              value={form.captcha_policy}
              onChange={(v) => set('captcha_policy', v)}
            />
            <p className="hint" style={{ margin: '10px 0 0' }}>
              连续失败达到 3 次后，登录需输入图形验证码（10 分钟内有效）。
            </p>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>自动创建账号</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>关闭后，未绑定本站账号的第三方登录会提示先到个人中心绑定</div>
            </div>
            <Switch checked={form.oauthgo_auto_create !== 'false'} onChange={(v) => set('oauthgo_auto_create', String(v))} />
          </div>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>支持的登录方式</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>勾选允许使用的渠道；全部不勾选时默认允许平台所有渠道</div>
            {providers.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {providers.map((p) => {
                  const checked = parseProviderNames(form.oauthgo_providers).includes(p.name)
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => set('oauthgo_providers', toggleProvider(form.oauthgo_providers, p.name))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: checked ? 'var(--accent-soft)' : 'transparent',
                        color: checked ? 'var(--accent-deep)' : 'var(--text-2)',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {checked ? '✓ ' : ''}
                      {p.display_name || p.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                无法获取渠道列表：请确认 API 地址可访问（保存设置后自动重试）。
              </p>
            )}
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
  const meIsAdmin = me?.id === 1 || (me?.permissions || '').split(',').includes('admin')
  const scopes = (u: AdminUser) =>
    (u.permissions || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'user')
  const scopeLabel: Record<string, string> = {
    admin: '管理员',
    texture_library: '皮肤库审核',
    user_manage: '用户管理',
  }
  async function toggleScope(u: AdminUser, scope: string) {
    const cur = scopes(u)
    const next = cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]
    await setPerm(u, next.length ? next.join(',') : 'user')
  }

  const columns: Column<AdminUser>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (u) => <span className="data">{u.id}</span> },
    { key: 'username', title: '用户名', render: (u) => <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username}</span> },
    { key: 'email', title: '邮箱', width: 220, render: (u) => <span className="data">{u.email}</span> },
    {
      key: 'perms',
      title: '权限',
      width: 180,
      render: (u) =>
        u.id === 1 ? (
          <StatusTag kind="on">超级管理员</StatusTag>
        ) : (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
            {scopes(u).length === 0 ? (
              <StatusTag kind="off">普通用户</StatusTag>
            ) : (
              scopes(u).map((s) => (
                <StatusTag key={s} kind={s === 'admin' ? 'on' : 'warn'}>
                  {scopeLabel[s] || s}
                </StatusTag>
              ))
            )}
          </span>
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
      width: 280,
      render: (u) =>
        u.id === 1 ? null : (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12 }}>
            {meIsAdmin ? (
              <TextLink onClick={() => setPerm(u, scopes(u).includes('admin') ? 'user' : 'admin')}>
                <Shield size={13} strokeWidth={1.5} />
                {scopes(u).includes('admin') ? '取消管理员' : '设为管理员'}
              </TextLink>
            ) : null}
            <TextLink onClick={() => toggleScope(u, 'texture_library')}>
              <Box size={13} strokeWidth={1.5} />
              {scopes(u).includes('texture_library') ? '取消皮肤库' : '皮肤库审核'}
            </TextLink>
            <TextLink onClick={() => toggleScope(u, 'user_manage')}>
              <Shield size={13} strokeWidth={1.5} />
              {scopes(u).includes('user_manage') ? '取消用户管理' : '用户管理'}
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
            { value: 'review', label: '皮肤库审核' },
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
      title="皮肤库审核"
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
          <span
            className="link-btn"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              downloadYsmFile(m).catch((err: any) => toast.show(err?.message || '下载失败', 'err'))
            }}
          >
            <Download size={13} strokeWidth={1.5} />
            下载
          </span>
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

/* ================= 皮肤库审核（texture_library operator） ================= */

function LibraryTab() {
  const toast = useToast()
  const [kind, setKind] = useState<'skin' | 'ysm'>('skin')

  // 皮肤审核
  const [items, setItems] = useState<LibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<number | null>(null)

  // YSM 模型审核
  const [ysmItems, setYsmItems] = useState<YsmLibraryItem[]>([])
  const [ysmTotal, setYsmTotal] = useState(0)
  const [ysmStatus, setYsmStatus] = useState('pending')
  const [ysmLoading, setYsmLoading] = useState(true)
  const [ysmPage, setYsmPage] = useState(1)
  const [ysmBusyId, setYsmBusyId] = useState<number | null>(null)

  const [reports, setReports] = useState<TextureReport[]>([])
  const [reportTotal, setReportTotal] = useState(0)
  const [reportPage, setReportPage] = useState(1)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportBusyId, setReportBusyId] = useState<number | null>(null)

  const load = useCallback(
    async (p: number, st: string) => {
      setLoading(true)
      try {
        const res = await adminApi.listLibraryTextures({ status: st, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setItems(res.items || [])
        setTotal(res.total || 0)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  const loadReports = useCallback(
    async (p: number) => {
      setReportsLoading(true)
      try {
        const res = await adminApi.listReports({ status: 'open', limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setReports(res.reports || [])
        setReportTotal(res.total || 0)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setReportsLoading(false)
      }
    },
    [toast],
  )

  const loadYsm = useCallback(
    async (p: number, st: string) => {
      setYsmLoading(true)
      try {
        const res = await adminApi.listYsmLibraryItems({ status: st, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setYsmItems(res.items || [])
        setYsmTotal(res.total || 0)
      } catch (err: any) {
        toast.show(err.message || '加载失败', 'err')
      } finally {
        setYsmLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page, status)
  }, [load, page, status])

  useEffect(() => {
    loadReports(reportPage)
  }, [loadReports, reportPage])

  useEffect(() => {
    loadYsm(ysmPage, ysmStatus)
  }, [loadYsm, ysmPage, ysmStatus])

  async function act(item: LibraryItem, action: 'approve' | 'reject' | 'unpublish') {
    setBusyId(item.id)
    try {
      await adminApi.setLibraryStatus(item.id, action)
      toast.show(action === 'approve' ? '已通过' : action === 'reject' ? '已拒绝' : '已下架', 'ok')
      load(page, status)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '操作失败', 'err')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReport(r: TextureReport, action: 'accept' | 'reject') {
    setReportBusyId(r.id)
    try {
      await adminApi.handleReport(r.id, action)
      toast.show(action === 'accept' ? '已接受举报并处理' : '已驳回举报', 'ok')
      loadReports(reportPage)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '操作失败', 'err')
    } finally {
      setReportBusyId(null)
    }
  }

  async function actYsm(item: YsmLibraryItem, action: 'approve' | 'reject' | 'unpublish') {
    setYsmBusyId(item.id)
    try {
      await adminApi.setYsmLibraryStatus(item.id, action)
      toast.show(action === 'approve' ? '已通过' : action === 'reject' ? '已拒绝' : '已下架', 'ok')
      loadYsm(ysmPage, ysmStatus)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '操作失败', 'err')
    } finally {
      setYsmBusyId(null)
    }
  }

  const statusLabel: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
  const statusKind: Record<string, 'warn' | 'on' | 'danger'> = { pending: 'warn', approved: 'on', rejected: 'danger' }

  const columns: Column<LibraryItem>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (t) => <span className="data">{t.id}</span> },
    { key: 'owner', title: '作者', width: 80, align: 'right', render: (t) => <span className="data">#{t.author}</span> },
    {
      key: 'preview',
      title: '预览',
      width: 64,
      render: (t) =>
        t.texture?.url ? (
          <img className="thumb" src={new URL(t.texture.url, window.location.origin).pathname} alt="" />
        ) : (
          <span className="data">—</span>
        ),
    },
    { key: 'title', title: '标题', render: (t) => <span className="mono">{t.title}</span> },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (t) => <StatusTag kind={statusKind[t.status] || 'off'}>{statusLabel[t.status] || t.status}</StatusTag>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 200,
      render: (t) => (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12 }}>
          {t.status === 'pending' ? (
            <>
              <TextLink onClick={() => act(t, 'approve')}>
                {busyId === t.id ? '处理中…' : '通过'}
              </TextLink>
              <TextLink danger onClick={() => act(t, 'reject')}>
                拒绝
              </TextLink>
            </>
          ) : t.status === 'approved' ? (
            <TextLink danger onClick={() => act(t, 'unpublish')}>
              下架
            </TextLink>
          ) : null}
        </span>
      ),
    },
  ]

  const ysmColumns: Column<YsmLibraryItem>[] = [
    { key: 'id', title: 'ID', width: 60, align: 'right', render: (t) => <span className="data">{t.id}</span> },
    { key: 'owner', title: '作者', width: 80, align: 'right', render: (t) => <span className="data">#{t.author}</span> },
    {
      key: 'preview',
      title: '预览',
      width: 64,
      render: (t) =>
        t.model?.preview_url ? (
          <img className="thumb" src={t.model.preview_url} alt="" />
        ) : (
          <span className="data">—</span>
        ),
    },
    { key: 'title', title: '标题', render: (t) => <span className="mono">{t.title || t.model?.name || '未命名'}</span> },
    {
      key: 'price',
      title: '资费',
      width: 70,
      render: (t) => <StatusTag kind={t.is_free ? 'on' : 'warn'}>{t.price_info || '付费'}</StatusTag>,
    },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (t) => <StatusTag kind={statusKind[t.status] || 'off'}>{statusLabel[t.status] || t.status}</StatusTag>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 200,
      render: (t) => (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12 }}>
          {t.status === 'pending' ? (
            <>
              <TextLink onClick={() => actYsm(t, 'approve')}>
                {ysmBusyId === t.id ? '处理中…' : '通过'}
              </TextLink>
              <TextLink danger onClick={() => actYsm(t, 'reject')}>
                拒绝
              </TextLink>
            </>
          ) : t.status === 'approved' ? (
            <TextLink danger onClick={() => actYsm(t, 'unpublish')}>
              下架
            </TextLink>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <Segmented<'skin' | 'ysm'>
          options={[
            { value: 'skin', label: '皮肤审核' },
            { value: 'ysm', label: 'YSM 模型审核' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>

      {kind === 'skin' ? (
        <Panel
          title="皮肤审核"
          extra={
            <Segmented
              options={[
                { value: 'pending', label: '待审核' },
                { value: 'approved', label: '已通过' },
                { value: 'rejected', label: '已拒绝' },
              ]}
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPage(1)
              }}
            />
          }
        >
          {loading ? (
            <Spinner label="加载皮肤" />
          ) : items.length === 0 ? (
            <Empty text="没有符合条件的皮肤" />
          ) : (
            <>
              <Table columns={columns} data={items} />
              <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </Panel>
      ) : (
        <Panel
          title="YSM 模型审核"
          extra={
            <Segmented
              options={[
                { value: 'pending', label: '待审核' },
                { value: 'approved', label: '已通过' },
                { value: 'rejected', label: '已拒绝' },
              ]}
              value={ysmStatus}
              onChange={(v) => {
                setYsmStatus(v)
                setYsmPage(1)
              }}
            />
          }
        >
          {ysmLoading ? (
            <Spinner label="加载 YSM 模型" />
          ) : ysmItems.length === 0 ? (
            <Empty text="没有符合条件的 YSM 模型" />
          ) : (
            <>
              <Table columns={ysmColumns} data={ysmItems} />
              <Pager page={ysmPage} total={ysmTotal} pageSize={PAGE_SIZE} onChange={setYsmPage} />
            </>
          )}
        </Panel>
      )}

      <Panel title="举报处理">
        {reportsLoading ? (
          <Spinner label="加载举报" />
        ) : reports.length === 0 ? (
          <Empty text="没有待处理举报" />
        ) : (
          <>
            <div style={{ display: 'grid', gap: 10, padding: 14 }}>
              {reports.map((r) => (
                <div
                  key={r.id}
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
                  <Flag size={16} strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>
                      材质 #{r.item_id} · 举报人 #{r.reporter_id}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{r.reason}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <span style={{ display: 'inline-flex', gap: 12 }}>
                    <TextLink onClick={() => handleReport(r, 'accept')}>
                      {reportBusyId === r.id ? '处理中…' : '接受'}
                    </TextLink>
                    <TextLink danger onClick={() => handleReport(r, 'reject')}>
                      驳回
                    </TextLink>
                  </span>
                </div>
              ))}
            </div>
            <Pager page={reportPage} total={reportTotal} pageSize={PAGE_SIZE} onChange={setReportPage} />
          </>
        )}
      </Panel>
    </div>
  )
}
