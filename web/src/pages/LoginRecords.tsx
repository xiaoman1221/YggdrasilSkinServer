import { useCallback, useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { authApi, LoginRecord } from '../api/auth'
import { useToast } from '../components/Toast'
import { Button, Modal, Pager, Panel, Spinner, Table, TextLink } from '../components/ui'
import type { Column } from '../components/ui'

const PAGE_SIZE = 15

const typeLabel: Record<string, string> = {
  login: '启动器登录',
  join: '进入服务器',
}

export default function LoginRecords() {
  const toast = useToast()
  const [records, setRecords] = useState<LoginRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<LoginRecord | null>(null)

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
      width: 180,
      render: (r) => <span className="data">{new Date(r.created_at).toLocaleString()}</span>,
    },
    {
      key: 'profile',
      title: '档案',
      width: 160,
      render: (r) =>
        r.profile_name ? <span className="mono" style={{ color: 'var(--text)' }}>{r.profile_name}</span> : <span className="data">—</span>,
    },
    {
      key: 'ip',
      title: 'IP',
      render: (r) => <span className="data">{r.ip || '—'}</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 90,
      render: (r) => (
        <TextLink onClick={() => setDetail(r)}>
          <Eye size={13} strokeWidth={1.5} />
          详情
        </TextLink>
      ),
    },
  ]

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">登录记录</h1>
        <p className="page-sub">共 {total} 条 · 列表仅展示时间、档案与 IP，更多信息点击「详情」查看</p>
      </header>

      <Panel title="我的登录记录">
        {loading ? (
          <Spinner label="加载记录" />
        ) : records.length === 0 ? (
          <div className="empty">暂无登录记录，通过 Yggdrasil 登录或进入服务器后会显示在这里</div>
        ) : (
          <>
            <Table columns={columns} data={records} />
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Panel>

      <Modal
        open={!!detail}
        title="登录记录详情"
        onClose={() => setDetail(null)}
        footer={
          <Button variant="ghost" onClick={() => setDetail(null)}>
            关闭
          </Button>
        }
      >
        {detail ? (
          <dl className="kv">
            <dt>记录类型</dt>
            <dd>{typeLabel[detail.type || 'login'] || detail.type || '登录'}</dd>
            <dt>时间</dt>
            <dd>{new Date(detail.created_at).toLocaleString()}</dd>
            <dt>档案名称</dt>
            <dd>{detail.profile_name || '—'}</dd>
            <dt>档案 UUID</dt>
            <dd className="mono" style={{ wordBreak: 'break-all' }}>{detail.profile_id || '—'}</dd>
            <dt>IP 地址</dt>
            <dd>{detail.ip || '—'}</dd>
            <dt>登录启动器</dt>
            <dd>{detail.launcher || '未知'}</dd>
            <dt>启动器版本</dt>
            <dd>{detail.launcher_version || '—'}</dd>
            <dt>记录 ID</dt>
            <dd className="mono">#{detail.id}</dd>
            <dt>User-Agent</dt>
            <dd style={{ wordBreak: 'break-all' }}>{detail.user_agent || '—'}</dd>
          </dl>
        ) : null}
      </Modal>
    </div>
  )
}
