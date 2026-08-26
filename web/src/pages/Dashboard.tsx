import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Download, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import { profileApi, Profile, textureUrl } from '../api/profile'
import { siteApi } from '../api/site'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/auth'
import { useToast } from '../components/Toast'
import { Button, Field, Input, Modal, Panel, Spinner, StatusTag, TextLink } from '../components/ui'
import { PreviewCard } from '../components/PreviewCard'
import { assetUrl } from '../utils/format'

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
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
      toast.show(err.message || '加载失败', 'err')
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
      toast.show('名称需为 3-16 位字母数字下划线', 'err')
      return
    }
    setBusy(true)
    try {
      await profileApi.create(name)
      toast.show('档案创建成功', 'ok')
      setCreateOpen(false)
      setName('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '创建失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function renameProfile() {
    if (!renameTarget) return
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast.show('名称需为 3-16 位字母数字下划线', 'err')
      return
    }
    setBusy(true)
    try {
      await profileApi.rename(renameTarget.uuid, name)
      toast.show('改名成功', 'ok')
      setRenameTarget(null)
      setName('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '改名失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProfile(p: Profile) {
    if (!window.confirm(`确认删除档案 ${p.name}？此操作不可撤销。`)) return
    try {
      await profileApi.remove(p.uuid)
      toast.show('已删除', 'ok')
      load()
    } catch (err: any) {
      toast.show(err.message || '删除失败', 'err')
    }
  }

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">控制台</h1>
          <p className="page-sub">
            用户 <span className="mono">#{user?.id}</span> · {user?.email}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} strokeWidth={1.5} />
          新建档案
        </Button>
      </header>

      {announcement ? (
        <div className="announcement">
          <span className="lbl">公告</span>
          <span>{announcement}</span>
        </div>
      ) : null}

      <div className="asym">
        <div className="stack">
          <Panel title="账号">
            <div className="panel-body">
              {user?.avatar_url ? (
                <img
                  src={assetUrl(user.avatar_url)}
                  alt="头像"
                  style={{ width: 64, height: 64, borderRadius: 8, border: "1px solid var(--line)", imageRendering: "pixelated", marginBottom: 12 }}
                />
              ) : null}
              <dl className="kv">
                <dt>用户名</dt>
                <dd>{user?.username}</dd>
                <dt>邮箱</dt>
                <dd>{user?.email}</dd>
                <dt>权限</dt>
                <dd>{user?.permissions}</dd>
                <dt>UID</dt>
                <dd>{user?.id}</dd>
                <dt>正版账号</dt>
                <dd>
                  {user?.mojang_uuid ? `${user.mojang_name ?? '未知'} · ${user.mojang_uuid.slice(0, 8)}…` : '未绑定'}
                </dd>
              </dl>
            </div>
          </Panel>
          <Panel title="接入指南">
            <div className="panel-body">
              <dl className="kv">
                <dt>第 1 步</dt>
                <dd>启动器安装 authlib-injector</dd>
                <dt>第 2 步</dt>
                <dd>认证地址填本站地址</dd>
                <dt>第 3 步</dt>
                <dd>使用本站账号登录启动器</dd>
                <dt>皮肤站</dt>
                <dd>{siteName || 'YSS 皮肤站'}</dd>
                <dt>API 地址</dt>
                <dd>
                  <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                    {window.location.origin}/api/yggdrasil
                  </span>
                </dd>
              </dl>
              <p className="hint" style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                在「个人皮肤」上传皮肤并应用到档案后，进服即可生效。
              </p>
            </div>
          </Panel>
        </div>

        <div>
          {loading ? (
            <Spinner label="加载档案" />
          ) : profiles.length === 0 ? (
            <div className="empty">还没有档案，点击右上角「新建档案」创建第一个角色</div>
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
                          {premiumSynced ? <StatusTag kind="on">正版</StatusTag> : null}
                          {p.skin_texture ? <StatusTag kind="on">皮肤</StatusTag> : null}
                          {p.cape_texture ? <StatusTag kind="on">披风</StatusTag> : null}
                          {p.ysm_model ? <StatusTag kind="warn">YSM</StatusTag> : null}
                        </span>
                      </>
                    }
                    meta={
                      p.ysm_model
                        ? `${p.ysm_model.name} · ${p.uuid.slice(0, 8)}…`
                        : `${p.uuid.slice(0, 8)}…`
                    }
                    actions={
                      <>
                        {mojangEnabled ? (
                          <TextLink
                            onClick={async () => {
                              try {
                                const res = await authApi.mojangAuthorize(p.uuid)
                                window.location.href = res.url
                              } catch (err: any) {
                                toast.show(err?.response?.data?.error?.message || err.message || '获取授权地址失败', 'err')
                              }
                            }}
                          >
                            <BadgeCheck size={13} strokeWidth={1.5} />
                            正版认证
                          </TextLink>
                        ) : null}
                        <TextLink
                          onClick={() => {
                            setRenameTarget(p)
                            setName(p.name)
                          }}
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                          改名
                        </TextLink>
                      {p.ysm_model ? (
                        <>
                          <a className="link-btn" href={p.ysm_model.url} download>
                            <Download size={13} strokeWidth={1.5} />
                            模型
                          </a>
                          <TextLink
                            onClick={async () => {
                              try {
                                await profileApi.unbindYsm(p.uuid)
                                toast.show(`已解除 ${p.name} 的 YSM 模型`, 'ok')
                                load()
                              } catch (err: any) {
                                toast.show(err?.response?.data?.error?.message || err.message || '解除失败', 'err')
                              }
                            }}
                          >
                            <Unlink size={13} strokeWidth={1.5} />
                            解绑
                          </TextLink>
                        </>
                      ) : null}
                      <TextLink danger onClick={() => deleteProfile(p)}>
                        <Trash2 size={13} strokeWidth={1.5} />
                        删除
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
        title="新建档案"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" disabled={busy} onClick={createProfile}>
              创建
            </Button>
          </>
        }
      >
        <Field label="游戏名称" hint="3-16 位字母数字下划线">
          <Input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="Steve" autoFocus />
        </Field>
      </Modal>

      <Modal
        open={!!renameTarget}
        title="受控改名"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={busy} onClick={renameProfile}>
              保存
            </Button>
          </>
        }
      >
        <p className="data" style={{ margin: '0 0 16px', color: 'var(--text-3)' }}>
          改名保留 UUID 与材质绑定，并使绑定该档案的 Yggdrasil token 失效。
        </p>
        <Field label="新名称">
          <Input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="Notch" autoFocus />
        </Field>
      </Modal>
    </div>
  )
}
