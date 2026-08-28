import { useEffect, useRef, useState } from 'react'
import * as skinview3d from 'skinview3d'
import { useTranslation } from 'react-i18next'
import stevePng from '../assets/steve.png'

interface SkinPreview3DProps {
  skinUrl?: string | null
  capeUrl?: string | null
  slim?: boolean
  width?: number
  height?: number
  className?: string
  baseSkinUrl?: string | null
}

function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}

/**
 * 兼容 three r160+ 与 skinview3d 3.4.2 的版本错配：
 * skinview3d 的 dispose() 仍访问 ShaderPass 的旧公开字段 fsQuad，
 * 新版 three 已将其改为私有 _fsQuad，导致卸载时 fsQuad 为 undefined 而崩溃。
 * 先对齐字段再释放；若仍有内部异常则忽略（renderer.dispose() 已先行释放 GPU 资源）。
 */
function disposeViewerSafely(viewer: skinview3d.SkinViewer) {
  try {
    const fxaa = viewer.fxaaPass as unknown as {
      fsQuad?: { dispose: () => void }
      _fsQuad?: { dispose: () => void }
    }
    if (fxaa && !fxaa.fsQuad && fxaa._fsQuad) fxaa.fsQuad = fxaa._fsQuad
    viewer.dispose()
  } catch {
    /* 忽略 skinview3d 内部清理异常 */
  }
}

/**
 * 3D 皮肤预览（skinview3d，Blessing Skin Server 同款引擎）。
 * - IntersectionObserver 懒挂载 WebGL
 * - 始终先渲染默认 Steve；远程皮肤加载失败时回退 Steve，避免角色隐形
 * - 浏览器无 WebGL 时降级为静态图片
 */
export default function SkinPreview3D({
  skinUrl,
  capeUrl,
  slim,
  width = 176,
  height = 216,
  className = '',
  baseSkinUrl,
}: SkinPreview3DProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null)
  const [visible, setVisible] = useState(false)
  const [webgl, setWebgl] = useState(true)
  // 基础皮肤：优先用当前用户第一个档案的皮肤作为角色底子，否则回退默认 Steve
  const base = baseSkinUrl || stevePng
  const fallback = skinUrl || base

  useEffect(() => {
    setWebgl(webglSupported())
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 创建渲染器
  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible || !webgl || !canvas) return

    let disposed = false

    // 先以默认 Steve 起步，保证任何情况下都有可见角色
    const viewer = new skinview3d.SkinViewer({
      canvas,
      width,
      height,
      model: slim ? 'slim' : 'default',
      skin: base,
      cape: capeUrl || undefined,
    })
    viewerRef.current = viewer
    viewer.autoRotate = true
    viewer.autoRotateSpeed = 0.6
    try {
      viewer.animation = new skinview3d.IdleAnimation()
    } catch {
      /* 某些版本无 IdleAnimation */
    }
    const controls = viewer.controls
    controls.enableZoom = false
    controls.enablePan = false
    controls.enableRotate = true

    if (skinUrl) {
      viewer.loadSkin(skinUrl, { model: slim ? 'slim' : 'default' }).catch(() => {
        // 远程皮肤加载失败 → 回退基础皮肤（组件已卸载时不再操作）
        if (disposed) return
        try {
          viewer.loadSkin(base, { model: slim ? 'slim' : 'default' })
        } catch {
          /* ignore */
        }
      })
    }

    return () => {
      disposed = true
      disposeViewerSafely(viewer)
      viewerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, webgl, width, height])

  // 皮肤变化（请求序号防止快速切换时旧响应覆盖新皮肤）
  const skinReqRef = useRef(0)
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !skinUrl) return
    const req = ++skinReqRef.current
    viewer.loadSkin(skinUrl, { model: slim ? 'slim' : 'default' }).catch(() => {
      if (req !== skinReqRef.current || !viewerRef.current) return
      try {
        viewer.loadSkin(baseSkinUrl || stevePng, { model: slim ? 'slim' : 'default' })
      } catch {
        /* ignore */
      }
    })
  }, [skinUrl, slim, baseSkinUrl])

  // 披风变化
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    Promise.resolve(viewer.loadCape(capeUrl || null)).catch(() => {})
  }, [capeUrl])

  if (!webgl) {
    return (
      <img
        src={fallback}
        alt={t('preview.alt')}
        className={`skin-preview ${className}`.trim()}
        style={{ width, height, objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={`skin-preview ${className}`.trim()}
      style={{ width, height, display: 'block' }}
      aria-label={t('preview.ariaLabel')}
    />
  )
}
