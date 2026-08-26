import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Copy, Download, Flag, ImagePlus, Search, UserRound } from 'lucide-react'
import { libraryApi, LibraryItem, TextureTag, ysmLibraryApi, YsmLibraryItem } from '../api/library'
import { Profile, profileApi, textureUrl } from '../api/profile'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/auth'
import { useToast } from '../components/Toast'
import { Button, Field, Modal, Pager, Segmented, Spinner, StatusTag, TextLink, Textarea } from '../components/ui'
import { PreviewCard } from '../components/PreviewCard'
import { ProfilePicker } from '../components/ProfilePicker'
import { formatSize } from '../utils/format'

const PAGE_SIZE = 12

export default function TextureLibrary() {
  const { refreshUser } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<'skin' | 'ysm'>('skin')

  // 皮肤
  const [items, setItems] = useState<LibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const seqRef = useRef(0)
  const [pickerFor, setPickerFor] = useState<LibraryItem | null>(null)
  const [reportFor, setReportFor] = useState<LibraryItem | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)

  // YSM 模型
  const [ysmItems, setYsmItems] = useState<YsmLibraryItem[]>([])
  const [ysmTotal, setYsmTotal] = useState(0)
  const [ysmLoading, setYsmLoading] = useState(true)
  const ysmSeqRef = useRef(0)
  const [ysmPickerFor, setYsmPickerFor] = useState<YsmLibraryItem | null>(null)

  const [keyword, setKeyword] = useState('')
  // 防抖后的关键字：停止输入 300ms 后才触发搜索
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [tags, setTags] = useState<TextureTag[]>([])
  const [activeTag, setActiveTag] = useState('')

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
          limit: PAGE_SIZE,
          offset: (p - 1) * PAGE_SIZE,
          ...(kw ? { keyword: kw } : {}),
          ...(tag ? { tag } : {}),
        })
        if (seq !== seqRef.current) return
        setItems(res.items)
        setTotal(res.total)
      } catch (err: any) {
        if (seq === seqRef.current) toast.show(err?.message || '加载失败', 'err')
      } finally {
        if (seq === seqRef.current) setLoading(false)
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
        if (seq === ysmSeqRef.current) toast.show(err?.message || '加载失败', 'err')
      } finally {
        if (seq === ysmSeqRef.current) setYsmLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(page, search, activeTag)
  }, [load, page, search, activeTag])

  useEffect(() => {
    loadYsm(page, search, activeTag)
  }, [loadYsm, page, search, activeTag])

  async function copyItem(item: LibraryItem): Promise<number | null> {
    try {
      const res = await libraryApi.copy(item.id)
      toast.show('已复制到我的仓库', 'ok')
      return res.texture.id
    } catch (err: any) {
      toast.show(err.message || '复制失败', 'err')
      return null
    }
  }

  async function setAsAvatar(item: LibraryItem) {
    const tid = await copyItem(item)
    if (!tid) return
    try {
      await authApi.setAvatar(tid)
      await refreshUser()
      toast.show('已设为头像', 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '设置失败', 'err')
    }
  }

  async function setAsSkin(item: LibraryItem, profile: Profile) {
    const tid = await copyItem(item)
    if (!tid) return
    try {
      await profileApi.bindTexture(profile.uuid, 'skin', tid)
      toast.show(`已应用到 ${profile.name}`, 'ok')
      setPickerFor(null)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '应用失败', 'err')
    }
  }

  async function copyYsm(item: YsmLibraryItem): Promise<number | null> {
    try {
      const res = await ysmLibraryApi.copy(item.id)
      toast.show('已复制到我的仓库', 'ok')
      return res.model.id
    } catch (err: any) {
      toast.show(err.message || '复制失败', 'err')
      return null
    }
  }

  async function setAsYsm(item: YsmLibraryItem, profile: Profile) {
    const mid = await copyYsm(item)
    if (!mid) return
    try {
      await profileApi.bindYsm(profile.uuid, mid)
      toast.show(`已应用到 ${profile.name}`, 'ok')
      setYsmPickerFor(null)
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '应用失败', 'err')
    }
  }

  async function submitReport() {
    if (!reportFor || !reportReason.trim()) return
    setReporting(true)
    try {
      await libraryApi.report(reportFor.id, reportReason.trim())
      toast.show('举报已提交，等待管理员处理', 'ok')
      setReportFor(null)
      setReportReason('')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '举报失败', 'err')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">公共皮肤库</h1>
          <p className="page-sub">浏览并获取玩家共享的皮肤与 YSM 模型 · 共 {tab === 'skin' ? total : ysmTotal} 件</p>
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
            placeholder="搜索标题"
            value={keyword}
            onChange={(e) => {
              setPage(1)
              setKeyword(e.target.value)
            }}
          />
        </span>
      </header>

      <div style={{ marginBottom: 16 }}>
        <Segmented<'skin' | 'ysm'>
          options={[
            { value: 'skin', label: '皮肤' },
            { value: 'ysm', label: 'YSM 模型' },
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
            全部
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
            <Spinner label="加载公共皮肤" />
          ) : items.length === 0 ? (
            <div className="empty">暂无公共皮肤</div>
          ) : (
            <>
              <div className="grid">
                {items.map((item) => (
                  <PreviewCard
                    key={item.id}
                    skinUrl={item.texture?.type === 'skin' ? textureUrl(item.texture.hash) : undefined}
                    capeUrl={item.texture?.type === 'cape' ? textureUrl(item.texture.hash) : undefined}
                    slim={item.texture?.model === 'slim'}
                    title={<span className="mono">{item.title || '未命名'}</span>}
                    meta={
                      item.texture
                        ? `${item.texture.type === 'skin' ? '皮肤' : '披风'} · ${item.texture.width}×${item.texture.height}${
                            item.tags.length ? ' · #' + item.tags.join(' #') : ''
                          }`
                        : '—'
                    }
                    actions={
                      <>
                        <StatusTag kind={item.status === 'approved' ? 'on' : 'warn'}>{item.status}</StatusTag>
                        <TextLink onClick={() => copyItem(item)}>
                          <Copy size={13} strokeWidth={1.5} />
                          复制
                        </TextLink>
                        {item.texture?.type === 'skin' ? (
                          <TextLink onClick={() => setPickerFor(item)}>
                            <ImagePlus size={13} strokeWidth={1.5} />
                            设为皮肤
                          </TextLink>
                        ) : null}
                        {item.texture?.type === 'skin' ? (
                          <TextLink onClick={() => setAsAvatar(item)}>
                            <UserRound size={13} strokeWidth={1.5} />
                            设为头像
                          </TextLink>
                        ) : null}
                        <TextLink danger onClick={() => setReportFor(item)}>
                          <Flag size={13} strokeWidth={1.5} />
                          举报
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
      ) : (
        <div className="panel" style={{ padding: '16px' }}>
          {ysmLoading ? (
            <Spinner label="加载公共 YSM 模型" />
          ) : ysmItems.length === 0 ? (
            <div className="empty">暂无公共 YSM 模型</div>
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
                        <span className="mono">{item.title || item.model?.name || '未命名'}</span>
                        <StatusTag kind={item.price_info === '免费' ? 'on' : 'warn'}>{item.price_info || '付费'}</StatusTag>
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
                      {item.usage_agreement ? <div className="pcard-meta">协议：{item.usage_agreement}</div> : null}
                      <div className="pcard-actions">
                        {item.is_free ? (
                          <>
                            <TextLink onClick={() => copyYsm(item)}>
                              <Copy size={13} strokeWidth={1.5} />
                              复制
                            </TextLink>
                            <TextLink onClick={() => setYsmPickerFor(item)}>
                              <ImagePlus size={13} strokeWidth={1.5} />
                              设为模型
                            </TextLink>
                          </>
                        ) : null}
                        {!item.is_free && item.purchase_url ? (
                          <a className="link-btn" href={item.purchase_url} target="_blank" rel="noreferrer">
                            <Download size={13} strokeWidth={1.5} />
                            购买获取
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
        title="设为皮肤 · 选择档案"
        onClose={() => setPickerFor(null)}
        onSelect={(profile) => pickerFor && setAsSkin(pickerFor, profile)}
      />

      <ProfilePicker
        open={!!ysmPickerFor}
        title="设为模型 · 选择档案"
        onClose={() => setYsmPickerFor(null)}
        onSelect={(profile) => ysmPickerFor && setAsYsm(ysmPickerFor, profile)}
      />

      <Modal
        open={!!reportFor}
        title="举报皮肤"
        onClose={() => setReportFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportFor(null)}>
              取消
            </Button>
            <Button variant="danger" disabled={reporting || !reportReason.trim()} onClick={submitReport}>
              {reporting ? '提交中…' : '提交举报'}
            </Button>
          </>
        }
      >
        <Field label="举报原因" hint="请描述违规原因，管理员将尽快处理">
          <Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="例如：涉及版权 / 色情内容等" />
        </Field>
      </Modal>
    </div>
  )
}
