import { useEffect } from 'react'
import { BadgeCheck, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../stores/auth'

export default function BindMojang() {
  const [params] = useSearchParams()
  const { refreshUser } = useAuth()
  const result = params.get('result')
  const message = params.get('message')
  const name = params.get('name')
  const uuid = params.get('uuid')
  const profileName = params.get('profile')

  useEffect(() => {
    if (result === 'success') refreshUser()
  }, [result, refreshUser])

  const success = result === 'success'

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <header className="page-head">
        <h1 className="page-title">正版账号绑定</h1>
        <p className="page-sub">Microsoft / Mojang 官方账号关联</p>
      </header>

      <div className="panel">
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
          {success ? (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ok)', fontWeight: 600, margin: 0 }}>
                <BadgeCheck size={20} strokeWidth={1.5} />
                绑定成功
              </p>
              <dl className="kv">
                <dt>正版名称</dt>
                <dd>{name || '—'}</dd>
                <dt>正版 UUID</dt>
                <dd>{uuid || '—'}</dd>
              </dl>
              <p className="data" style={{ margin: 0, color: 'var(--text-3)' }}>
                官方皮肤已自动同步到档案「{profileName || name || '—'}」，档案 UUID 已更新为正版 UUID。
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Link to="/" className="btn btn-primary">返回控制台</Link>
              </div>
            </>
          ) : (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', fontWeight: 600, margin: 0 }}>
                <XCircle size={20} strokeWidth={1.5} />
                绑定失败
              </p>
              <p className="data" style={{ margin: 0 }}>{message || '未知错误'}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Link to="/" className="btn btn-primary">返回控制台</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
