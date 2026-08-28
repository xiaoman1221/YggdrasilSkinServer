import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Box, CircleDollarSign, Download, ImagePlus, Pencil, Store, Trash2, Upload, UserRound, XCircle } from 'lucide-react'
import { Profile, profileApi, Texture, textureUrl, wardrobeApi, ysmApi, YsmModel, downloadYsmFile } from '../api/profile'
import { authApi } from '../api/auth'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import { useToast } from '../components/Toast'
import { Button, Field, Input, Modal, Segmented, Spinner, StatusTag, Textarea, TextLink } from '../components/ui'
import { PreviewCard } from '../components/PreviewCard'
import { ProfilePicker } from '../components/ProfilePicker'
import type { YsmPreviewTarget } from '../components/YsmPreviewModal'
import { loadYsmFiles, pickPreviewImage } from '../lib/ysmModel'
// 懒加载预览弹窗，three.js/jszip 只在首次预览时下载
const YsmPreviewModal = lazy(() => import('../components/YsmPreviewModal'))
import { formatSize, safeExternalUrl } from '../utils/format'

// 按模型 id 缓存客户端提取的预览 blob URL：.ysm 加密模型由前端解密兜底，避免列表页重复下载解码
const ysmPreviewCache = new Map<number, string>()

/** YSM 模型卡片预览图：优先使用服务端提取的 preview_url，否则前端解包提取一张预览图。 */
function YsmCardPreview({ model }: { model: YsmModel }) {
  const [src, setSrc] = useState<string | null>(() => model.preview_url || ysmPreviewCache.get(model.id) || null)
  const [failed, setFailed] = useState(false)
  // 卡片进入视口附近才执行解包提取，避免列表页一次性解码全部模型造成卡顿
  const [inView, setInView] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el || model.preview_url || src) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [model.preview_url, src])

  useEffect(() => {
    if (!inView || model.preview_url || src || failed) return
    if (ysmPreviewCache.has(model.id)) {
      setSrc(ysmPreviewCache.get(model.id)!)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const files = await loadYsmFiles(model.url, model.format)
        const cover = pickPreviewImage(files)
        if (!cover) {
          if (!cancelled) setFailed(true)
          return
        }
        const objectUrl = URL.createObjectURL(new Blob([cover.data.slice().buffer as ArrayBuffer], { type: 'image/png' }))
        ysmPreviewCache.set(model.id, objectUrl)
        if (!cancelled) setSrc(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // 用原始值作为依赖，避免父组件重渲染导致重复解包
  }, [inView, model.id, model.url, model.format, src, failed])

  return (
    <div className="ysm-icon" ref={boxRef}>
      {!src || failed ? (
        <Box size={30} strokeWidth={1.25} />
      ) : (
        <img src={src} alt="" className="ysm-preview-img" loading="lazy" />
      )}
    </div>
  )
}

export default function Wardrobe() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const toast = useToast()
  const [textures, setTextures] = useState<Texture[]>([])
  const skins = textures.filter((tex) => tex.type === 'skin')
  const capes = textures.filter((tex) => tex.type === 'cape')
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState<'skin' | 'cape'>('skin')
  const [model, setModel] = useState<'classic' | 'slim'>('classic')
  const [texName, setTexName] = useState('')
  const [texDesc, setTexDesc] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pickerFor, setPickerFor] = useState<Texture | null>(null)
  const [capePickerFor, setCapePickerFor] = useState<Texture | null>(null)
  const [editTexFor, setEditTexFor] = useState<Texture | null>(null)
  const [editTexForm, setEditTexForm] = useState({ name: '', description: '' })
  const [editTexBusy, setEditTexBusy] = useState(false)
  // 皮肤申请入库
  const [libFor, setLibFor] = useState<Texture | null>(null)
  const [libTitle, setLibTitle] = useState('')
  const [libAgreement, setLibAgreement] = useState('')
  const [libTags, setLibTags] = useState('')
  const [libBusy, setLibBusy] = useState(false)

  // YSM 模型
  const [ysmModels, setYsmModels] = useState<YsmModel[]>([])
  const [ysmLoading, setYsmLoading] = useState(true)
  const [ysmUploadOpen, setYsmUploadOpen] = useState(false)
  const [ysmName, setYsmName] = useState('')
  const [ysmDescription, setYsmDescription] = useState('')
  const [ysmAgreement, setYsmAgreement] = useState('')
  const [ysmPurchase, setYsmPurchase] = useState('')
  const [ysmPrice, setYsmPrice] = useState('')
  const [ysmBusy, setYsmBusy] = useState(false)
  const [ysmDragging, setYsmDragging] = useState(false)
  const [previewFor, setPreviewFor] = useState<YsmModel | null>(null)
  const [editYsmFor, setEditYsmFor] = useState<YsmModel | null>(null)
  const [editYsmForm, setEditYsmForm] = useState({
    name: '',
    description: '',
    usage_agreement: '',
    purchase_url: '',
    price_info: '',
  })
  const [editYsmBusy, setEditYsmBusy] = useState(false)
  const ysmFileRef = useRef<HTMLInputElement>(null)
  // YSM 申请入库
  const [ysmLibFor, setYsmLibFor] = useState<YsmModel | null>(null)
  const [ysmLibTitle, setYsmLibTitle] = useState('')
  const [ysmLibAgreement, setYsmLibAgreement] = useState('')
  const [ysmLibPrice, setYsmLibPrice] = useState<'免费' | '付费'>('免费')
  const [ysmLibPurchase, setYsmLibPurchase] = useState('')
  const [ysmLibTags, setYsmLibTags] = useState('')
  const [ysmLibBusy, setYsmLibBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await wardrobeApi.list()
      setTextures(res.textures)
    } catch (err: any) {
      toast.show(err.message || t('wardrobe.toast.loadFailed'), 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadYsm = useCallback(async () => {
    setYsmLoading(true)
    try {
      const res = await ysmApi.list()
      setYsmModels(res.models)
    } catch (err: any) {
      toast.show(err.message || t('wardrobe.toast.ysmLoadFailed'), 'err')
    } finally {
      setYsmLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
    loadYsm()
  }, [load, loadYsm])

  async function doUpload(file: File) {
    if (busy) return
    if (!/\.png$/i.test(file.name) && file.type !== 'image/png') {
      toast.show(t('wardrobe.toast.onlyPng'), 'err')
      return
    }
    setBusy(true)
    try {
      await wardrobeApi.upload(uploadType, file, model, texName.trim(), texDesc.trim())
      toast.show(t('wardrobe.toast.uploadSuccess'), 'ok')
      setUploadOpen(false)
      setTexName('')
      setTexDesc('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.uploadFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }

  function openTexEdit(tex: Texture) {
    setEditTexForm({ name: tex.name || '', description: tex.description || '' })
    setEditTexFor(tex)
  }

  async function saveTexEdit() {
    if (!editTexFor || editTexBusy) return
    setEditTexBusy(true)
    try {
      await wardrobeApi.update(editTexFor.id, editTexForm)
      toast.show(t('wardrobe.toast.saved'), 'ok')
      setEditTexFor(null)
      load()
    } catch (err: any) {
      toast.show(err?.message || t('wardrobe.toast.saveFailed'), 'err')
    } finally {
      setEditTexBusy(false)
    }
  }

  async function removeTexture(tex: Texture) {
    if (!window.confirm(t('wardrobe.confirm.deleteTexture', { hash: tex.hash.slice(0, 12) }))) return
    try {
      await wardrobeApi.remove(tex.id)
      toast.show(t('wardrobe.toast.deleted'), 'ok')
      load()
    } catch (err: any) {
      toast.show(err.message || t('wardrobe.toast.deleteFailed'), 'err')
    }
  }

  async function setAsAvatar(tex: Texture) {
    try {
      await authApi.setAvatar(tex.id)
      await refreshUser()
      toast.show(t('wardrobe.toast.setAvatar'), 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.setFailed'), 'err')
    }
  }

  async function setAsSkin(tex: Texture, profile: Profile) {
    try {
      await profileApi.bindTexture(profile.uuid, 'skin', tex.id)
      toast.show(t('wardrobe.toast.applied', { name: profile.name }), 'ok')
      setPickerFor(null)
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.applyFailed'), 'err')
    }
  }

  async function setAsCape(tex: Texture, profile: Profile) {
    try {
      await profileApi.bindTexture(profile.uuid, 'cape', tex.id)
      toast.show(t('wardrobe.toast.applied', { name: profile.name }), 'ok')
      setCapePickerFor(null)
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.applyFailed'), 'err')
    }
  }

  async function doYsmUpload(file: File) {
    if (ysmBusy) return
    if (!/\.(ysm|zip)$/i.test(file.name)) {
      toast.show(t('wardrobe.toast.onlyYsmZip'), 'err')
      return
    }
    setYsmBusy(true)
    try {
      await ysmApi.upload(file, ysmName.trim() || file.name.replace(/\.(ysm|zip)$/i, ''), ysmDescription, {
        usageAgreement: ysmAgreement.trim(),
        purchaseUrl: ysmPurchase.trim(),
        priceInfo: ysmPrice.trim(),
      })
      toast.show(t('wardrobe.toast.ysmUploadSuccess'), 'ok')
      setYsmUploadOpen(false)
      setYsmName('')
      setYsmDescription('')
      setYsmAgreement('')
      setYsmPurchase('')
      setYsmPrice('')
      loadYsm()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.uploadFailed'), 'err')
    } finally {
      setYsmBusy(false)
    }
  }

  function openYsmEdit(m: YsmModel) {
    setEditYsmForm({
      name: m.name || '',
      description: m.description || '',
      usage_agreement: m.usage_agreement || '',
      purchase_url: m.purchase_url || '',
      price_info: m.price_info || '',
    })
    setEditYsmFor(m)
  }

  async function saveYsmEdit() {
    if (!editYsmFor || editYsmBusy) return
    setEditYsmBusy(true)
    try {
      await ysmApi.updateMeta(editYsmFor.id, editYsmForm)
      toast.show(t('wardrobe.toast.saved'), 'ok')
      setEditYsmFor(null)
      loadYsm()
    } catch (err: any) {
      toast.show(err?.message || t('wardrobe.toast.saveFailed'), 'err')
    } finally {
      setEditYsmBusy(false)
    }
  }

  async function removeYsm(m: YsmModel) {
    if (!window.confirm(t('wardrobe.confirm.deleteModel', { name: m.name }))) return
    try {
      await ysmApi.remove(m.id)
      toast.show(t('wardrobe.toast.deleted'), 'ok')
      loadYsm()
    } catch (err: any) {
      toast.show(err.message || t('wardrobe.toast.deleteFailed'), 'err')
    }
  }

  async function submitSkinLibrary() {
    if (!libFor || libBusy) return
    if (!libAgreement.trim()) {
      toast.show(t('wardrobe.toast.fillSkinAgreement'), 'err')
      return
    }
    setLibBusy(true)
    try {
      await wardrobeApi.submitLibrary(libFor.id, {
        title: libTitle.trim() || libFor.name || t('wardrobe.skinLib.unnamedSkin'),
        usage_agreement: libAgreement.trim(),
        tags: libTags.split(/[\s,，]+/).filter(Boolean),
      })
      toast.show(t('wardrobe.toast.submitted'), 'ok')
      setLibFor(null)
      setLibTitle('')
      setLibAgreement('')
      setLibTags('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.submitFailed'), 'err')
    } finally {
      setLibBusy(false)
    }
  }

  async function withdrawSkinSubmission(tex: Texture) {
    if (!tex.library_item) return
    if (!window.confirm(t('wardrobe.confirm.withdrawSkin'))) return
    try {
      await wardrobeApi.removeLibrarySubmission(tex.id)
      toast.show(t('wardrobe.toast.withdrawn'), 'ok')
      load()
    } catch (err: any) {
      toast.show(err.message || t('wardrobe.toast.withdrawFailed'), 'err')
    }
  }

  async function submitYsmLibrary() {
    if (!ysmLibFor || ysmLibBusy) return
    if (!ysmLibAgreement.trim()) {
      toast.show(t('wardrobe.toast.fillYsmAgreement'), 'err')
      return
    }
    if (ysmLibPurchase.trim() && !/^https?:\/\/.+/i.test(ysmLibPurchase.trim())) {
      toast.show(t('wardrobe.toast.invalidPurchaseUrl'), 'err')
      return
    }
    if (ysmLibPrice === '付费' && !ysmLibPurchase.trim()) {
      toast.show(t('wardrobe.toast.paidRequiresPurchaseUrl'), 'err')
      return
    }
    setYsmLibBusy(true)
    try {
      await ysmApi.submitLibrary(ysmLibFor.id, {
        title: ysmLibTitle.trim() || ysmLibFor.name || t('wardrobe.ysmLib.unnamedModel'),
        usage_agreement: ysmLibAgreement.trim(),
        price_info: ysmLibPrice,
        ...(ysmLibPurchase.trim() ? { purchase_url: ysmLibPurchase.trim() } : {}),
        tags: ysmLibTags.split(/[\s,，]+/).filter(Boolean),
      })
      toast.show(t('wardrobe.toast.submitted'), 'ok')
      setYsmLibFor(null)
      setYsmLibTitle('')
      setYsmLibAgreement('')
      setYsmLibPrice('免费')
      setYsmLibPurchase('')
      setYsmLibTags('')
      loadYsm()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || t('wardrobe.toast.submitFailed'), 'err')
    } finally {
      setYsmLibBusy(false)
    }
  }

  async function withdrawYsmSubmission(m: YsmModel) {
    if (!m.library_item) return
    if (!window.confirm(t('wardrobe.confirm.withdrawModel'))) return
    try {
      await ysmApi.removeLibrarySubmission(m.id)
      toast.show(t('wardrobe.toast.withdrawn'), 'ok')
      loadYsm()
    } catch (err: any) {
      toast.show(err.message || t('wardrobe.toast.withdrawFailed'), 'err')
    }
  }

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">{t('wardrobe.title')}</h1>
          <p className="page-sub">{t('wardrobe.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setUploadOpen(true)}>
          <Upload size={16} strokeWidth={1.5} />
          {t('wardrobe.uploadBtn')}
        </Button>
      </header>

      {loading ? (
        <Spinner label={t('wardrobe.loadingSkins')} />
      ) : textures.length === 0 ? (
        <div className="empty">{t('wardrobe.emptyTextures')}</div>
      ) : (
        <>
          {skins.length > 0 && (
            <section style={{ marginBottom: 40 }}>
              <div className="sec-head">
                <h2 className="page-title" style={{ fontSize: 20 }}>
                  {t('wardrobe.sectionSkins')} <span className="mono sec-count">{skins.length}</span>
                </h2>
              </div>
              <div className="grid">
                {skins.map((tex) => (
                  <PreviewCard
                    key={tex.id}
                    skinUrl={textureUrl(tex.hash)}
                    slim={tex.model === 'slim'}
                    title={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {tex.name ? <span className="mono">{tex.name}</span> : null}
                        {tex.library_item?.status === 'pending' ? <StatusTag kind="warn">{t('wardrobe.status.pending')}</StatusTag> : null}
                        {tex.library_item?.status === 'approved' ? <StatusTag kind="on">{t('wardrobe.status.approved')}</StatusTag> : null}
                        {tex.library_item?.status === 'rejected' ? <StatusTag kind="warn">{t('wardrobe.status.rejected')}</StatusTag> : null}
                      </span>
                    }
                    meta={`${tex.model} · ${tex.width}×${tex.height} · ${tex.hash.slice(0, 12)}…${tex.description ? ' · ' + tex.description : ''}`}
                    actions={
                      <>
                        <TextLink onClick={() => setPickerFor(tex)}>
                          <ImagePlus size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.setSkin')}</span>
                        </TextLink>
                        <TextLink onClick={() => setAsAvatar(tex)}>
                          <UserRound size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.setAvatar')}</span>
                        </TextLink>
                        {!tex.library_item ? (
                          <TextLink onClick={() => setLibFor(tex)}>
                            <Store size="1em" strokeWidth={1.5} />
                            <span className="lnk-txt">{t('wardrobe.action.applyLibrary')}</span>
                          </TextLink>
                        ) : null}
                        {tex.library_item?.status === 'pending' || tex.library_item?.status === 'rejected' ? (
                          <TextLink onClick={() => withdrawSkinSubmission(tex)}>
                            <XCircle size="1em" strokeWidth={1.5} />
                            <span className="lnk-txt">{t('wardrobe.action.withdrawApplication')}</span>
                          </TextLink>
                        ) : null}
                        <TextLink onClick={() => openTexEdit(tex)}>
                          <Pencil size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.info')}</span>
                        </TextLink>
                        <TextLink danger onClick={() => removeTexture(tex)}>
                          <Trash2 size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.delete')}</span>
                        </TextLink>
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )}
          {capes.length > 0 && (
            <section style={{ marginBottom: 40 }}>
              <div className="sec-head">
                <h2 className="page-title" style={{ fontSize: 20 }}>
                  {t('wardrobe.sectionCapes')} <span className="mono sec-count">{capes.length}</span>
                </h2>
              </div>
              <div className="grid">
                {capes.map((tex) => (
                  <PreviewCard
                    key={tex.id}
                    capeUrl={textureUrl(tex.hash)}
                    title={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {tex.name ? <span className="mono">{tex.name}</span> : null}
                      </span>
                    }
                    meta={`${tex.width}×${tex.height} · ${tex.hash.slice(0, 12)}…${tex.description ? ' · ' + tex.description : ''}`}
                    actions={
                      <>
                        <TextLink onClick={() => setCapePickerFor(tex)}>
                          <ImagePlus size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.setCape')}</span>
                        </TextLink>
                        <TextLink onClick={() => openTexEdit(tex)}>
                          <Pencil size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.info')}</span>
                        </TextLink>
                        <TextLink danger onClick={() => removeTexture(tex)}>
                          <Trash2 size="1em" strokeWidth={1.5} />
                          <span className="lnk-txt">{t('wardrobe.action.delete')}</span>
                        </TextLink>
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          marginTop: 40,
          paddingTop: 32,
          borderTop: '1px solid var(--line)',
        }}
      >
        <div>
          <h2 className="page-title" style={{ fontSize: 22 }}>
            {t('wardrobe.sectionYsm')}
          </h2>
          <p className="page-sub">{t('wardrobe.ysmDesc')}</p>
        </div>
        <Button variant="primary" onClick={() => setYsmUploadOpen(true)}>
          <Upload size={16} strokeWidth={1.5} />
          {t('wardrobe.uploadYsmBtn')}
        </Button>
      </div>

      {ysmLoading ? (
        <div style={{ marginTop: 16 }}>
          <Spinner label={t('wardrobe.loadingYsm')} />
        </div>
      ) : ysmModels.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>
          {t('wardrobe.emptyYsm')}
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {ysmModels.map((m) => (
            <div key={m.id} className="ysm-card">
              <YsmCardPreview model={m} />
              <div className="pcard-body">
                <div className="pcard-title">
                  <span className="mono">{m.name}</span>
                  <StatusTag kind={m.format === 'ysm' ? 'on' : 'warn'}>
                    {m.format === 'ysm' ? 'YSM' : 'ZIP'}
                  </StatusTag>
                  {m.price_info ? (
                    <StatusTag kind={m.is_free ? 'on' : 'warn'}>{m.price_info}</StatusTag>
                  ) : null}
                  {m.library_item?.status === 'pending' ? <StatusTag kind="warn">{t('wardrobe.status.pending')}</StatusTag> : null}
                  {m.library_item?.status === 'approved' ? <StatusTag kind="on">{t('wardrobe.status.approved')}</StatusTag> : null}
                  {m.library_item?.status === 'rejected' ? <StatusTag kind="warn">{t('wardrobe.status.rejected')}</StatusTag> : null}
                </div>
                <div className="pcard-meta">
                  <span className="mono tabular-nums">{formatSize(m.size)}</span>
                  {' · '}
                  <span className="mono">{m.hash.slice(0, 12)}…</span>
                </div>
                {m.description ? <div className="pcard-meta">{m.description}</div> : null}
                {m.usage_agreement ? <div className="pcard-meta">{t('wardrobe.ysmMetaAgreement')}{m.usage_agreement}</div> : null}
                <div className="pcard-actions">
                  <TextLink onClick={() => setPreviewFor(m)}>
                    <Box size="1em" strokeWidth={1.5} />
                    <span className="lnk-txt">{t('wardrobe.action.preview')}</span>
                  </TextLink>
                  {safeExternalUrl(m.purchase_url) ? (
                    <a className="link-btn" href={safeExternalUrl(m.purchase_url)} target="_blank" rel="noreferrer">
                      <CircleDollarSign size="1em" strokeWidth={1.5} />
                      <span className="lnk-txt">{t('wardrobe.action.acquire')}</span>
                    </a>
                  ) : null}
                  <TextLink
                    onClick={() => {
                      downloadYsmFile(m).catch((err: any) => toast.show(err?.message || t('wardrobe.toast.downloadFailed'), 'err'))
                    }}
                  >
                    <Download size="1em" strokeWidth={1.5} />
                    <span className="lnk-txt">{t('wardrobe.action.download')}</span>
                  </TextLink>
                  <TextLink onClick={() => openYsmEdit(m)}>
                    <Pencil size="1em" strokeWidth={1.5} />
                    <span className="lnk-txt">{t('wardrobe.action.info')}</span>
                  </TextLink>
                  {!m.library_item ? (
                    <TextLink onClick={() => setYsmLibFor(m)}>
                      <Store size="1em" strokeWidth={1.5} />
                      <span className="lnk-txt">{t('wardrobe.action.applyLibrary')}</span>
                    </TextLink>
                  ) : null}
                  {m.library_item?.status === 'pending' || m.library_item?.status === 'rejected' ? (
                    <TextLink onClick={() => withdrawYsmSubmission(m)}>
                      <XCircle size="1em" strokeWidth={1.5} />
                      <span className="lnk-txt">{t('wardrobe.action.withdrawApplication')}</span>
                    </TextLink>
                  ) : null}
                  <TextLink danger onClick={() => removeYsm(m)}>
                    <Trash2 size="1em" strokeWidth={1.5} />
                    <span className="lnk-txt">{t('wardrobe.action.delete')}</span>
                  </TextLink>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfilePicker
        open={!!pickerFor}
        title={t('wardrobe.picker.skinTitle')}
        onClose={() => setPickerFor(null)}
        onSelect={(profile) => pickerFor && setAsSkin(pickerFor, profile)}
      />

      <ProfilePicker
        open={!!capePickerFor}
        title={t('wardrobe.picker.capeTitle')}
        onClose={() => setCapePickerFor(null)}
        onSelect={(profile) => capePickerFor && setAsCape(capePickerFor, profile)}
      />

      <Suspense fallback={null}>
        <YsmPreviewModal
          open={!!previewFor}
          target={previewFor ? { name: previewFor.name, url: previewFor.url, format: previewFor.format } : null}
          onClose={() => setPreviewFor(null)}
        />
      </Suspense>

      <Modal
        open={uploadOpen}
        title={t('wardrobe.upload.title')}
        onClose={() => setUploadOpen(false)}
        footer={
          <Button variant="ghost" onClick={() => setUploadOpen(false)}>
            {t('wardrobe.upload.close')}
          </Button>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <span className="field-label">{t('wardrobe.upload.type')}</span>
            <Segmented<'skin' | 'cape'>
              options={[
                { value: 'skin', label: t('common.skin') },
                { value: 'cape', label: t('common.cape') },
              ]}
              value={uploadType}
              onChange={setUploadType}
            />
          </div>
          {uploadType === 'skin' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span className="field-label">{t('wardrobe.upload.model')}</span>
              <Segmented<'classic' | 'slim'>
                options={[
                  { value: 'classic', label: t('wardrobe.upload.modelClassic') },
                  { value: 'slim', label: t('wardrobe.upload.modelSlim') },
                ]}
                value={model}
                onChange={setModel}
              />
            </div>
          )}
          <Field label={t('wardrobe.upload.nameLabel')}>
            <Input value={texName} onChange={(e) => setTexName(e.target.value)} placeholder={t('wardrobe.upload.namePlaceholder')} />
          </Field>
          <Field label={t('wardrobe.upload.descLabel')}>
            <Input value={texDesc} onChange={(e) => setTexDesc(e.target.value)} placeholder={t('wardrobe.upload.descPlaceholder')} />
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="image/png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doUpload(f)
              e.target.value = ''
            }}
          />
          <div
            className={`dropzone ${dragging ? 'drag' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) doUpload(f)
            }}
          >
            <Upload size={20} strokeWidth={1.5} />
            <span>{busy ? t('wardrobe.upload.uploading') : t('wardrobe.upload.dropzoneIdle')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('wardrobe.upload.dropzoneHint')}</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={ysmUploadOpen}
        title={t('wardrobe.uploadYsm.title')}
        onClose={() => setYsmUploadOpen(false)}
        footer={
          <Button variant="ghost" onClick={() => setYsmUploadOpen(false)}>
            {t('wardrobe.upload.close')}
          </Button>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label={t('wardrobe.uploadYsm.nameLabel')} hint={t('wardrobe.uploadYsm.nameHint')}>
            <Input
              className="mono"
              value={ysmName}
              onChange={(e) => setYsmName(e.target.value)}
              placeholder={t('wardrobe.uploadYsm.namePlaceholder')}
            />
          </Field>
          <Field label={t('wardrobe.uploadYsm.descLabel')}>
            <Textarea
              value={ysmDescription}
              onChange={(e) => setYsmDescription(e.target.value)}
              placeholder={t('wardrobe.uploadYsm.descPlaceholder')}
              rows={3}
            />
          </Field>
          <Field label={t('wardrobe.uploadYsm.agreementLabel')} hint={t('wardrobe.uploadYsm.agreementHint')}>
            <Input
              value={ysmAgreement}
              onChange={(e) => setYsmAgreement(e.target.value)}
              placeholder={t('wardrobe.uploadYsm.agreementPlaceholder')}
            />
          </Field>
          <Field label={t('wardrobe.uploadYsm.purchaseLabel')} hint={t('wardrobe.uploadYsm.purchaseHint')}>
            <Input
              className="mono"
              value={ysmPurchase}
              onChange={(e) => setYsmPurchase(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label={t('wardrobe.uploadYsm.priceLabel')} hint={t('wardrobe.uploadYsm.priceHint')}>
            <Input value={ysmPrice} onChange={(e) => setYsmPrice(e.target.value)} placeholder={t('wardrobe.uploadYsm.pricePlaceholder')} />
          </Field>
          <input
            ref={ysmFileRef}
            type="file"
            accept=".ysm,.zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doYsmUpload(f)
              e.target.value = ''
            }}
          />
          <div
            className={`dropzone ${ysmDragging ? 'drag' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => ysmFileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') ysmFileRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setYsmDragging(true)
            }}
            onDragLeave={() => setYsmDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setYsmDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) doYsmUpload(f)
            }}
          >
            <Box size={20} strokeWidth={1.5} />
            <span>{ysmBusy ? t('wardrobe.uploadYsm.uploading') : t('wardrobe.uploadYsm.dropzoneIdle')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {t('wardrobe.uploadYsm.dropzoneHint')}
            </span>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editTexFor}
        title={t('wardrobe.editTex.title')}
        onClose={() => setEditTexFor(null)}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditTexFor(null)}>
              {t('wardrobe.editTex.cancel')}
            </Button>
            <Button variant="primary" disabled={editTexBusy} onClick={saveTexEdit}>
              {editTexBusy ? t('wardrobe.editTex.saving') : t('wardrobe.editTex.save')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label={t('wardrobe.editTex.nameLabel')}>
            <Input
              value={editTexForm.name}
              onChange={(e) => setEditTexForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('wardrobe.editTex.namePlaceholder')}
            />
          </Field>
          <Field label={t('wardrobe.editTex.descLabel')}>
            <Input
              value={editTexForm.description}
              onChange={(e) => setEditTexForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('wardrobe.editTex.descPlaceholder')}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!editYsmFor}
        title={t('wardrobe.editYsm.title')}
        onClose={() => setEditYsmFor(null)}
        width={560}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditYsmFor(null)}>
              {t('wardrobe.editYsm.cancel')}
            </Button>
            <Button variant="primary" disabled={editYsmBusy} onClick={saveYsmEdit}>
              {editYsmBusy ? t('wardrobe.editYsm.saving') : t('wardrobe.editYsm.save')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label={t('wardrobe.editYsm.nameLabel')}>
            <Input
              value={editYsmForm.name}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label={t('wardrobe.editYsm.descLabel')}>
            <Textarea
              value={editYsmForm.description}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </Field>
          <Field label={t('wardrobe.editYsm.agreementLabel')}>
            <Input
              value={editYsmForm.usage_agreement}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, usage_agreement: e.target.value }))}
              placeholder={t('wardrobe.editYsm.agreementPlaceholder')}
            />
          </Field>
          <Field label={t('wardrobe.editYsm.purchaseLabel')}>
            <Input
              className="mono"
              value={editYsmForm.purchase_url}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, purchase_url: e.target.value }))}
              placeholder="https://"
            />
          </Field>
          <Field label={t('wardrobe.editYsm.priceLabel')}>
            <Input
              value={editYsmForm.price_info}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, price_info: e.target.value }))}
              placeholder={t('wardrobe.editYsm.pricePlaceholder')}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!libFor}
        title={t('wardrobe.skinLib.title', { name: libFor?.name || t('common.skin') })}
        onClose={() => setLibFor(null)}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setLibFor(null)}>
              {t('wardrobe.skinLib.cancel')}
            </Button>
            <Button variant="primary" disabled={libBusy || !libAgreement.trim()} onClick={submitSkinLibrary}>
              {libBusy ? t('wardrobe.skinLib.submitting') : t('wardrobe.skinLib.submit')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label={t('wardrobe.skinLib.titleLabel')} hint={t('wardrobe.skinLib.titleHint')}>
            <Input
              className="mono"
              value={libTitle}
              onChange={(e) => setLibTitle(e.target.value)}
              placeholder={libFor?.name || t('wardrobe.skinLib.unnamedSkin')}
            />
          </Field>
          <Field label={t('wardrobe.skinLib.agreementLabel')} hint={t('wardrobe.skinLib.agreementHint')}>
            <Textarea
              value={libAgreement}
              onChange={(e) => setLibAgreement(e.target.value)}
              placeholder={t('wardrobe.skinLib.agreementPlaceholder')}
              rows={3}
            />
          </Field>
          <Field label={t('wardrobe.skinLib.tagsLabel')} hint={t('wardrobe.skinLib.tagsHint')}>
            <Input value={libTags} onChange={(e) => setLibTags(e.target.value)} placeholder={t('wardrobe.skinLib.tagsPlaceholder')} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!ysmLibFor}
        title={t('wardrobe.ysmLib.title', { name: ysmLibFor?.name || t('common.model') })}
        onClose={() => setYsmLibFor(null)}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setYsmLibFor(null)}>
              {t('wardrobe.ysmLib.cancel')}
            </Button>
            <Button variant="primary" disabled={ysmLibBusy || !ysmLibAgreement.trim()} onClick={submitYsmLibrary}>
              {ysmLibBusy ? t('wardrobe.ysmLib.submitting') : t('wardrobe.ysmLib.submit')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label={t('wardrobe.ysmLib.titleLabel')} hint={t('wardrobe.ysmLib.titleHint')}>
            <Input
              className="mono"
              value={ysmLibTitle}
              onChange={(e) => setYsmLibTitle(e.target.value)}
              placeholder={ysmLibFor?.name || t('wardrobe.ysmLib.unnamedModel')}
            />
          </Field>
          <Field label={t('wardrobe.ysmLib.agreementLabel')} hint={t('wardrobe.ysmLib.agreementHint')}>
            <Textarea
              value={ysmLibAgreement}
              onChange={(e) => setYsmLibAgreement(e.target.value)}
              placeholder={t('wardrobe.ysmLib.agreementPlaceholder')}
              rows={3}
            />
          </Field>
          <Field label={t('wardrobe.ysmLib.priceLabel')} hint={t('wardrobe.ysmLib.priceHint')}>
            <Segmented<'免费' | '付费'>
              options={[
                { value: '免费', label: t('common.free') },
                { value: '付费', label: t('common.paid') },
              ]}
              value={ysmLibPrice}
              onChange={setYsmLibPrice}
            />
          </Field>
          {ysmLibPrice === '付费' ? (
            <Field label={t('wardrobe.ysmLib.purchaseLabel')} hint={t('wardrobe.ysmLib.purchaseHint')}>
              <Input
                className="mono"
                value={ysmLibPurchase}
                onChange={(e) => setYsmLibPurchase(e.target.value)}
                placeholder="https://"
              />
            </Field>
          ) : null}
          <Field label={t('wardrobe.ysmLib.tagsLabel')} hint={t('wardrobe.ysmLib.tagsHint')}>
            <Input value={ysmLibTags} onChange={(e) => setYsmLibTags(e.target.value)} placeholder={t('wardrobe.ysmLib.tagsPlaceholder')} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
