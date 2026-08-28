import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import { profileApi, Profile, textureUrl } from '../api/profile'
import { siteApi } from '../api/site'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/auth'
import { useToast } from '../components/Toast'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Panel, Spinner, StatusTag, TextLink } from '../components/ui'
import { PreviewCard } from '../components/PreviewCard'
import { assetUrl } from '../utils/format'

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const { t } = useTranslation()
  const apiUrl = `${window.location.origin}/api/yggdrasil`
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [announcement, setAnnouncement] = useState('')
  const [siteName, setSiteName] = useState('')
  const [mojangEnabled, setMojangEnabled] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await profileApi.list()
      setProfiles(res.profiles)
    } catch (err: any) {
      toast.show(err.message || t('dashboard.toast.loadFailed'), 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
    siteApi.info().then((info) => { setAnnouncement(info.site_announcement || ''); setSiteName(info.site_name || ''); setMojangEnabled(info.mojang_enabled) }).catch(() => {})
  }, [load])

  async function createProfile() {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast.show(t('dashboard.toast.nameInvalid'), 'err')
      return
    }
    setBusy(true)
    try {
      await profileApi.create(name)
      toast.show(t('dashboard.toast.createSuccess'), 'ok')
      setCreateOpen(false)
      setName('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('dashboard.toast.createFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function renameProfile() {
    if (!renameTarget) return
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast.show(t('dashboard.toast.nameInvalid'), 'err')
      return
    }
    setBusy(true)
    try {
      await profileApi.rename(renameTarget.uuid, name)
      toast.show(t('dashboard.toast.renameSuccess'), 'ok')
      setRenameTarget(null)
      setName('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('dashboard.toast.renameFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProfile(p: Profile) {
    if (!window.confirm(t('dashboard.confirm.deleteProfile', { name: p.name }))) return
    try {
      await profileApi.remove(p.uuid)
      toast.show(t('dashboard.toast.deleted'), 'ok')
      load()
    } catch (err: any) {
      toast.show(err.message || t('dashboard.toast.deleteFailed'), 'err')
    }
  }

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-sub">
            {t('dashboard.headerUser')} <span className="mono">#{user?.id}</span> · {user?.email}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} strokeWidth={1.5} />
          {t('dashboard.btnNewProfile')}
        </Button>
      </header>

      {announcement ? (
        <div className="announcement">
          <span className="lbl">{t('dashboard.announcementLabel')}</span>
          <span>{announcement}</span>
        </div>
      ) : null}

      <div className="asym">
        <div className="stack">
          <Panel title={t('dashboard.panel.account.title')}>
            <div className="panel-body">
              {user?.avatar_url ? (
                <img
                  src={assetUrl(user.avatar_url)}
                  alt={t('dashboard.panel.account.avatar')}
                  style={{ width: 64, height: 64, borderRadius: 8, border: "1px solid var(--line)", imageRendering: "pixelated", marginBottom: 12 }}
                />
              ) : null}
              <dl className="kv">
                <dt>{t('dashboard.panel.account.username')}</dt>
                <dd>{user?.username}</dd>
                <dt>{t('dashboard.panel.account.email')}</dt>
                <dd>{user?.email}</dd>
                <dt>{t('dashboard.panel.account.permissions')}</dt>
                <dd>{user?.permissions}</dd>
                <dt>UID</dt>
                <dd>{user?.id}</dd>
                <dt>{t('dashboard.panel.account.premium')}</dt>
                <dd>
                  {user?.mojang_uuid ? `${user.mojang_name ?? t('common.unknown')} · ${user.mojang_uuid.slice(0, 8)}…` : t('dashboard.panel.account.notBound')}
                </dd>
              </dl>
            </div>
          </Panel>
          <Panel title={t('dashboard.panel.guide.title')}>
            <div className="panel-body">
              <p className="hint" style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-3)' }}>
                {t('dashboard.panel.guide.intro')}
              </p>
              <dl className="kv">
                <dt>{t('dashboard.panel.guide.step1')}</dt><dd>{t('dashboard.panel.guide.step1Desc')}</dd>
                <dt>{t('dashboard.panel.guide.step2')}</dt><dd>{t('dashboard.panel.guide.step2Desc')}</dd>
                <dt>{t('dashboard.panel.guide.step3')}</dt><dd>{t('dashboard.panel.guide.step3Desc')}</dd>
                <dt>{t('dashboard.panel.guide.skinSite')}</dt>
                <dd>{siteName || 'YSS'}</dd>
                <dt>{t('dashboard.panel.guide.apiUrl')}</dt>
                <dd>
                  <span className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    {apiUrl}
                  </span>
                </dd>
              </dl>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                <button
                  id="ygg-dnd-button"
                  className="btn btn-primary"
                  draggable
                  data-clipboard-text={apiUrl}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', apiUrl)
                    e.dataTransfer.setData('text/uri-list', apiUrl)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  {t('dashboard.panel.guide.dragButton')}
                </button>
                <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                  {t('dashboard.panel.guide.manualHint')}
                </p>
                <p className="hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                  {t('dashboard.panel.guide.skinHint')}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div>
          {loading ? (
            <Spinner label={t('dashboard.profiles.loading')} />
          ) : profiles.length === 0 ? (
            <div className="empty">{t('dashboard.profiles.empty')}</div>
          ) : (
            <div className="grid">
              {profiles.map((p) => {
                const premiumSynced = !!(user?.mojang_uuid &&
                  p.uuid.replace(/-/g, '').toLowerCase() === user.mojang_uuid.replace(/-/g, '').toLowerCase())
                return (
                  <PreviewCard
                    key={p.uuid}
                    skinUrl={p.skin_texture ? textureUrl(p.skin_texture.hash) : undefined}
                    capeUrl={p.cape_texture ? textureUrl(p.cape_texture.hash) : undefined}
                    slim={p.skin_texture?.model === 'slim'}
                    title={
                      <>
                        <span className="mono">{p.name}</span>
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          {premiumSynced ? <StatusTag kind="on">{t('dashboard.profile.tagPremium')}</StatusTag> : null}
                          {p.skin_texture ? <StatusTag kind="on">{t('dashboard.profile.tagSkin')}</StatusTag> : null}
                          {p.cape_texture ? <StatusTag kind="on">{t('dashboard.profile.tagCape')}</StatusTag> : null}
                        </span>
                      </>
                    }
                    meta={`${p.uuid.slice(0, 8)}…`}
                    actions={
                      <>
                        {mojangEnabled ? (
                          <TextLink
                            onClick={async () => {
                              try {
                                const res = await authApi.mojangAuthorize(p.uuid)
                                window.location.href = res.url
                              } catch (err: any) {
                                toast.show(err?.response?.data?.error?.message || err.message || t('dashboard.toast.oauthUrlFailed'), 'err')
                              }
                            }}
                          >
                            <BadgeCheck size={13} strokeWidth={1.5} />
                            {t('dashboard.profile.actionPremiumVerify')}
                          </TextLink>
                        ) : null}
                        <TextLink
                          onClick={() => {
                            setRenameTarget(p)
                            setName(p.name)
                          }}
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                          {t('dashboard.profile.actionRename')}
                        </TextLink>
                      {p.skin_texture ? (
                        <TextLink
                          onClick={async () => {
                            try {
                              await profileApi.unbindTexture(p.uuid, 'skin')
                              toast.show(t('dashboard.toast.unbindSkinOk', { name: p.name }), 'ok')
                              load()
                            } catch (err: any) {
                              toast.show(err?.response?.data?.error?.message || err.message || t('dashboard.toast.unbindFailed'), 'err')
                            }
                          }}
                        >
                          <Unlink size={13} strokeWidth={1.5} />
                          {t('dashboard.profile.actionUnbindSkin')}
                        </TextLink>
                      ) : null}
                      {p.cape_texture ? (
                        <TextLink
                          onClick={async () => {
                            try {
                              await profileApi.unbindTexture(p.uuid, 'cape')
                              toast.show(t('dashboard.toast.unbindCapeOk', { name: p.name }), 'ok')
                              load()
                            } catch (err: any) {
                              toast.show(err?.response?.data?.error?.message || err.message || t('dashboard.toast.unbindFailed'), 'err')
                            }
                          }}
                        >
                          <Unlink size={13} strokeWidth={1.5} />
                          {t('dashboard.profile.actionUnbindCape')}
                        </TextLink>
                      ) : null}
                      <TextLink danger onClick={() => deleteProfile(p)}>
                        <Trash2 size={13} strokeWidth={1.5} />
                        {t('dashboard.profile.actionDelete')}
                      </TextLink>
                      </>
                    }
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        title={t('dashboard.modal.newProfile.title')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('dashboard.modal.newProfile.cancel')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={createProfile}>
              {t('dashboard.modal.newProfile.confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('dashboard.modal.newProfile.fieldName')} hint={t('dashboard.modal.newProfile.fieldNameHint')}>
          <Input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="Steve" autoFocus />
        </Field>
      </Modal>

      <Modal
        open={!!renameTarget}
        title={t('dashboard.modal.rename.title')}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t('dashboard.modal.rename.cancel')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={renameProfile}>
              {t('dashboard.modal.rename.save')}
            </Button>
          </>
        }
      >
        <p className="data" style={{ margin: '0 0 16px', color: 'var(--text-3)' }}>
          {t('dashboard.modal.rename.description')}
        </p>
        <Field label={t('dashboard.modal.rename.fieldName')}>
          <Input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="Notch" autoFocus />
        </Field>
      </Modal>
    </div>
  )
}
