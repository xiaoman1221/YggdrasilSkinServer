import { useCallback, useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { authApi, LoginRecord } from '../api/auth'
import { useToast } from '../components/Toast'
import { Button, Modal, Pager, Panel, Spinner, Table, TextLink } from '../components/ui'
import type { Column } from '../components/ui'
import { useTranslation } from 'react-i18next'

const PAGE_SIZE = 15

export default function LoginRecords() {
  const toast = useToast()
  const { t } = useTranslation()
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
        toast.show(err.message || t('loginRecords.toast.loadFailed'), 'err')
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
      title: t('loginRecords.col.time'),
      width: 180,
      render: (r) => <span className="data">{new Date(r.created_at).toLocaleString()}</span>,
    },
    {
      key: 'profile',
      title: t('loginRecords.col.profile'),
      width: 160,
      render: (r) =>
        r.profile_name ? <span className="mono" style={{ color: 'var(--text)' }}>{r.profile_name}</span> : <span className="data">—</span>,
    },
    {
      key: 'ip',
      title: t('loginRecords.col.ip'),
      render: (r) => <span className="data">{r.ip || '—'}</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 90,
      render: (r) => (
        <TextLink onClick={() => setDetail(r)}>
          <Eye size={13} strokeWidth={1.5} />
          {t('loginRecords.col.detail')}
        </TextLink>
      ),
    },
  ]

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">{t('loginRecords.title')}</h1>
        <p className="page-sub">{t('loginRecords.totalPrefix')} {total} {t('loginRecords.totalSuffix')} {t('loginRecords.subtitle')}</p>
      </header>

      <Panel title={t('loginRecords.panelTitle')}>
        {loading ? (
          <Spinner label={t('loginRecords.loading')} />
        ) : records.length === 0 ? (
          <div className="empty">{t('loginRecords.empty')}</div>
        ) : (
          <>
            <Table columns={columns} data={records} />
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Panel>

      <Modal
        open={!!detail}
        title={t('loginRecords.detail.title')}
        onClose={() => setDetail(null)}
        footer={
          <Button variant="ghost" onClick={() => setDetail(null)}>
            {t('loginRecords.detail.close')}
          </Button>
        }
      >
        {detail ? (
          <dl className="kv">
            <dt>{t('loginRecords.detail.fieldType')}</dt>
            <dd>{detail.type === 'join' ? t('loginRecords.type.join') : detail.type === 'login' ? t('loginRecords.type.login') : detail.type || t('loginRecords.detail.typeFallback')}</dd>
            <dt>{t('loginRecords.detail.fieldTime')}</dt>
            <dd>{new Date(detail.created_at).toLocaleString()}</dd>
            <dt>{t('loginRecords.detail.fieldProfileName')}</dt>
            <dd>{detail.profile_name || '—'}</dd>
            <dt>{t('loginRecords.detail.fieldProfileUuid')}</dt>
            <dd className="mono" style={{ wordBreak: 'break-all' }}>{detail.profile_id || '—'}</dd>
            <dt>{t('loginRecords.detail.fieldIp')}</dt>
            <dd>{detail.ip || '—'}</dd>
            <dt>{t('loginRecords.detail.fieldLauncher')}</dt>
            <dd>{detail.launcher || t('loginRecords.detail.launcherFallback')}</dd>
            <dt>{t('loginRecords.detail.fieldLauncherVersion')}</dt>
            <dd>{detail.launcher_version || '—'}</dd>
            <dt>{t('loginRecords.detail.fieldRecordId')}</dt>
            <dd className="mono">#{detail.id}</dd>
            <dt>User-Agent</dt>
            <dd style={{ wordBreak: 'break-all' }}>{detail.user_agent || '—'}</dd>
          </dl>
        ) : null}
      </Modal>
    </div>
  )
}
