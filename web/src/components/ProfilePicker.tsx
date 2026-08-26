import { useEffect, useState } from 'react'
import { profileApi, Profile } from '../api/profile'
import { Button, Modal, Spinner, StatusTag } from './ui'

/**
 * 档案选择弹窗：为「设为皮肤」等快捷操作选择目标档案。
 */
export function ProfilePicker({
  open,
  title = '选择档案',
  onClose,
  onSelect,
}: {
  open: boolean
  title?: string
  onClose: () => void
  onSelect: (profile: Profile) => void
}) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    profileApi
      .list()
      .then((res) => setProfiles(res.profiles))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Modal open={open} title={title} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>取消</Button>}>
      {loading ? (
        <Spinner label="加载档案" />
      ) : profiles.length === 0 ? (
        <div className="empty">还没有档案，请先在控制台创建</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {profiles.map((p) => (
            <button
              key={p.uuid}
              type="button"
              className="profile-row"
              onClick={() => onSelect(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)',
                background: 'var(--bg-elev)',
                cursor: 'pointer',
                font: 'inherit',
                color: 'var(--text)',
                transition: 'border-color .15s ease-out, background .15s ease-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'var(--accent-soft)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line)'
                e.currentTarget.style.background = 'var(--bg-elev)'
              }}
            >
              <span className="mono" style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                {p.skin_texture ? <StatusTag kind="on">皮肤</StatusTag> : null}
                {p.cape_texture ? <StatusTag kind="on">披风</StatusTag> : null}
                {p.ysm_model ? <StatusTag kind="warn">YSM</StatusTag> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
