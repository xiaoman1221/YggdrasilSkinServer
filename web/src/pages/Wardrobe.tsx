import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Box, CircleDollarSign, Download, ImagePlus, Pencil, Trash2, Upload, UserRound } from 'lucide-react'
import { Profile, profileApi, Texture, textureUrl, wardrobeApi, ysmApi, YsmModel } from '../api/profile'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/auth'
import { useToast } from '../components/Toast'
import { Button, Field, Input, Modal, Segmented, Spinner, StatusTag, Textarea, TextLink } from '../components/ui'
import { PreviewCard } from '../components/PreviewCard'
import { ProfilePicker } from '../components/ProfilePicker'
import type { YsmPreviewTarget } from '../components/YsmPreviewModal'
// 懒加载预览弹窗，three.js/jszip 只在首次预览时下载
const YsmPreviewModal = lazy(() => import('../components/YsmPreviewModal'))
import { formatSize } from '../utils/format'

export default function Wardrobe() {
  const { refreshUser } = useAuth()
  const toast = useToast()
  const [textures, setTextures] = useState<Texture[]>([])
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
  const [editTexFor, setEditTexFor] = useState<Texture | null>(null)
  const [editTexForm, setEditTexForm] = useState({ name: '', description: '' })
  const [editTexBusy, setEditTexBusy] = useState(false)

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
  const [ysmPickerFor, setYsmPickerFor] = useState<YsmModel | null>(null)
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await wardrobeApi.list()
      setTextures(res.textures)
    } catch (err: any) {
      toast.show(err.message || '加载失败', 'err')
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
      toast.show(err.message || '加载 YSM 模型失败', 'err')
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
      toast.show('仅支持 PNG 图片', 'err')
      return
    }
    setBusy(true)
    try {
      await wardrobeApi.upload(uploadType, file, model, texName.trim(), texDesc.trim())
      toast.show('上传成功', 'ok')
      setUploadOpen(false)
      setTexName('')
      setTexDesc('')
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '上传失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  function openTexEdit(t: Texture) {
    setEditTexForm({ name: t.name || '', description: t.description || '' })
    setEditTexFor(t)
  }

  async function saveTexEdit() {
    if (!editTexFor || editTexBusy) return
    setEditTexBusy(true)
    try {
      await wardrobeApi.update(editTexFor.id, editTexForm)
      toast.show('已保存', 'ok')
      setEditTexFor(null)
      load()
    } catch (err: any) {
      toast.show(err?.message || '保存失败', 'err')
    } finally {
      setEditTexBusy(false)
    }
  }

  async function removeTexture(t: Texture) {
    if (!window.confirm(`确认删除该材质（${t.hash.slice(0, 12)}…）？`)) return
    try {
      await wardrobeApi.remove(t.id)
      toast.show('已删除', 'ok')
      load()
    } catch (err: any) {
      toast.show(err.message || '删除失败', 'err')
    }
  }

  async function setAsAvatar(t: Texture) {
    try {
      await authApi.setAvatar(t.id)
      await refreshUser()
      toast.show('已设为头像', 'ok')
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '设置失败', 'err')
    }
  }

  async function setAsSkin(t: Texture, profile: Profile) {
    try {
      await profileApi.bindTexture(profile.uuid, 'skin', t.id)
      toast.show(`已应用到 ${profile.name}`, 'ok')
      setPickerFor(null)
      load()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '应用失败', 'err')
    }
  }

  async function doYsmUpload(file: File) {
    if (ysmBusy) return
    if (!/\.(ysm|zip)$/i.test(file.name)) {
      toast.show('仅支持 .ysm 或 .zip 模型文件', 'err')
      return
    }
    setYsmBusy(true)
    try {
      await ysmApi.upload(file, ysmName.trim() || file.name.replace(/\.(ysm|zip)$/i, ''), ysmDescription, {
        usageAgreement: ysmAgreement.trim(),
        purchaseUrl: ysmPurchase.trim(),
        priceInfo: ysmPrice.trim(),
      })
      toast.show('模型上传成功', 'ok')
      setYsmUploadOpen(false)
      setYsmName('')
      setYsmDescription('')
      setYsmAgreement('')
      setYsmPurchase('')
      setYsmPrice('')
      loadYsm()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '上传失败', 'err')
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
      toast.show('已保存', 'ok')
      setEditYsmFor(null)
      loadYsm()
    } catch (err: any) {
      toast.show(err?.message || '保存失败', 'err')
    } finally {
      setEditYsmBusy(false)
    }
  }

  async function removeYsm(m: YsmModel) {
    if (!window.confirm(`确认删除模型「${m.name}」？已绑定该模型的档案将解除绑定。`)) return
    try {
      await ysmApi.remove(m.id)
      toast.show('已删除', 'ok')
      loadYsm()
    } catch (err: any) {
      toast.show(err.message || '删除失败', 'err')
    }
  }

  async function setAsYsm(m: YsmModel, profile: Profile) {
    try {
      await profileApi.bindYsm(profile.uuid, m.id)
      toast.show(`已应用到 ${profile.name}`, 'ok')
      setYsmPickerFor(null)
      loadYsm()
    } catch (err: any) {
      toast.show(err?.response?.data?.error?.message || err.message || '应用失败', 'err')
    }
  }

  return (
    <div>
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">个人皮肤</h1>
          <p className="page-sub">上传 PNG，服务端校验并重编码后按内容 hash 存储</p>
        </div>
        <Button variant="primary" onClick={() => setUploadOpen(true)}>
          <Upload size={16} strokeWidth={1.5} />
          上传材质
        </Button>
      </header>

      {loading ? (
        <Spinner label="加载材质" />
      ) : textures.length === 0 ? (
        <div className="empty">仓库为空，点击右上角「上传材质」添加第一份</div>
      ) : (
        <div className="grid">
          {textures.map((t) => (
            <PreviewCard
              key={t.id}
              skinUrl={t.type === 'skin' ? textureUrl(t.hash) : undefined}
              capeUrl={t.type === 'cape' ? textureUrl(t.hash) : undefined}
              slim={t.model === 'slim'}
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <StatusTag kind={t.type === 'skin' ? 'on' : 'warn'}>{t.type === 'skin' ? '皮肤' : '披风'}</StatusTag>
                  {t.name ? <span className="mono">{t.name}</span> : null}
                </span>
              }
              meta={`${t.model} · ${t.width}×${t.height} · ${t.hash.slice(0, 12)}…${t.description ? ' · ' + t.description : ''}`}
              actions={
                <>
                  {t.type === 'skin' ? (
                    <>
                      <TextLink onClick={() => setPickerFor(t)}>
                        <ImagePlus size={13} strokeWidth={1.5} />
                        设为皮肤
                      </TextLink>
                      <TextLink onClick={() => setAsAvatar(t)}>
                        <UserRound size={13} strokeWidth={1.5} />
                        设为头像
                      </TextLink>
                    </>
                  ) : null}
                  <TextLink onClick={() => openTexEdit(t)}>
                    <Pencil size={13} strokeWidth={1.5} />
                    信息
                  </TextLink>
                  <TextLink danger onClick={() => removeTexture(t)}>
                    <Trash2 size={13} strokeWidth={1.5} />
                    删除
                  </TextLink>
                </>
              }
            />
          ))}
        </div>
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
            YSM 模型
          </h2>
          <p className="page-sub">
            Yes Steve Model 模型（.ysm / .zip）。上传后绑定档案并获取下载链接，放入游戏目录{' '}
            <code className="mono">config/yes_steve_model/custom</code> 即可使用
          </p>
        </div>
        <Button variant="primary" onClick={() => setYsmUploadOpen(true)}>
          <Upload size={16} strokeWidth={1.5} />
          上传模型
        </Button>
      </div>

      {ysmLoading ? (
        <div style={{ marginTop: 16 }}>
          <Spinner label="加载 YSM 模型" />
        </div>
      ) : ysmModels.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>
          还没有 YSM 模型，点击右上角「上传模型」添加第一份
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {ysmModels.map((m) => (
            <div key={m.id} className="ysm-card">
              <div className="ysm-icon">
                <Box size={30} strokeWidth={1.25} />
              </div>
              <div className="pcard-body">
                <div className="pcard-title">
                  <span className="mono">{m.name}</span>
                  <StatusTag kind={m.format === 'ysm' ? 'on' : 'warn'}>
                    {m.format === 'ysm' ? 'YSM' : 'ZIP'}
                  </StatusTag>
                  {m.price_info ? (
                    <StatusTag kind={m.price_info.includes('免费') ? 'on' : 'warn'}>{m.price_info}</StatusTag>
                  ) : null}
                </div>
                <div className="pcard-meta">
                  <span className="mono tabular-nums">{formatSize(m.size)}</span>
                  {' · '}
                  <span className="mono">{m.hash.slice(0, 12)}…</span>
                </div>
                {m.description ? <div className="pcard-meta">{m.description}</div> : null}
                {m.usage_agreement ? <div className="pcard-meta">协议：{m.usage_agreement}</div> : null}
                <div className="pcard-actions">
                  <TextLink onClick={() => setPreviewFor(m)}>
                    <Box size={13} strokeWidth={1.5} />
                    预览
                  </TextLink>
                  <TextLink onClick={() => setYsmPickerFor(m)}>
                    <ImagePlus size={13} strokeWidth={1.5} />
                    设为模型
                  </TextLink>
                  {m.purchase_url ? (
                    <a className="link-btn" href={m.purchase_url} target="_blank" rel="noreferrer">
                      <CircleDollarSign size={13} strokeWidth={1.5} />
                      获取
                    </a>
                  ) : null}
                  <a className="link-btn" href={m.url} download>
                    <Download size={13} strokeWidth={1.5} />
                    下载
                  </a>
                  <TextLink onClick={() => openYsmEdit(m)}>
                    <Pencil size={13} strokeWidth={1.5} />
                    信息
                  </TextLink>
                  <TextLink danger onClick={() => removeYsm(m)}>
                    <Trash2 size={13} strokeWidth={1.5} />
                    删除
                  </TextLink>
                </div>
              </div>
            </div>
          ))}
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

      <Suspense fallback={null}>
        <YsmPreviewModal
          open={!!previewFor}
          target={previewFor ? { name: previewFor.name, url: previewFor.url, format: previewFor.format } : null}
          onClose={() => setPreviewFor(null)}
        />
      </Suspense>

      <Modal
        open={uploadOpen}
        title="上传材质"
        onClose={() => setUploadOpen(false)}
        footer={
          <Button variant="ghost" onClick={() => setUploadOpen(false)}>
            关闭
          </Button>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <span className="field-label">类型</span>
            <Segmented<'skin' | 'cape'>
              options={[
                { value: 'skin', label: '皮肤' },
                { value: 'cape', label: '披风' },
              ]}
              value={uploadType}
              onChange={setUploadType}
            />
          </div>
          {uploadType === 'skin' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span className="field-label">模型</span>
              <Segmented<'classic' | 'slim'>
                options={[
                  { value: 'classic', label: '经典' },
                  { value: 'slim', label: '纤细' },
                ]}
                value={model}
                onChange={setModel}
              />
            </div>
          )}
          <Field label="名称（可选）">
            <Input value={texName} onChange={(e) => setTexName(e.target.value)} placeholder="给这份材质起个名字" />
          </Field>
          <Field label="描述（可选）">
            <Input value={texDesc} onChange={(e) => setTexDesc(e.target.value)} placeholder="来源、作者等" />
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
            <span>{busy ? '上传中…' : '点击或拖拽 PNG 到此处'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>仅接受 PNG，服务端校验 MIME、尺寸并重编码</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={ysmUploadOpen}
        title="上传 YSM 模型"
        onClose={() => setYsmUploadOpen(false)}
        footer={
          <Button variant="ghost" onClick={() => setYsmUploadOpen(false)}>
            关闭
          </Button>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="模型名称" hint="留空则使用文件名">
            <Input
              className="mono"
              value={ysmName}
              onChange={(e) => setYsmName(e.target.value)}
              placeholder="我的第一个 YSM 模型"
            />
          </Field>
          <Field label="描述（可选）">
            <Textarea
              value={ysmDescription}
              onChange={(e) => setYsmDescription(e.target.value)}
              placeholder="模型来源、作者、注意事项……"
              rows={3}
            />
          </Field>
          <Field label="使用协议（可选）" hint="留空时自动从模型 ysm.json 读取">
            <Input
              value={ysmAgreement}
              onChange={(e) => setYsmAgreement(e.target.value)}
              placeholder="如：CC BY-NC / 禁止二传 / All Rights Reserved"
            />
          </Field>
          <Field label="购买链接（可选）" hint="爱发电 / 淘宝 / 作者主页等">
            <Input
              className="mono"
              value={ysmPurchase}
              onChange={(e) => setYsmPurchase(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="资费说明（可选）" hint="如：免费 / 付费 / 限定授权">
            <Input value={ysmPrice} onChange={(e) => setYsmPrice(e.target.value)} placeholder="免费" />
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
            <span>{ysmBusy ? '上传中…' : '点击或拖拽 .ysm / .zip 到此处'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              仅接受 YSM 加密模型（YSGP）或含模型描述文件的 zip 压缩包
            </span>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editTexFor}
        title="编辑材质信息"
        onClose={() => setEditTexFor(null)}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditTexFor(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={editTexBusy} onClick={saveTexEdit}>
              {editTexBusy ? '保存中…' : '保存'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="名称">
            <Input
              value={editTexForm.name}
              onChange={(e) => setEditTexForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="给这份材质起个名字"
            />
          </Field>
          <Field label="描述">
            <Input
              value={editTexForm.description}
              onChange={(e) => setEditTexForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="来源、作者等"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!editYsmFor}
        title="编辑模型信息"
        onClose={() => setEditYsmFor(null)}
        width={560}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditYsmFor(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={editYsmBusy} onClick={saveYsmEdit}>
              {editYsmBusy ? '保存中…' : '保存'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="名称">
            <Input
              value={editYsmForm.name}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="描述">
            <Textarea
              value={editYsmForm.description}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </Field>
          <Field label="使用协议">
            <Input
              value={editYsmForm.usage_agreement}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, usage_agreement: e.target.value }))}
              placeholder="如：CC BY-NC / 禁止二传"
            />
          </Field>
          <Field label="购买链接">
            <Input
              className="mono"
              value={editYsmForm.purchase_url}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, purchase_url: e.target.value }))}
              placeholder="https://"
            />
          </Field>
          <Field label="资费说明">
            <Input
              value={editYsmForm.price_info}
              onChange={(e) => setEditYsmForm((f) => ({ ...f, price_info: e.target.value }))}
              placeholder="免费 / 付费 / 限定授权"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

