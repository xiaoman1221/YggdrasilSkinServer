import { useEffect, useRef, useState } from 'react'
import * as skinview3d from 'skinview3d'
import stevePng from '../assets/steve.png'

interface SkinPreview3DProps {
  skinUrl?: string | null
  capeUrl?: string | null
  slim?: boolean
  width?: number
  height?: number
  className?: string
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
}: SkinPreview3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null)
  const [visible, setVisible] = useState(false)
  const [webgl, setWebgl] = useState(true)
  const fallback = skinUrl || stevePng

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
      skin: stevePng,
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
        // 远程皮肤加载失败 → 回退默认 Steve（组件已卸载时不再操作）
        if (disposed) return
        try {
          viewer.loadSkin(stevePng, { model: slim ? 'slim' : 'default' })
        } catch {
          /* ignore */
        }
      })
    }

    return () => {
      disposed = true
      viewer.dispose()
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
        viewer.loadSkin(stevePng, { model: slim ? 'slim' : 'default' })
      } catch {
        /* ignore */
      }
    })
  }, [skinUrl, slim])

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
        alt="皮肤预览"
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
      aria-label="3D 皮肤预览"
    />
  )
}
