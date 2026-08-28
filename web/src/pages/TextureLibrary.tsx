import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Copy, Download, Flag, ImagePlus, Search, UserRound } from 'lucide-react'
import { libraryApi, LibraryItem, TextureTag, ysmLibraryApi, YsmLibraryItem } from '../api/library'
import { Profile, profileApi, textureUrl } from '../api/profile'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/auth'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'
import { Button, Field, Modal, Pager, Segmented, Spinner, StatusTag, TextLink, Textarea } from '../components/ui'
import { PreviewCard } from '../components/PreviewCard'
import { ProfilePicker } from '../components/ProfilePicker'
import { formatSize, safeExternalUrl } from '../utils/format'

const PAGE_SIZE = 12

export default function TextureLibrary() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<'skin' | 'cape' | 'ysm'>('skin')

  // 当前用户第一个档案的皮肤，作为公共库皮肤的“基础模型”（试穿用）
  const [baseSkinUrl, setBaseSkinUrl] = useState<string | null>(null)

  useEffect(() => {
    profileApi
      .list()
      .then((res) => {
        const first = res.profiles?.[0]
        if (first?.skin_texture?.hash) setBaseSkinUrl(textureUrl(first.skin_texture.hash))
      })
      .catch(() => {})
  }, [])

  // 皮肤
  const [items, setItems] = useState<LibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const seqRef = useRef(0)
  const [pickerFor, setPickerFor] = useState<LibraryItem | null>(null)
  const [reportFor, setReportFor] = useState<LibraryItem | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)

  // 披风
  const [capeItems, setCapeItems] = useState<LibraryItem[]>([])
  const [capeTotal, setCapeTotal] = useState(0)
  const [capeLoading, setCapeLoading] = useState(true)
  const capeSeqRef = useRef(0)

  // YSM 模型
  const [ysmItems, setYsmItems] = useState<YsmLibraryItem[]>([])
  const [ysmTotal, setYsmTotal] = useState(0)
  const [ysmLoading, setYsmLoading] = useState(true)
  const ysmSeqRef = useRef(0)
  const [capePickerFor, setCapePickerFor] = useState<LibraryItem | null>(null)

  const [keyword, setKeyword] = useState('')
  // 防抖后的关键字：停止输入 300ms 后才触发搜索
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [tags, setTags] = useState<TextureTag[]>([])
  const [activeTag, setActiveTag] = useState('')

  const tabType = tab === 'cape' ? 'cape' : 'skin'

  useEffect(() => {
    libraryApi
      .tags()
      .then((res) => setTags(res.tags || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1)
      setSearch(keyword.trim())
    }, 300)
    return () => window.clearTimeout(t)
  }, [keyword])

  const load = useCallback(
    async (p: number, kw: string, tag: string) => {
      const seq = ++seqRef.current
      setLoading(true)
      try {
        const res = await libraryApi.list({
          type: 'skin',
          limit: PAGE_SIZE,
          offset: (p - 1) * PAGE_SIZE,
          ...(kw ? { keyword: kw } : {}),
          ...(tag ? { tag } : {}),
        })
        if (seq !== seqRef.current) return
        setItems(res.items)
        setTotal(res.total)
      } catch (err: any) {
        if (seq === seqRef.current) toast.show(err?.message || t('library.toast.loadFail'), 'err')
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [toast],
  )

  const loadCape = useCallback(
    async (p: number, kw: string, tag: string) => {
      const seq = ++capeSeqRef.current
      setCapeLoading(true)
      try {
        const res = await libraryApi.list({
          type: 'cape',
          limit: PAGE_SIZE,
          offset: (p - 1) * PAGE_SIZE,
          ...(kw ? { keyword: kw } : {}),
          ...(tag ? { tag } : {}),
        })
        if (seq !== capeSeqRef.current) return
        setCapeItems(res.items)
        setCapeTotal(res.total)
      } catch (err: any) {
        if (seq === capeSeqRef.current) toast.show(err?.message || t('library.toast.loadFail'), 'err')
      } finally {
        if (seq === capeSeqRef.current) setCapeLoading(false)
      }
    },
    [toast],
  )

  const loadYsm = useCallback(
    async (p: number, kw: string, tag: string) => {
      const seq = ++ysmSeqRef.current
      setYsmLoading(true)
      try {
        const res = await ysmLibraryApi.list({
          limit: PAGE_SIZE,
          offset: (p - 1) * PAGE_SIZE,
          ...(kw ? { keyword: kw } : {}),
          ...(tag ? { tag } : {}),
        })
        if (seq !== ysmSeqRef.current) return
        setYsmItems(res.items)
        setYsmTotal(res.total)
      } catch (err: any) {
        if (seq === ysmSeqRef.current) toast.show(err?.message || t('library.toast.loadFail'), 'err')
      } finally {
        if (seq === ysmSeqRef.current) setYsmLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (tab !== 'skin') return
    load(page, search, activeTag)
  }, [tab, load, page, search, activeTag])

  useEffect(() => {
    if (tab !== 'cape') return
    loadCape(page, search, activeTag)
  }, [tab, loadCape, page, search, activeTag])

  useEffect(() => {
    if (tab !== 'ysm') return
    loadYsm(page, search, activeTag)
  }, [tab, loadYsm, page, search, activeTag])

  async function copyItem(item: LibraryItem): Promise<number | null> {
    try {
      const res = await libraryApi.copy(item.id)
      toast.show(t('library.toast.copied'), 'ok')
      return res.texture.id
    } catch (err: any) {
      toast.show(err.message || t('library.toast.copyFail'), 'err')
      return null
    }
  }

  async function setAsAvatar(item: LibraryItem) {
    const tid = await copyItem(item)
    if (!tid) return
    try {
      await authApi.setAvatar(tid)
      await refreshUser()
      toast.show(t('library.toast.avatarSet'), 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('library.toast.setFail'), 'err')
    }
  }

  async function setAsSkin(item: LibraryItem, profile: Profile) {
    const tid = await copyItem(item)
    if (!tid) return
    try {
      await profileApi.bindTexture(profile.uuid, 'skin', tid)
      toast.show(t('library.toast.applied', { name: profile.name }), 'ok')
      setPickerFor(null)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('library.toast.applyFail'), 'err')
    }
  }

  async function setAsCape(item: LibraryItem, profile: Profile) {
    const tid = await copyItem(item)
    if (!tid) return
    try {
      await profileApi.bindTexture(profile.uuid, 'cape', tid)
      toast.show(t('library.toast.applied', { name: profile.name }), 'ok')
      setCapePickerFor(null)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('library.toast.applyFail'), 'err')
    }
  }

  async function copyYsm(item: YsmLibraryItem): Promise<number | null> {
    try {
      const res = await ysmLibraryApi.copy(item.id)
      toast.show(t('library.toast.copied'), 'ok')
      return res.model.id
    } catch (err: any) {
      toast.show(err.message || t('library.toast.copyFail'), 'err')
      return null
    }
  }

  async function submitReport() {
    if (!reportFor || !reportReason.trim()) return
    setReporting(true)
    try {
      await libraryApi.report(reportFor.id, reportReason.trim())
      toast.show(t('library.toast.reportSubmitted'), 'ok')
      setReportFor(null)
      setReportReason('')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('library.toast.reportFail'), 'err')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">{t('library.pageTitle')}</h1>
          <p className="page-sub">{t('library.subtitle', { count: tab === 'skin' ? total : tab === 'cape' ? capeTotal : ysmTotal })}</p>
        </div>
        <span style={{ position: 'relative' }}>
          <Search
            size={15}
            strokeWidth={1.5}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
          />
          <input
            className="input"
            style={{ width: 220, paddingLeft: 36 }}
            placeholder={t('library.searchPlaceholder')}
            value={keyword}
            onChange={(e) => {
              setPage(1)
              setKeyword(e.target.value)
            }}
          />
        </span>
      </header>

      <div style={{ marginBottom: 16 }}>
        <Segmented<'skin' | 'cape' | 'ysm'>
          options={[
            { value: 'skin', label: t('library.tab.skin') },
            { value: 'cape', label: t('library.tab.cape') },
            { value: 'ysm', label: t('library.tab.ysm') },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v)
            setPage(1)
          }}
        />
      </div>

      {tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${activeTag === '' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setActiveTag('')
              setPage(1)
            }}
          >
            {t('library.tagsAll')}
          </button>
          {tags.map((t) => (
            <button
              key={t.id}
              className={`btn btn-sm ${activeTag === t.name ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setActiveTag(activeTag === t.name ? '' : t.name)
                setPage(1)
              }}
            >
              #{t.name}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'skin' ? (
        <div className="panel" style={{ padding: '16px' }}>
          {loading ? (
            <Spinner label={t('library.skin.loading')} />
          ) : items.length === 0 ? (
            <div className="empty">{t('library.skin.empty')}</div>
          ) : (
            <>
              <div className="grid">
                {items.map((item) => (
                  <PreviewCard
                    key={item.id}
                    skinUrl={item.texture?.type === 'skin' ? textureUrl(item.texture.hash) : undefined}
                    capeUrl={item.texture?.type === 'cape' ? textureUrl(item.texture.hash) : undefined}
                    slim={item.texture?.model === 'slim'}
                    baseSkinUrl={baseSkinUrl}
                    title={<span className="mono">{item.title || t('common.untitled')}</span>}
                    meta={
                      item.texture
                        ? `${item.texture.type === 'skin' ? t('library.meta.skin') : t('library.meta.cape')} · ${item.texture.width}×${item.texture.height}${
                            item.tags.length ? ' · #' + item.tags.join(' #') : ''
                          }`
                        : '—'
                    }
                    actions={
                      <>
                        <StatusTag kind={item.status === 'approved' ? 'on' : 'warn'}>{t(`commonStatus.${item.status}`, item.status)}</StatusTag>
                        <TextLink onClick={() => copyItem(item)}>
                          <Copy size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('library.action.copy')}</span>
                        </TextLink>
                        {item.texture?.type === 'skin' ? (
                          <TextLink onClick={() => setPickerFor(item)}>
                            <ImagePlus size="1em" strokeWidth={1.5} />
                            <span className="lnk-txt">{t('library.action.setSkin')}</span>
                          </TextLink>
                        ) : null}
                        {item.texture?.type === 'skin' ? (
                          <TextLink onClick={() => setAsAvatar(item)}>
                            <UserRound size="1em" strokeWidth={1.5} />
                            <span className="lnk-txt">{t('library.action.setAvatar')}</span>
                          </TextLink>
                        ) : null}
                        <TextLink danger onClick={() => setReportFor(item)}>
                          <Flag size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('library.action.report')}</span>
                        </TextLink>
                      </>
                    }
                  />
                ))}
              </div>
              <Pager page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </div>
      ) : tab === 'cape' ? (
        <div className="panel" style={{ padding: '16px' }}>
          {capeLoading ? (
            <Spinner label={t('library.cape.loading')} />
          ) : capeItems.length === 0 ? (
            <div className="empty">{t('library.cape.empty')}</div>
          ) : (
            <>
              <div className="grid">
                {capeItems.map((item) => (
                  <PreviewCard
                    key={item.id}
                    skinUrl={item.texture?.type === 'skin' ? textureUrl(item.texture.hash) : undefined}
                    capeUrl={item.texture?.type === 'cape' ? textureUrl(item.texture.hash) : undefined}
                    slim={item.texture?.model === 'slim'}
                    title={<span className="mono">{item.title || t('common.untitled')}</span>}
                    meta={
                      item.texture
                        ? `${item.texture.type === 'skin' ? t('library.meta.skin') : t('library.meta.cape')} · ${item.texture.width}×${item.texture.height}${
                            item.tags.length ? ' · #' + item.tags.join(' #') : ''
                          }`
                        : '—'
                    }
                    actions={
                      <>
                        <StatusTag kind={item.status === 'approved' ? 'on' : 'warn'}>{t(`commonStatus.${item.status}`, item.status)}</StatusTag>
                        <TextLink onClick={() => copyItem(item)}>
                          <Copy size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('library.action.copy')}</span>
                        </TextLink>
                        <TextLink onClick={() => setCapePickerFor(item)}>
                          <ImagePlus size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('library.action.setCape')}</span>
                        </TextLink>
                        <TextLink danger onClick={() => setReportFor(item)}>
                          <Flag size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('library.action.report')}</span>
                        </TextLink>
                      </>
                    }
                  />
                ))}
              </div>
              <Pager page={page} total={capeTotal} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </div>
      ) : (
        <div className="panel" style={{ padding: '16px' }}>
          {ysmLoading ? (
            <Spinner label={t('library.ysm.loading')} />
          ) : ysmItems.length === 0 ? (
            <div className="empty">{t('library.ysm.empty')}</div>
          ) : (
            <>
              <div className="grid">
                {ysmItems.map((item) => (
                  <div key={item.id} className="ysm-card">
                    <div className="ysm-icon">
                      {item.model?.preview_url ? (
                        <img src={item.model.preview_url} alt="" className="ysm-preview-img" loading="lazy" />
                      ) : (
                        <Box size={30} strokeWidth={1.25} />
                      )}
                    </div>
                    <div className="pcard-body">
                      <div className="pcard-title">
                        <span className="mono">{item.title || item.model?.name || t('common.untitled')}</span>
                        <StatusTag kind={item.price_info === '免费' ? 'on' : 'warn'}>{item.price_info || t('common.paid')}</StatusTag>
                      </div>
                      <div className="pcard-meta">
                        {item.model ? (
                          <>
                            <span className="mono tabular-nums">{formatSize(item.model.size)}</span>
                            {' · '}
                            <span className="mono">{item.model.format === 'ysm' ? 'YSM' : 'ZIP'}</span>
                          </>
                        ) : null}
                        {item.tags.length ? ' · #' + item.tags.join(' #') : ''}
                      </div>
                      {item.usage_agreement ? <div className="pcard-meta">{t('library.agreement', { text: item.usage_agreement })}</div> : null}
                      <div className="pcard-actions">
                        {item.is_free ? (
                          <>
                            <TextLink onClick={() => copyYsm(item)}>
                              <Copy size="1em" strokeWidth={1.5} />
                              <span className="lnk-txt">{t('library.action.copy')}</span>
                            </TextLink>
                          </>
                        ) : null}
                        {!item.is_free && safeExternalUrl(item.purchase_url) ? (
                          <a className="link-btn" href={safeExternalUrl(item.purchase_url)} target="_blank" rel="noreferrer">
                            <Download size="1em" strokeWidth={1.5} />
                            <span className="lnk-txt">{t('library.action.purchase')}</span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Pager page={page} total={ysmTotal} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </div>
      )}

      <ProfilePicker
        open={!!pickerFor}
        title={t('library.picker.skin.title')}
        onClose={() => setPickerFor(null)}
        onSelect={(profile) => pickerFor && setAsSkin(pickerFor, profile)}
      />

      <ProfilePicker
        open={!!capePickerFor}
        title={t('library.picker.cape.title')}
        onClose={() => setCapePickerFor(null)}
        onSelect={(profile) => capePickerFor && setAsCape(capePickerFor, profile)}
      />

      <Modal
        open={!!reportFor}
        title={t('library.report.title')}
        onClose={() => setReportFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportFor(null)}>
              {t('library.report.cancel')}
            </Button>
            <Button variant="danger" disabled={reporting || !reportReason.trim()} onClick={submitReport}>
              {reporting ? t('library.report.submitting') : t('library.report.submit')}
            </Button>
          </>
        }
      >
        <Field label={t('library.report.reasonLabel')} hint={t('library.report.reasonHint')}>
          <Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder={t('library.report.reasonPlaceholder')} />
        </Field>
      </Modal>
    </div>
  )
}
