import { useEffect, useRef, useState } from 'react'
import { Box } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Modal, Spinner } from './ui'
import YsmModelViewer, { type YsmModelData } from './YsmViewer3D'
import { buildBoneBindMap, extractGeometries, pickMainGeometry } from '../lib/bedrock'
import { buildClipsFromFiles } from '../lib/bedrockAnimation'
import { buildTextureOptions, decodeYsmModelFile, fetchModelBuffer } from '../lib/ysmModel'

export interface YsmPreviewTarget {
  name: string
  url: string
  format: string // 'ysm' | 'zip'
}

interface YsmPreviewModalProps {
  open: boolean
  target: YsmPreviewTarget | null
  onClose: () => void
}

type LoadState =
  | { phase: 'loading'; progress: number }
  | { phase: 'error'; message?: string; code?: 'no_geometry' | 'no_textures' }
  | { phase: 'ready'; data: YsmModelData; debug?: string; textureUrls: string[] }

/** 解密并解析模型，产出查看器所需的 modelData。 */
async function prepare(target: YsmPreviewTarget, onProgress: (p: number) => void): Promise<LoadState> {
  const buffer = await fetchModelBuffer(target.url, (loaded, total) => {
    onProgress(total > 0 ? Math.round((loaded / total) * 100) : 0)
  })
  const files = await decodeYsmModelFile(buffer, target.format as 'ysm' | 'zip')

  const jsonFiles = files.map((f) => ({ path: f.path, text: new TextDecoder().decode(f.data) }))
  const entries = extractGeometries(jsonFiles)
  const main = pickMainGeometry(entries)
  if (!main) {
    return { phase: 'error', code: 'no_geometry' }
  }

  const textures = buildTextureOptions(files)
  if (textures.length === 0) {
    return { phase: 'error', code: 'no_textures' }
  }
  // 绑定姿态表：让动画关键帧叠加主模型骨骼的绑定位置/旋转
  const clips = buildClipsFromFiles(files, buildBoneBindMap(main.geometry))

  const debug = JSON.stringify(
    {
      allGeometries: entries.map((e) => e.path),
      rendered: main.path,
      textures: textures.map((t) => t.name),
      animations: clips.map((c) => c.name),
    },
    null,
    2,
  )

  return {
    phase: 'ready',
    data: { geometry: main, clips, textures },
    debug,
    textureUrls: textures.map((t) => t.url),
  }
}

/**
 * YSM 模型 3D 预览弹窗。
 * 加密 .ysm 经 YSMParser WASM 本地解密；开放 .zip 本地解包；
 * 渲染由 R3F 查看器完成（动画切换 / 贴图切换 / 截图 / 全屏）。
 */
export default function YsmPreviewModal({ open, target, onClose }: YsmPreviewModalProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>({ phase: 'loading', progress: 0 })
  const [currentAnimation, setCurrentAnimation] = useState('')
  const [nonce, setNonce] = useState(0)
  // blob URL 仅在弹窗最终卸载时回收，避免状态变化/StrictMode 重挂载导致贴图 URL 失效
  const textureUrlsRef = useRef<string[]>([])

  useEffect(() => {
    if (!open || !target) return
    let cancelled = false
    setState({ phase: 'loading', progress: 0 })
    setCurrentAnimation('')
    prepare(target, (p) => {
      setState((s) => (s.phase === 'loading' ? { ...s, progress: p } : s))
    })
      .then((s) => {
        if (!cancelled) setState(s)
      })
      .catch((err) => {
        if (!cancelled) setState({ phase: 'error', message: err?.message || String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [open, target?.url, target?.format, nonce])

  // 记录当前 blob URL；组件卸载时统一回收
  useEffect(() => {
    if (state.phase === 'ready') textureUrlsRef.current = state.textureUrls
  }, [state])
  useEffect(
    () => () => {
      for (const u of textureUrlsRef.current) URL.revokeObjectURL(u)
    },
    [],
  )

  function retry() {
    setNonce((n) => n + 1)
  }

  const errorMessage =
    state.phase === 'error' && state.code
      ? state.code === 'no_geometry'
        ? t('ysm.modal.errorNoGeometry')
        : t('ysm.modal.errorNoTextures')
      : state.phase === 'error'
        ? state.message
        : undefined

  return (
    <Modal
      open={open}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Box size={16} strokeWidth={1.5} />
          {t('ysm.modal.title')}<span className="mono">{target?.name}</span>
        </span>
      }
      onClose={onClose}
      width={760}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', width: '100%' }}>
          {state.phase === 'error' ? (
            <button className="btn btn-outline" onClick={retry}>
              {t('ysm.retry')}
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            {t('ysm.close')}
          </button>
        </div>
      }
    >
      {state.phase === 'loading' && (
        <div style={{ display: 'grid', placeItems: 'center', padding: '60px 0' }}>
          <Spinner
            label={
              target?.format === 'ysm'
                ? t('ysm.modal.loadingDecrypt', { progress: state.progress })
                : t('ysm.modal.loadingLoad')
            }
          />
        </div>
      )}
      {state.phase === 'error' && (
        <div className="empty" style={{ color: 'var(--danger)' }}>
          {errorMessage}
        </div>
      )}
      {state.phase === 'ready' && (
        <>
          <YsmModelViewer
            modelData={state.data}
            currentAnimation={currentAnimation}
            onAnimationChange={setCurrentAnimation}
            height={480}
          />
          {state.debug ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-3)' }}>
                {t('ysm.modal.debugSummary')}
              </summary>
              <pre
                className="mono"
                style={{
                  maxHeight: 180,
                  overflow: 'auto',
                  fontSize: 11,
                  background: 'var(--bg-muted, #f6f6f6)',
                  padding: 8,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {state.debug}
              </pre>
            </details>
          ) : null}
        </>
      )}
    </Modal>
  )
}
