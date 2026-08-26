import { useEffect, useState } from 'react'
import { BadgeCheck, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { Button } from '../components/ui'
import { authApi } from '../api/auth'

export default function BindMojang() {
  const [params] = useSearchParams()
  const { refreshUser } = useAuth()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')
  const result = params.get('result')
  const message = params.get('message')
  const name = params.get('name')
  const uuid = params.get('uuid')

  useEffect(() => {
    if (result === 'success') refreshUser()
  }, [result, refreshUser])

  const success = result === 'success'

  async function retry() {
    setRetryError('')
    setRetrying(true)
    try {
      const res = await authApi.mojangAuthorize()
      window.location.href = res.url
    } catch (err: any) {
      setRetryError(err?.message || '获取绑定跳转失败，请稍后重试')
    } finally {
      setRetrying(false)
    }
  }

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
                官方皮肤已获取到你的材质仓库，可前往「材质仓库」设为皮肤或头像。
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Link to="/wardrobe" className="btn btn-primary">前往材质仓库</Link>
                <Link to="/" className="btn btn-outline">返回控制台</Link>
              </div>
            </>
          ) : (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', fontWeight: 600, margin: 0 }}>
                <XCircle size={20} strokeWidth={1.5} />
                绑定失败
              </p>
              <p className="data" style={{ margin: 0 }}>{message || '未知错误'}</p>
              {retryError ? (
                <p className="data" style={{ margin: 0, color: 'var(--danger)' }}>{retryError}</p>
              ) : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <Button onClick={retry} disabled={retrying}>
                  {retrying ? '跳转中…' : '重新绑定'}
                </Button>
                <Link to="/" className="btn btn-outline">返回控制台</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
