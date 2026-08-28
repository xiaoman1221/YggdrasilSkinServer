import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { adminApi } from '../api/admin'
import { LoginRecord } from '../api/auth'
import { useToast } from '../components/Toast'
import { Button, Pager, Panel, Spinner, Table, TextLink } from '../components/ui'
import type { Column } from '../components/ui'
import { useTranslation } from 'react-i18next'

const PAGE_SIZE = 15

export default function AdminRecords() {
  const toast = useToast()
  const { t } = useTranslation()
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
        setSelected(new Set())
      } catch (err: any) {
        toast.show(err.message || t('adminRecords.toast.loadFailed'), 'err')
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
    if (!window.confirm(t('adminRecords.confirm.deleteOne', { userId: r.user_id, time: new Date(r.created_at).toLocaleString() }))) return
    try {
      await adminApi.deleteLoginRecord(r.id)
      toast.show(t('adminRecords.toast.deleted'), 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err?.message || t('adminRecords.toast.deleteFailed'), 'err')
    }
  }

  async function removeSelected() {
    if (selectedCount === 0 || batchBusy) return
    if (!window.confirm(t('adminRecords.confirm.deleteBatch', { count: selectedCount }))) return
    setBatchBusy(true)
    try {
      const res = await adminApi.batchDeleteLoginRecords([...selected])
      toast.show(t('adminRecords.toast.batchDeleted', { count: res.deleted }), 'ok')
      load(page)
    } catch (err: any) {
      toast.show(err?.message || t('adminRecords.toast.batchDeleteFailed'), 'err')
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
          aria-label={t('adminRecords.col.selectAria')}
        />
      ),
      width: 44,
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={() => toggleOne(r.id)}
          aria-label={t('adminRecords.col.selectRowAria', { id: r.id })}
        />
      ),
    },
    {
      key: 'time',
      title: t('adminRecords.col.time'),
      width: 170,
      render: (r) => <span className="data">{new Date(r.created_at).toLocaleString()}</span>,
    },
    {
      key: 'type',
      title: t('adminRecords.col.type'),
      width: 90,
      render: (r) => (
        <span className="tag on">{r.type === 'join' ? t('adminRecords.col.typeJoin') : r.type === 'login' ? t('adminRecords.col.typeLogin') : r.type || t('adminRecords.col.typeLogin')}</span>
      ),
    },
    {
      key: 'user',
      title: t('adminRecords.col.userId'),
      width: 80,
      align: 'right',
      render: (r) => <span className="data">#{r.user_id}</span>,
    },
    {
      key: 'profile',
      title: t('adminRecords.col.profile'),
      width: 130,
      render: (r) =>
        r.profile_name ? <span className="mono" style={{ color: 'var(--text)' }}>{r.profile_name}</span> : <span className="data">—</span>,
    },
    {
      key: 'ip',
      title: t('adminRecords.col.ip'),
      width: 150,
      render: (r) => <span className="data">{r.ip || '—'}</span>,
    },
    {
      key: 'launcher',
      title: t('adminRecords.col.launcher'),
      width: 150,
      render: (r) => <span className="tag on">{r.launcher || t('adminRecords.col.launcherFallback')}</span>,
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
      title: t('adminRecords.col.actions'),
      width: 70,
      align: 'right',
      render: (r) => (
        <TextLink danger onClick={() => removeRecord(r)}>
          <Trash2 size={13} strokeWidth={1.5} />
          {t('adminRecords.col.delete')}
        </TextLink>
      ),
    },
  ]

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">{t('adminRecords.title')}</h1>
          <p className="page-sub">{t('adminRecords.headerAllUsers')} · {t('adminRecords.totalPrefix')} {total} {t('adminRecords.totalSuffix')}</p>
        </div>
        {selectedCount > 0 ? (
          <Button variant="danger" disabled={batchBusy} onClick={removeSelected}>
            <Trash2 size={15} strokeWidth={1.5} />
            {batchBusy ? t('adminRecords.btnDeleting') : t('adminRecords.btnDeleteSelected', { count: selectedCount })}
          </Button>
        ) : null}
      </header>

      <Panel title={t('adminRecords.panelTitle')}>
        {loading ? (
          <Spinner label={t('adminRecords.loading')} />
        ) : records.length === 0 ? (
          <div className="empty">{t('adminRecords.empty')}</div>
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
