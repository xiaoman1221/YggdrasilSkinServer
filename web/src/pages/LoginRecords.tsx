import { useCallback, useEffect, useState } from 'react'
import { authApi, LoginRecord } from '../api/auth'
import { useToast } from '../components/Toast'
import { Pager, Panel, Spinner, Table, TextLink } from '../components/ui'
import type { Column } from '../components/ui'

const PAGE_SIZE = 15

export default function LoginRecords() {
  const toast = useToast()
  const [records, setRecords] = useState<LoginRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await authApi.loginRecords({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setRecords(res.records)
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

  const columns: Column<LoginRecord>[] = [
    {
      key: 'time',
      title: '时间',
      width: 170,
      render: (r) => <span className="data">{new Date(r.created_at).toLocaleString()}</span>,
    },
    {
      key: 'profile',
      title: '档案',
      width: 140,
      render: (r) =>
        r.profile_name ? <span className="mono" style={{ color: 'var(--text)' }}>{r.profile_name}</span> : <span className="data">—</span>,
    },
    {
      key: 'ip',
      title: 'IP',
      width: 150,
      render: (r) => <span className="data">{r.ip || '—'}</span>,
    },
    {
      key: 'launcher',
      title: '启动器',
      width: 150,
      render: (r) => <span className="tag on">{r.launcher || '未知'}</span>,
    },
    {
      key: 'ua',
      title: 'User-Agent',
      render: (r) => (
        <span className="data" title={r.user_agent} style={{ display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.user_agent || '—'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">登录记录</h1>
        <p className="page-sub">共 {total} 条 · 记录档案、时间、IP 与启动器</p>
      </header>

      <Panel title="我的登录记录">
        {loading ? (
          <Spinner label="加载记录" />
        ) : records.length === 0 ? (
          <div className="empty">暂无登录记录，通过 Yggdrasil 登录后会显示在这里</div>
        ) : (
          <>
            <Table columns={columns} data={records} />
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Panel>
    </div>
  )
}
