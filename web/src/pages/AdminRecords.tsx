import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { adminApi } from '../api/admin'
import { LoginRecord } from '../api/auth'
import { useToast } from '../components/Toast'
import { Button, Pager, Panel, Spinner, Table, TextLink } from '../components/ui'
import type { Column } from '../components/ui'

const PAGE_SIZE = 15

export default function AdminRecords() {
  const toast = useToast()
  const [records, setRecords] = useState<LoginRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await adminApi.loginRecords({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE })
        setRecords(res.records)
        setTotal(res.total)
        setSelected(new Set()) // 翻页后清空选择
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

  const allSelected = records.length > 0 && records.every((r) => selected.has(r.id))
  const selectedCount = useMemo(() => selected.size, [selected])

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (allSelected ? new Set() : new Set(records.map((r) => r.id))))
  }

  async function removeRecord(r: LoginRecord) {
    if (!window.confirm(`确认删除该条登录记录（用户 #${r.user_id} · ${new Date(r.created_at).toLocaleString()}）？`)) return
    try {
      await adminApi.deleteLoginRecord(r.id)
      toast.show('已删除', 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err?.message || '删除失败', 'err')
    }
  }

  async function removeSelected() {
    if (selectedCount === 0 || batchBusy) return
    if (!window.confirm(`确认批量删除选中的 ${selectedCount} 条登录记录？此操作不可撤销。`)) return
    setBatchBusy(true)
    try {
      const res = await adminApi.batchDeleteLoginRecords([...selected])
      toast.show(`已删除 ${res.deleted} 条记录`, 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err?.message || '批量删除失败', 'err')
    } finally {
      setBatchBusy(false)
    }
  }

  const columns: Column<LoginRecord>[] = [
    {
      key: 'select',
      title: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label="全选本页"
        />
      ),
      width: 44,
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={() => toggleOne(r.id)}
          aria-label={`选择记录 ${r.id}`}
        />
      ),
    },
    {
      key: 'time',
      title: '时间',
      width: 170,
      render: (r) => <span className="data">{new Date(r.created_at).toLocaleString()}</span>,
    },
    {
      key: 'user',
      title: '用户 ID',
      width: 80,
      align: 'right',
      render: (r) => <span className="data">#{r.user_id}</span>,
    },
    {
      key: 'profile',
      title: '档案',
      width: 130,
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
        <span className="data" title={r.user_agent} style={{ display: 'block', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.user_agent || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 70,
      align: 'right',
      render: (r) => (
        <TextLink danger onClick={() => removeRecord(r)}>
          <Trash2 size={13} strokeWidth={1.5} />
          删除
        </TextLink>
      ),
    },
  ]

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">登录记录</h1>
          <p className="page-sub">全部用户 · 共 {total} 条</p>
        </div>
        {selectedCount > 0 ? (
          <Button variant="danger" disabled={batchBusy} onClick={removeSelected}>
            <Trash2 size={15} strokeWidth={1.5} />
            {batchBusy ? '删除中…' : `删除选中 (${selectedCount})`}
          </Button>
        ) : null}
      </header>

      <Panel title="全部登录记录">
        {loading ? (
          <Spinner label="加载记录" />
        ) : records.length === 0 ? (
          <div className="empty">暂无登录记录</div>
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
