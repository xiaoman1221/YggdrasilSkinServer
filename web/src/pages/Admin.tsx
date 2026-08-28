import { useCallback, useEffect, useState } from 'react'
import { Box, Download, Flag, Pencil, Save, Shield, Trash2 } from 'lucide-react'
import { adminApi, AdminProfile, AdminTexture, AdminUser, AdminYsmModel, SiteSettings, TextureReport } from '../api/admin'
import { authApi, OAuthProvider } from '../api/auth'
import { LibraryItem, YsmLibraryItem } from '../api/library'
import { FONT_PRESETS } from '../lib/fonts'
import { downloadYsmFile } from '../api/profile'
import { formatSize } from '../utils/format'
import { useAuth } from '../stores/auth'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { user } = useAuth()
  const perms = (user?.permissions || '').split(',').map((p) => p.trim())
  const isSuper = user?.id === 1
  const isAdmin = isSuper || perms.includes('admin')
  const canUsers = isAdmin || perms.includes('user_manage')
  const canLibrary = isAdmin || perms.includes('texture_library')

  if (!isSuper && !isAdmin && !canUsers && !canLibrary) {
    return (
      <div>
        <h1 className="page-title">{t('admin.title')}</h1>
        <div className="empty" style={{ marginTop: 16 }}>
          {t('admin.noPermission')}
        </div>
      </div>
    )
  }

  const tabs: { value: Tab; label: string }[] = [
    ...(isSuper ? [{ value: 'settings' as Tab, label: t('admin.tabs.settings') }] : []),
    ...(canUsers ? [{ value: 'users' as Tab, label: t('admin.tabs.users') }] : []),
    ...(isAdmin ? [{ value: 'profiles' as Tab, label: t('admin.tabs.profiles') }] : []),
    ...(isAdmin ? [{ value: 'textures' as Tab, label: t('admin.tabs.textures') }] : []),
    ...(isAdmin ? [{ value: 'ysm' as Tab, label: t('admin.tabs.ysm') }] : []),
    ...(canLibrary ? [{ value: 'library' as Tab, label: t('admin.tabs.library') }] : []),
  ]
  const [tab, setTab] = useState<Tab>(tabs[0]?.value || 'settings')
  const activeTab = tabs.some((row) => row.value === tab) ? tab : tabs[0]?.value
  const roleText = isSuper
    ? t('admin.roleSuper')
    : isAdmin
      ? t('admin.roleAdmin')
      : t('admin.roleOperator', { perms: perms.filter((p) => p !== 'user').join(' / ') || 'user' })

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">{t('admin.title')}</h1>
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
  const { t } = useTranslation()
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
      toast.show(err.message || t('admin.settings.toastLoadError'), 'err')
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
      toast.show(t('admin.settings.toastTestEmailEmpty'), 'err')
      return
    }
    setTesting(true)
    try {
      await adminApi.emailTest(testTo.trim())
      toast.show(t('admin.settings.toastTestEmailOk'), 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('admin.settings.toastTestEmailFail'), 'err')
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
      toast.show(t('admin.settings.toastSaveOk'), 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.saveError'), 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label={t('admin.settings.spinnerLoading')} />

  return (
    <div style={{ maxWidth: 880, display: 'grid', gap: 20 }}>
      <Panel title={t('admin.settings.panelBasic')}>
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t('admin.settings.fieldSiteName')}>
              <Input value={form.site_name} onChange={(e) => set('site_name', e.target.value)} placeholder={t('admin.settings.placeholderSiteName')} />
            </Field>
            <Field label={t('admin.settings.fieldSiteUrl')} hint={t('admin.settings.hintSiteUrl')}>
              <Input className="mono" value={form.site_url} onChange={(e) => set('site_url', e.target.value)} placeholder={t('admin.settings.placeholderSiteUrl')} />
            </Field>
          </div>
          <Field label={t('admin.settings.fieldAnnouncement')} hint={t('admin.settings.hintAnnouncement')}>
            <Textarea value={form.site_announcement} onChange={(e) => set('site_announcement', e.target.value)} placeholder={t('admin.settings.placeholderAnnouncement')} />
          </Field>
          <div>
            <span className="field-label">{t('admin.settings.fieldGlobalFont')}</span>
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
              <Field label={t('admin.settings.fieldFontFamily')} hint={t('admin.settings.hintFontFamily')}>
                <Input
                  className="mono"
                  value={form.global_font_family}
                  onChange={(e) => set('global_font_family', e.target.value)}
                  placeholder={t('admin.settings.placeholderFontFamily')}
                />
              </Field>
              <Field label={t('admin.settings.fieldFontUrl')} hint={t('admin.settings.hintFontUrl')}>
                <Input
                  className="mono"
                  value={form.global_font_url}
                  onChange={(e) => set('global_font_url', e.target.value)}
                  placeholder={t('admin.settings.placeholderFontUrl')}
                />
              </Field>
            </div>
            <div style={{ maxWidth: 200, marginTop: 14 }}>
              <Field label={t('admin.settings.fieldFontSize')} hint={t('admin.settings.hintFontSize')}>
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
            label={t('admin.settings.fieldAuthBg')}
            hint={t('admin.settings.hintAuthBg')}
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

      <Panel title={t('admin.settings.panelYggdrasil')}>
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t('admin.settings.fieldServerName')}>
              <Input value={form.yggdrasil_server_name} onChange={(e) => set('yggdrasil_server_name', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldSkinDomains')} hint={t('admin.settings.hintSkinDomains')}>
              <Input value={form.yggdrasil_skin_domains} onChange={(e) => set('yggdrasil_skin_domains', e.target.value)} placeholder="localhost" />
            </Field>
            <Field label={t('admin.settings.fieldImplName')}>
              <Input value={form.yggdrasil_impl_name} onChange={(e) => set('yggdrasil_impl_name', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldImplVersion')}>
              <Input value={form.yggdrasil_impl_version} onChange={(e) => set('yggdrasil_impl_version', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleNonEmailLogin')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintNonEmailLogin')}</div>
            </div>
            <Switch checked={form.yggdrasil_non_email_login === 'true'} onChange={(v) => set('yggdrasil_non_email_login', String(v))} />
          </div>
        </div>
      </Panel>

      <Panel title={t('admin.settings.panelFeatures')}>
        <div className="panel-body" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleRegister')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintRegister')}</div>
            </div>
            <Switch checked={form.allow_register === 'true'} onChange={(v) => set('allow_register', String(v))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleUpload')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintUpload')}</div>
            </div>
            <Switch checked={form.allow_upload === 'true'} onChange={(v) => set('allow_upload', String(v))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label={t('admin.settings.fieldMaxUploadSize')}>
              <Input className="mono" type="number" min={1} value={form.max_upload_size_mb} onChange={(e) => set('max_upload_size_mb', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldMaxWidth')}>
              <Input className="mono" type="number" min={0} value={form.upload_max_width} onChange={(e) => set('upload_max_width', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldMaxHeight')}>
              <Input className="mono" type="number" min={0} value={form.upload_max_height} onChange={(e) => set('upload_max_height', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleYsmUpload')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintYsmUpload')}</div>
            </div>
            <Switch checked={form.allow_ysm_upload === 'true'} onChange={(v) => set('allow_ysm_upload', String(v))} />
          </div>
          <div style={{ maxWidth: 240 }}>
            <Field label={t('admin.settings.fieldMaxYsmSize')}>
              <Input className="mono" type="number" min={1} value={form.max_ysm_size_mb} onChange={(e) => set('max_ysm_size_mb', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleAutoDistribute')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintAutoDistribute')}</div>
            </div>
            <Switch checked={form.library_auto_distribute === 'true'} onChange={(v) => set('library_auto_distribute', String(v))} />
          </div>
          <Field label={t('admin.settings.fieldJwtExpire')}>
            <Input className="mono" type="number" min={1} value={form.jwt_expire_hours} onChange={(e) => set('jwt_expire_hours', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title={t('admin.settings.panelSecurity')}>
        <div className="panel-body" style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>{t('admin.settings.fieldCaptchaPolicy')}</div>
            <Segmented
              options={[
                { value: 'off', label: t('admin.settings.captchaOff') },
                { value: 'always', label: t('admin.settings.captchaAlways') },
                { value: 'after_failed', label: t('admin.settings.captchaAfterFailed') },
              ]}
              value={form.captcha_policy}
              onChange={(v) => set('captcha_policy', v)}
            />
            <p className="hint" style={{ margin: '10px 0 0' }}>
              {t('admin.settings.hintCaptcha')}
            </p>
          </div>
        </div>
      </Panel>

      <Panel title={t('admin.settings.panelMicrosoft')}>
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Field label={t('admin.settings.fieldClientId')}>
              <Input className="mono" value={form.mojang_client_id} onChange={(e) => set('mojang_client_id', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldClientSecret')}>
              <Input className="mono" type="password" value={form.mojang_client_secret} onChange={(e) => set('mojang_client_secret', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldRedirectUri')} hint={t('admin.settings.hintRedirectUri')}>
              <Input className="mono" value={form.mojang_redirect_uri} onChange={(e) => set('mojang_redirect_uri', e.target.value)} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title={t('admin.settings.panelSmtp')}>
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            {t('admin.settings.hintSmtp')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <Field label={t('admin.settings.fieldSmtpHost')}>
              <Input className="mono" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder={t('admin.settings.placeholderSmtpHost')} />
            </Field>
            <Field label={t('admin.settings.fieldSmtpPort')}>
              <Input className="mono" type="number" value={form.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} placeholder={t('admin.settings.placeholderSmtpPort')} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t('admin.settings.fieldSmtpUsername')}>
              <Input className="mono" value={form.smtp_username} onChange={(e) => set('smtp_username', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldSmtpPassword')}>
              <Input className="mono" type="password" value={form.smtp_password} onChange={(e) => set('smtp_password', e.target.value)} />
            </Field>
          </div>
          <Field label={t('admin.settings.fieldSmtpFrom')} hint={t('admin.settings.hintSmtpFrom')}>
            <Input className="mono" value={form.smtp_from} onChange={(e) => set('smtp_from', e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ width: 280 }}>
              <Field label={t('admin.settings.fieldTestEmail')}>
                <Input
                  className="mono"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder={t('admin.settings.placeholderTestEmail')}
                />
              </Field>
            </div>
            <Button disabled={testing || !form.smtp_host.trim()} onClick={sendTestEmail}>
              {testing ? t('admin.settings.btnSending') : t('admin.settings.btnSendTest')}
            </Button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            {t('admin.settings.hintSaveBeforeTest')}
          </p>
        </div>
      </Panel>

      <Panel title={t('admin.settings.panelOauthGo')}>
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            {t('admin.settings.hintOauthGo')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleOauthGo')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintOauthGoEnable')}</div>
            </div>
            <Switch checked={form.oauthgo_enabled === 'true'} onChange={(v) => set('oauthgo_enabled', String(v))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t('admin.settings.fieldOauthGoApi')}>
              <Input className="mono" value={form.oauthgo_api_base} onChange={(e) => set('oauthgo_api_base', e.target.value)} placeholder="https://o.1v.fit" />
            </Field>
            <Field label={t('admin.settings.fieldOauthGoAppId')}>
              <Input className="mono" value={form.oauthgo_app_id} onChange={(e) => set('oauthgo_app_id', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldOauthGoAppKey')}>
              <Input className="mono" type="password" value={form.oauthgo_app_key} onChange={(e) => set('oauthgo_app_key', e.target.value)} />
            </Field>
            <Field label={t('admin.settings.fieldOauthGoRedirect')} hint={t('admin.settings.hintOauthGoRedirect')}>
              <Input className="mono" readOnly value={`${form.site_url.trim() || t('admin.settings.placeholderYourSite')}/api/v1/auth/oauth/callback`} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{t('admin.settings.toggleOauthGoAutoCreate')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('admin.settings.hintOauthGoAutoCreate')}</div>
            </div>
            <Switch checked={form.oauthgo_auto_create !== 'false'} onChange={(v) => set('oauthgo_auto_create', String(v))} />
          </div>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>{t('admin.settings.fieldOauthGoProviders')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{t('admin.settings.hintOauthGoProviders')}</div>
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
                {t('admin.settings.hintOauthGoNoProviders')}
              </p>
            )}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save size={16} strokeWidth={1.5} />
          {saving ? t('admin.settings.btnSaving') : t('admin.settings.btnSave')}
        </Button>
      </div>
    </div>
  )
}

/* ================= 用户管理 ================= */

function UsersTab() {
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
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
      toast.show(t('admin.users.toastPermOk', { name: u.username }), 'ok')
      load(page, keyword)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.actionError'), 'err')
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
      toast.show(t('admin.users.toastEditOk'), 'ok')
      setEditFor(null)
      load(page, keyword)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.saveError'), 'err')
    } finally {
      setEditBusy(false)
    }
  }

  async function remove(u: AdminUser) {
    if (!window.confirm(t('admin.users.confirmDelete', { name: u.username }))) return
    try {
      await adminApi.deleteUser(u.id)
      toast.show(t('common.deleted'), 'ok')
      load(page, keyword)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.deleteError'), 'err')
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
    admin: t('admin.users.scopeAdmin'),
    texture_library: t('admin.users.scopeLibrary'),
    user_manage: t('admin.users.scopeUserManage'),
  }
  async function toggleScope(u: AdminUser, scope: string) {
    const cur = scopes(u)
    const next = cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]
    await setPerm(u, next.length ? next.join(',') : 'user')
  }

  const columns: Column<AdminUser>[] = [
    { key: 'id', title: t('admin.users.colId'), width: 60, align: 'right', render: (u) => <span className="data">{u.id}</span> },
    { key: 'username', title: t('admin.users.colUsername'), render: (u) => <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username}</span> },
    { key: 'email', title: t('admin.users.colEmail'), width: 220, render: (u) => <span className="data">{u.email}</span> },
    {
      key: 'perms',
      title: t('admin.users.colPermissions'),
      width: 180,
      render: (u) =>
        u.id === 1 ? (
          <StatusTag kind="on">{t('admin.users.statusSuperAdmin')}</StatusTag>
        ) : (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
            {scopes(u).length === 0 ? (
              <StatusTag kind="off">{t('admin.users.statusNormalUser')}</StatusTag>
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
      title: t('admin.users.colMojang'),
      width: 140,
      render: (u) => (u.mojang_name ? <span className="data">{u.mojang_name}</span> : <span className="data" style={{ color: 'var(--text-3)' }}>—</span>),
    },
    { key: 'created', title: t('admin.users.colCreated'), width: 170, render: (u) => <span className="data">{new Date(u.created_at).toLocaleString()}</span> },
    {
      key: 'actions',
      title: t('admin.users.colActions'),
      width: 280,
      render: (u) =>
        u.id === 1 ? null : (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12 }}>
            {meIsAdmin ? (
              <TextLink onClick={() => setPerm(u, scopes(u).includes('admin') ? 'user' : 'admin')}>
                <Shield size={13} strokeWidth={1.5} />
                {scopes(u).includes('admin') ? t('admin.users.actionRemoveAdmin') : t('admin.users.actionSetAdmin')}
              </TextLink>
            ) : null}
            <TextLink onClick={() => toggleScope(u, 'texture_library')}>
              <Box size={13} strokeWidth={1.5} />
              {scopes(u).includes('texture_library') ? t('admin.users.actionRemoveLibrary') : t('admin.users.actionGrantLibrary')}
            </TextLink>
            <TextLink onClick={() => toggleScope(u, 'user_manage')}>
              <Shield size={13} strokeWidth={1.5} />
              {scopes(u).includes('user_manage') ? t('admin.users.actionRemoveUserManage') : t('admin.users.actionGrantUserManage')}
            </TextLink>
            <TextLink onClick={() => openEdit(u)}>
              <Pencil size={13} strokeWidth={1.5} />
              {t('admin.users.actionEdit')}
            </TextLink>
            {canDelete(u) ? (
              <TextLink danger onClick={() => remove(u)}>
                <Trash2 size={13} strokeWidth={1.5} />
                {t('admin.users.actionDelete')}
              </TextLink>
            ) : null}
          </span>
        ),
    },
  ]

  return (
    <Panel
      title={t('admin.users.title')}
      extra={
        <input
          className="input"
          style={{ width: 220 }}
          placeholder={t('admin.users.placeholderSearch')}
          value={keyword}
          onChange={(e) => {
            setPage(1)
            setKeyword(e.target.value)
          }}
        />
      }
    >
      {loading ? (
        <Spinner label={t('admin.users.spinnerLoading')} />
      ) : users.length === 0 ? (
        <Empty text={t('admin.users.empty')} />
      ) : (
        <>
          <Table columns={columns} data={users} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      <Modal
        open={!!editFor}
        title={t('admin.users.modalEditTitle', { name: editFor?.username ?? '' })}
        onClose={() => setEditFor(null)}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditFor(null)}>
              {t('admin.users.modalCancel')}
            </Button>
            <Button variant="primary" disabled={editBusy} onClick={saveEdit}>
              {editBusy ? t('common.saving') : t('admin.users.modalSave')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label={t('admin.users.fieldUsername')} hint={t('admin.users.hintUsername')}>
            <Input
              className="mono"
              value={editForm.username}
              onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
            />
          </Field>
          <Field label={t('admin.users.fieldEmail')}>
            <Input
              className="mono"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label={t('admin.users.fieldPassword')} hint={t('admin.users.hintPassword')}>
            <Input
              className="mono"
              type="password"
              value={editForm.new_password}
              onChange={(e) => setEditForm((f) => ({ ...f, new_password: e.target.value }))}
              placeholder={t('admin.users.placeholderPassword')}
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
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
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
      toast.show(t('admin.profiles.toastRenameOk'), 'ok')
      setRenameTarget(null)
      setName('')
      load(page)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('admin.profiles.toastRenameError'), 'err')
    }
  }

  async function remove(p: AdminProfile) {
    if (!window.confirm(t('admin.profiles.confirmDelete', { name: p.name }))) return
    try {
      await adminApi.deleteProfile(p.uuid)
      toast.show(t('common.deleted'), 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err.message || t('common.deleteError'), 'err')
    }
  }

  const columns: Column<AdminProfile>[] = [
    { key: 'name', title: t('admin.profiles.colName'), width: 130, render: (p) => <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</span> },
    { key: 'uuid', title: t('admin.profiles.colUuid'), render: (p) => <span className="data">{p.uuid}</span> },
    { key: 'owner', title: t('admin.profiles.colOwner'), width: 90, align: 'right', render: (p) => <span className="data">#{p.user_id}</span> },
    {
      key: 'tex',
      title: t('admin.profiles.colTextures'),
      width: 130,
      render: (p) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <StatusTag kind={p.skin_texture_id ? 'on' : 'off'}>{p.skin_texture_id ? t('admin.profiles.tagSkin') : '—'}</StatusTag>
          <StatusTag kind={p.cape_texture_id ? 'on' : 'off'}>{p.cape_texture_id ? t('admin.profiles.tagCape') : '—'}</StatusTag>
        </span>
      ),
    },
    { key: 'created', title: t('admin.profiles.colCreated'), width: 170, render: (p) => <span className="data">{new Date(p.created_at).toLocaleString()}</span> },
    {
      key: 'actions',
      title: t('admin.profiles.colActions'),
      width: 110,
      render: (p) => (
        <span style={{ display: 'inline-flex', gap: 12 }}>
          <TextLink
            onClick={() => {
              setRenameTarget(p)
              setName(p.name)
            }}
          >
            {t('admin.profiles.actionRename')}
          </TextLink>
          <TextLink danger onClick={() => remove(p)}>
            {t('admin.profiles.actionDelete')}
          </TextLink>
        </span>
      ),
    },
  ]

  return (
    <>
      <Panel title={t('admin.profiles.title')}>
        {loading ? (
          <Spinner label={t('admin.profiles.spinnerLoading')} />
        ) : profiles.length === 0 ? (
          <Empty text={t('admin.profiles.empty')} />
        ) : (
          <>
            <Table columns={columns} data={profiles} />
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Panel>

      <Modal
        open={!!renameTarget}
        title={t('admin.profiles.modalRenameTitle')}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>{t('admin.profiles.modalCancel')}</Button>
            <Button variant="primary" onClick={doRename}>{t('admin.profiles.modalSave')}</Button>
          </>
        }
      >
        <Field label={t('admin.profiles.fieldNewName')}>
          <Input className="mono" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

/* ================= 材质管理 ================= */

type TexSub = 'all' | 'review' | 'reports'

function TexturesTab() {
  const { t } = useTranslation()
  const [sub, setSub] = useState<TexSub>('all')
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <Segmented<TexSub>
          options={[
            { value: 'all', label: t('admin.allTextures.title') },
            { value: 'review', label: t('admin.review.title') },
            { value: 'reports', label: t('admin.reports.title') },
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
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
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
      toast.show(t('admin.review.toastProcessed'), 'ok')
      load(page, status)
    } catch (err: any) {
      toast.show(err.message || t('common.actionError'), 'err')
    }
  }

  const columns: Column<LibraryItem>[] = [
    { key: 'id', title: t('admin.review.colId'), width: 60, align: 'right', render: (i) => <span className="data">{i.id}</span> },
    { key: 'title', title: t('admin.review.colTitle'), width: 180, render: (i) => <span className="mono" style={{ color: 'var(--text)' }}>{i.title || t('common.untitled')}</span> },
    { key: 'author', title: t('admin.review.colAuthor'), width: 80, align: 'right', render: (i) => <span className="data">#{i.author}</span> },
    {
      key: 'status',
      title: t('admin.review.colStatus'),
      width: 100,
      render: (i) => <StatusTag kind={i.status === 'approved' ? 'on' : i.status === 'pending' ? 'warn' : 'off'}>{t(`commonStatus.${i.status}`, i.status)}</StatusTag>,
    },
    {
      key: 'actions',
      title: t('admin.review.colActions'),
      width: 190,
      render: (i) =>
        i.status === 'pending' ? (
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <TextLink onClick={() => act(i, 'approve')}>{t('admin.review.actionApprove')}</TextLink>
            <TextLink danger onClick={() => act(i, 'reject')}>{t('admin.review.actionReject')}</TextLink>
          </span>
        ) : i.status === 'approved' ? (
          <TextLink danger onClick={() => act(i, 'unpublish')}>{t('admin.review.actionUnpublish')}</TextLink>
        ) : null,
    },
  ]

  return (
    <Panel
      title={t('admin.review.title')}
      extra={
        <Segmented<'all' | 'pending' | 'approved'>
          options={[
            { value: 'all', label: t('admin.review.filterAll') },
            { value: 'pending', label: t('admin.review.filterPending') },
            { value: 'approved', label: t('admin.review.filterApproved') },
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
        <Spinner label={t('admin.review.spinnerLoading')} />
      ) : items.length === 0 ? (
        <Empty text={t('admin.review.empty')} />
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
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
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
      toast.show(t('admin.reports.toastProcessed'), 'ok')
      load(page, status)
    } catch (err: any) {
      toast.show(err.message || t('common.actionError'), 'err')
    }
  }

  const columns: Column<TextureReport>[] = [
    { key: 'id', title: t('admin.reports.colId'), width: 60, align: 'right', render: (r) => <span className="data">{r.id}</span> },
    { key: 'item', title: t('admin.reports.colItem'), width: 90, align: 'right', render: (r) => <span className="data">#{r.item_id}</span> },
    { key: 'reporter', title: t('admin.reports.colReporter'), width: 80, align: 'right', render: (r) => <span className="data">#{r.reporter_id}</span> },
    { key: 'reason', title: t('admin.reports.colReason'), render: (r) => <span className="data">{r.reason || '—'}</span> },
    {
      key: 'status',
      title: t('admin.reports.colStatus'),
      width: 100,
      render: (r) => <StatusTag kind={r.status === 'pending' ? 'warn' : 'off'}>{t(`commonStatus.${r.status}`, r.status)}</StatusTag>,
    },
    {
      key: 'actions',
      title: t('admin.reports.colActions'),
      width: 140,
      render: (r) =>
        r.status === 'pending' ? (
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <TextLink onClick={() => act(r, 'accept')}>{t('admin.reports.actionAccept')}</TextLink>
            <TextLink danger onClick={() => act(r, 'reject')}>{t('admin.reports.actionReject')}</TextLink>
          </span>
        ) : null,
    },
  ]

  return (
    <Panel
      title={t('admin.reports.title')}
      extra={
        <Segmented<'all' | 'pending'>
          options={[
            { value: 'all', label: t('admin.reports.filterAll') },
            { value: 'pending', label: t('admin.reports.filterPending') },
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
        <Spinner label={t('admin.reports.spinnerLoading')} />
      ) : reports.length === 0 ? (
        <Empty text={t('admin.reports.empty')} />
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
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page)
  }, [load, page])

  async function remove(row: AdminTexture) {
    if (!window.confirm(t('admin.allTextures.confirmDelete', { id: row.id }))) return
    try {
      await adminApi.deleteTexture(row.id)
      toast.show(t('common.deleted'), 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err.message || t('common.deleteError'), 'err')
    }
  }

  const columns: Column<AdminTexture>[] = [
    { key: 'id', title: t('admin.allTextures.colId'), width: 60, align: 'right', render: (row) => <span className="data">{row.id}</span> },
    { key: 'owner', title: t('admin.allTextures.colOwner'), width: 80, align: 'right', render: (row) => <span className="data">#{row.user_id}</span> },
    {
      key: 'preview',
      title: t('admin.allTextures.colPreview'),
      width: 64,
      render: (row) => <img className="thumb" src={new URL(row.url, window.location.origin).pathname} alt="" />,
    },
    { key: 'type', title: t('admin.allTextures.colType'), width: 80, render: (row) => <StatusTag kind={row.type === 'skin' ? 'on' : 'warn'}>{row.type === 'skin' ? t('admin.allTextures.tagSkin') : t('admin.allTextures.tagCape')}</StatusTag> },
    { key: 'model', title: t('admin.allTextures.colModel'), width: 80, render: (row) => <span className="data">{row.model}</span> },
    { key: 'size', title: t('admin.allTextures.colSize'), width: 100, align: 'right', render: (row) => <span className="data">{row.width}×{row.height}</span> },
    { key: 'hash', title: t('admin.allTextures.colHash'), render: (row) => <span className="data">{row.hash}</span> },
    {
      key: 'actions',
      title: t('admin.allTextures.colActions'),
      width: 80,
      render: (row) => (
        <TextLink danger onClick={() => remove(row)}>
          <Trash2 size={13} strokeWidth={1.5} />
          {t('admin.allTextures.actionDelete')}
        </TextLink>
      ),
    },
  ]

  return (
    <Panel title={t('admin.allTextures.title')}>
      {loading ? (
        <Spinner label={t('admin.allTextures.spinnerLoading')} />
      ) : items.length === 0 ? (
        <Empty text={t('admin.allTextures.empty')} />
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
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
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
    if (!window.confirm(t('admin.ysm.confirmDelete', { name: m.name, id: m.id }))) return
    try {
      await adminApi.deleteYsmModel(m.id)
      toast.show(t('common.deleted'), 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err.message || t('common.deleteError'), 'err')
    }
  }

  const columns: Column<AdminYsmModel>[] = [
    { key: 'id', title: t('admin.ysm.colId'), width: 60, align: 'right', render: (m) => <span className="data">{m.id}</span> },
    { key: 'owner', title: t('admin.ysm.colOwner'), width: 80, align: 'right', render: (m) => <span className="data">#{m.user_id}</span> },
    {
      key: 'preview',
      title: t('admin.ysm.colPreview'),
      width: 64,
      render: () => (
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-muted)', color: 'var(--text-3)' }}>
          <Box size={18} strokeWidth={1.5} />
        </span>
      ),
    },
    { key: 'name', title: t('admin.ysm.colName'), render: (m) => <span className="mono">{m.name}</span> },
    {
      key: 'format',
      title: t('admin.ysm.colFormat'),
      width: 70,
      render: (m) => <StatusTag kind={m.format === 'ysm' ? 'on' : 'warn'}>{m.format.toUpperCase()}</StatusTag>,
    },
    { key: 'size', title: t('admin.ysm.colSize'), width: 90, align: 'right', render: (m) => <span className="data tabular-nums">{formatSize(m.size)}</span> },
    { key: 'hash', title: t('admin.ysm.colHash'), render: (m) => <span className="data">{m.hash.slice(0, 16)}…</span> },
    {
      key: 'actions',
      title: t('admin.ysm.colActions'),
      width: 150,
      render: (m) => (
        <span style={{ display: 'inline-flex', gap: 12 }}>
          <span
            className="link-btn"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              downloadYsmFile(m).catch((err: any) => toast.show(err?.message || t('admin.ysm.toastDownloadError'), 'err'))
            }}
          >
            <Download size={13} strokeWidth={1.5} />
            {t('admin.ysm.actionDownload')}
          </span>
          <TextLink danger onClick={() => remove(m)}>
            <Trash2 size={13} strokeWidth={1.5} />
            {t('admin.ysm.actionDelete')}
          </TextLink>
        </span>
      ),
    },
  ]

  return (
    <Panel title={t('admin.ysm.title')}>
      {loading ? (
        <Spinner label={t('admin.ysm.spinnerLoading')} />
      ) : items.length === 0 ? (
        <Empty text={t('admin.ysm.empty')} />
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
  const { t } = useTranslation()
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
        toast.show(err.message || t('common.loadError'), 'err')
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
        toast.show(err.message || t('common.loadError'), 'err')
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
        toast.show(err.message || t('common.loadError'), 'err')
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
      toast.show(action === 'approve' ? t('admin.library.toastApproved') : action === 'reject' ? t('admin.library.toastRejected') : t('admin.library.toastUnpublished'), 'ok')
      load(page, status)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.actionError'), 'err')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReport(r: TextureReport, action: 'accept' | 'reject') {
    setReportBusyId(r.id)
    try {
      await adminApi.handleReport(r.id, action)
      toast.show(action === 'accept' ? t('admin.library.toastReportAccepted') : t('admin.library.toastReportRejected'), 'ok')
      loadReports(reportPage)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.actionError'), 'err')
    } finally {
      setReportBusyId(null)
    }
  }

  async function actYsm(item: YsmLibraryItem, action: 'approve' | 'reject' | 'unpublish') {
    setYsmBusyId(item.id)
    try {
      await adminApi.setYsmLibraryStatus(item.id, action)
      toast.show(action === 'approve' ? t('admin.library.toastApproved') : action === 'reject' ? t('admin.library.toastRejected') : t('admin.library.toastUnpublished'), 'ok')
      loadYsm(ysmPage, ysmStatus)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('common.actionError'), 'err')
    } finally {
      setYsmBusyId(null)
    }
  }

  const statusLabel: Record<string, string> = { pending: t('admin.library.statusPending'), approved: t('admin.library.statusApproved'), rejected: t('admin.library.statusRejected') }
  const statusKind: Record<string, 'warn' | 'on' | 'danger'> = { pending: 'warn', approved: 'on', rejected: 'danger' }

  const columns: Column<LibraryItem>[] = [
    { key: 'id', title: t('admin.library.skinColId'), width: 60, align: 'right', render: (row) => <span className="data">{row.id}</span> },
    { key: 'owner', title: t('admin.library.skinColAuthor'), width: 80, align: 'right', render: (row) => <span className="data">#{row.author}</span> },
    {
      key: 'preview',
      title: t('admin.library.skinColPreview'),
      width: 64,
      render: (row) =>
        row.texture?.url ? (
          <img className="thumb" src={new URL(row.texture.url, window.location.origin).pathname} alt="" />
        ) : (
          <span className="data">—</span>
        ),
    },
    { key: 'title', title: t('admin.library.skinColTitle'), render: (row) => <span className="mono">{row.title}</span> },
    {
      key: 'status',
      title: t('admin.library.skinColStatus'),
      width: 90,
      render: (row) => <StatusTag kind={statusKind[row.status] || 'off'}>{statusLabel[row.status] || row.status}</StatusTag>,
    },
    {
      key: 'actions',
      title: t('admin.library.skinColActions'),
      width: 200,
      render: (row) => (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12 }}>
          {row.status === 'pending' ? (
            <>
              <TextLink onClick={() => act(row, 'approve')}>
                {busyId === row.id ? t('admin.library.actionProcessing') : t('admin.library.actionApprove')}
              </TextLink>
              <TextLink danger onClick={() => act(row, 'reject')}>
                {t('admin.library.actionReject')}
              </TextLink>
            </>
          ) : row.status === 'approved' ? (
            <TextLink danger onClick={() => act(row, 'unpublish')}>
              {t('admin.library.actionUnpublish')}
            </TextLink>
          ) : null}
        </span>
      ),
    },
  ]

  const ysmColumns: Column<YsmLibraryItem>[] = [
    { key: 'id', title: t('admin.library.ysmColId'), width: 60, align: 'right', render: (row) => <span className="data">{row.id}</span> },
    { key: 'owner', title: t('admin.library.ysmColAuthor'), width: 80, align: 'right', render: (row) => <span className="data">#{row.author}</span> },
    {
      key: 'preview',
      title: t('admin.library.ysmColPreview'),
      width: 64,
      render: (row) =>
        row.model?.preview_url ? (
          <img className="thumb" src={row.model.preview_url} alt="" />
        ) : (
          <span className="data">—</span>
        ),
    },
    { key: 'title', title: t('admin.library.ysmColTitle'), render: (row) => <span className="mono">{row.title || row.model?.name || t('common.untitled')}</span> },
    {
      key: 'price',
      title: t('admin.library.ysmColPrice'),
      width: 70,
      render: (row) => <StatusTag kind={row.is_free ? 'on' : 'warn'}>{row.price_info || t('admin.library.ysmTagPaid')}</StatusTag>,
    },
    {
      key: 'status',
      title: t('admin.library.ysmColStatus'),
      width: 90,
      render: (row) => <StatusTag kind={statusKind[row.status] || 'off'}>{statusLabel[row.status] || row.status}</StatusTag>,
    },
    {
      key: 'actions',
      title: t('admin.library.ysmColActions'),
      width: 200,
      render: (row) => (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12 }}>
          {row.status === 'pending' ? (
            <>
              <TextLink onClick={() => actYsm(row, 'approve')}>
                {ysmBusyId === row.id ? t('admin.library.ysmActionProcessing') : t('admin.library.actionApprove')}
              </TextLink>
              <TextLink danger onClick={() => actYsm(row, 'reject')}>
                {t('admin.library.actionReject')}
              </TextLink>
            </>
          ) : row.status === 'approved' ? (
            <TextLink danger onClick={() => actYsm(row, 'unpublish')}>
              {t('admin.library.actionUnpublish')}
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
            { value: 'skin', label: t('admin.library.subSkin') },
            { value: 'ysm', label: t('admin.library.subYsm') },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>

      {kind === 'skin' ? (
        <Panel
          title={t('admin.library.skinTitle')}
          extra={
            <Segmented
              options={[
                { value: 'pending', label: t('admin.library.filterPending') },
                { value: 'approved', label: t('admin.library.filterApproved') },
                { value: 'rejected', label: t('admin.library.filterRejected') },
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
            <Spinner label={t('admin.library.skinSpinner')} />
          ) : items.length === 0 ? (
            <Empty text={t('admin.library.skinEmpty')} />
          ) : (
            <>
              <Table columns={columns} data={items} />
              <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </Panel>
      ) : (
        <Panel
          title={t('admin.library.ysmTitle')}
          extra={
            <Segmented
              options={[
                { value: 'pending', label: t('admin.library.filterPending') },
                { value: 'approved', label: t('admin.library.filterApproved') },
                { value: 'rejected', label: t('admin.library.filterRejected') },
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
            <Spinner label={t('admin.library.ysmSpinner')} />
          ) : ysmItems.length === 0 ? (
            <Empty text={t('admin.library.ysmEmpty')} />
          ) : (
            <>
              <Table columns={ysmColumns} data={ysmItems} />
              <Pager page={ysmPage} total={ysmTotal} pageSize={PAGE_SIZE} onChange={setYsmPage} />
            </>
          )}
        </Panel>
      )}

      <Panel title={t('admin.library.reportsTitle')}>
        {reportsLoading ? (
          <Spinner label={t('admin.library.reportsSpinner')} />
        ) : reports.length === 0 ? (
          <Empty text={t('admin.library.reportsEmpty')} />
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
                      {t('admin.library.reportCardHeader', { itemId: r.item_id, reporterId: r.reporter_id })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{r.reason}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <span style={{ display: 'inline-flex', gap: 12 }}>
                    <TextLink onClick={() => handleReport(r, 'accept')}>
                      {reportBusyId === r.id ? t('admin.library.reportActionProcessing') : t('admin.library.reportActionAccept')}
                    </TextLink>
                    <TextLink danger onClick={() => handleReport(r, 'reject')}>
                      {t('admin.library.reportActionReject')}
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
