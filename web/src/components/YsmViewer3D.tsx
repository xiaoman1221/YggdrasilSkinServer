/**
 * YsmModelViewer —— 公开模型分享网站的 3D 预览组件（React Three Fiber）。
 *
 * 特性：
 *  - 右下角控制面板：动画下拉、切换贴图、一键截图、全屏切换
 *  - 中央加载指示器（three.js LoadingManager 汇报纹理加载进度）
 *  - OrbitControls 限制垂直旋转角，防止翻到地面以下
 *  - shadowMap + ShadowMaterial 地面柔和阴影；环境光 + 主光/补光双方向光
 *  - 关闭抗锯齿 + NearestFilter，保持 Minecraft 像素颗粒感
 *  - AnimationMixer + crossFadeTo 实现动画淡入淡出切换
 *  - 包围盒自动居中与视距自适应（任意大小的模型都能正确取景）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import { buildModel, type GeometryEntry } from '../lib/bedrock'

/* ================= 数据接口 ================= */

export interface YsmTextureOption {
  name: string
  url: string
}

/** 传入查看器的模型数据（由 WASM 解密管线解码后的结构化 JSON） */
export interface YsmModelData {
  /** 主模型几何（含全部骨骼层级） */
  geometry: GeometryEntry
  /** 可用动画列表（基岩动画转换的 AnimationClip） */
  clips: THREE.AnimationClip[]
  /** 可切换的贴图（blob URL） */
  textures: YsmTextureOption[]
}

export interface YsmModelViewerProps {
  /** 解码后的模型数据；null 时显示加载态 */
  modelData: YsmModelData | null
  /** 当前动画名；'' 表示静态绑定姿态 */
  currentAnimation: string
  /** 动画切换回调（受控下拉框） */
  onAnimationChange?: (name: string) => void
  /** 高度（px） */
  height?: number
}

/** 构建模型组：用真实 1×1 DataTexture 占位（假对象会导致渲染期 uniforms 崩溃），贴图随后异步替换 */
function buildGroup(entry: GeometryEntry): THREE.Group {
  const placeholder = new THREE.DataTexture(new Uint8Array([205, 205, 205, 255]), 1, 1)
  placeholder.needsUpdate = true
  return buildModel(entry, placeholder)
}

/* ================= 场景内部组件 ================= */

/** 包围盒自动居中 + 相机视距自适应 */
function CameraFit({ box }: { box: THREE.Box3 }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null

  useEffect(() => {
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    // 视距 = 包围球半径 / tan(fov/2)，再留 35% 余量
    const dist = (maxDim / 2 / Math.tan(((40 / 2) * Math.PI) / 180)) * 1.35
    const dir = new THREE.Vector3(1, 0.45, 1.5).normalize()
    camera.position.copy(center).addScaledVector(dir, dist)
    camera.lookAt(center)
    if (controls) {
      controls.target.copy(center)
      controls.update()
    }
  }, [box, camera, controls])
  return null
}

/** 贴图应用：NearestFilter 像素风过滤 + 开启阴影投射；失败自动重试，避免静默卡死 */
function ModelTexture({ group, textureUrl }: { group: THREE.Object3D; textureUrl?: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [textureUrl])

  useEffect(() => {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.castShadow = true
    })
  }, [group])

  useEffect(() => {
    if (!textureUrl || failed) return
    let cancelled = false
    let retryTimer = 0
    const attempt = (left: number) => {
      new THREE.TextureLoader().load(
        textureUrl,
        (tex) => {
          if (cancelled) {
            tex.dispose()
            return
          }
          tex.magFilter = THREE.NearestFilter // 像素风：禁用平滑过滤
          tex.minFilter = THREE.NearestFilter
          tex.colorSpace = THREE.SRGBColorSpace
          // 注意：保持默认 flipY=true——bedrock.ts 的 UV 公式（1 - v）基于该约定推导，
          // 改成 false 会导致所有贴图垂直镜像
          group.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh) {
              const mat = mesh.material as THREE.MeshLambertMaterial
              if (mat.map && mat.map !== tex) mat.map.dispose()
              mat.map = tex
              mat.needsUpdate = true
            }
          })
        },
        undefined,
        () => {
          // 加载失败：最多重试 3 次（blob URL 偶发回收/解码抖动）
          if (cancelled) return
          if (left > 0) retryTimer = window.setTimeout(() => attempt(left - 1), 400)
          else setFailed(true)
        },
      )
    }
    attempt(3)
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
    }
  }, [textureUrl, group, failed])

  return null
}

/** 动画驱动：AnimationMixer + crossFadeTo 淡入淡出切换 */
function AnimationController({
  root,
  clips,
  current,
}: {
  root: THREE.Object3D
  clips: THREE.AnimationClip[]
  current: string
}) {
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root])
  const currentAction = useRef<THREE.AnimationAction | null>(null)

  useFrame((_, delta) => mixer.update(delta))
  useEffect(() => {
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer])

  useEffect(() => {
    const clip = clips.find((c) => c.name === current)
    const nextAction = clip ? mixer.clipAction(clip) : null
    const prevAction = currentAction.current
    if (nextAction === prevAction) return

    if (nextAction) {
      const meta = (clip as THREE.AnimationClip & { userMetadata?: { loop?: boolean } }).userMetadata
      nextAction.reset()
      if (meta?.loop === false) {
        nextAction.loop = THREE.LoopOnce
        nextAction.clampWhenFinished = true
      }
      nextAction.fadeIn(prevAction ? 0.25 : 0) // 0.25s 淡入
      nextAction.play()
    }
    if (prevAction) prevAction.fadeOut(0.25) // 0.25s 淡出
    currentAction.current = nextAction
  }, [current, clips, mixer])

  return null
}

/** 截图桥：把 WebGL 上下文的截图能力暴露给外部 UI */
function ScreenshotBridge({ register }: { register: (fn: () => string) => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    register(() => {
      gl.render(scene, camera) // 先渲染一帧，确保缓冲最新
      return gl.domElement.toDataURL('image/png')
    })
  }, [gl, scene, camera, register])
  return null
}

/* ================= 主组件 ================= */

export default function YsmModelViewer({
  modelData,
  currentAnimation,
  onAnimationChange,
  height = 460,
}: YsmModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const screenshotRef = useRef<(() => string) | null>(null)
  const [textureIndex, setTextureIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  const textures = modelData?.textures ?? []
  const currentTexture = textures[textureIndex % Math.max(1, textures.length)]

  // 模型组：整个查看器共享同一实例（渲染 + AnimationMixer 绑定）
  const modelGroup = useMemo(() => (modelData ? buildGroup(modelData.geometry) : null), [modelData])
  useEffect(
    () => () => {
      modelGroup?.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
    },
    [modelGroup],
  )

  // 模型包围盒（自动取景 / 地面定位用）
  const bodyBox = useMemo(() => {
    if (!modelGroup) return null
    return new THREE.Box3().setFromObject(modelGroup)
  }, [modelGroup])

  // 贴图切换时重置索引
  useEffect(() => setTextureIndex(0), [modelData])

  const registerScreenshot = useCallback((fn: () => string) => {
    screenshotRef.current = fn
  }, [])

  function handleScreenshot() {
    const data = screenshotRef.current?.()
    if (!data) return
    const a = document.createElement('a')
    a.href = data
    a.download = `ysm-preview-${Date.now()}.png`
    a.click()
  }

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
      setFullscreen(false)
    } else {
      el.requestFullscreen()
      setFullscreen(true)
    }
  }

  const { active: textureLoading, progress } = useProgress()
  const boxSize = bodyBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1)
  const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z) || 1

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--bg-muted, #f3f3f3)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {modelData && modelGroup && bodyBox ? (
        <Canvas
          shadows="basic" // three 0.185 移除了 PCFSoftShadowMap，用基础 PCF 避免逐帧告警
          dpr={[1, 2]}
          gl={{ antialias: false, preserveDrawingBuffer: true }} // 像素风关闭抗锯齿；保留缓冲供截图
          camera={{ fov: 40, near: 0.01, far: maxDim * 20 + 100 }}
        >
          <color attach="background" args={['#eef0f3']} />
          {/* 环境光 + 主光/补光双方向光，模拟游戏内光照 */}
          <ambientLight intensity={2.2} />
          <directionalLight
            castShadow
            intensity={1.7}
            position={[maxDim, maxDim * 2.2, maxDim * 1.5]}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.1}
            shadow-camera-far={maxDim * 6 + 10}
            shadow-camera-left={-maxDim * 1.5}
            shadow-camera-right={maxDim * 1.5}
            shadow-camera-top={maxDim * 1.5}
            shadow-camera-bottom={-maxDim * 1.5}
            shadow-bias={-0.0004}
          />
          <directionalLight intensity={0.7} position={[-maxDim * 1.6, -maxDim * 0.8, -maxDim * 1.2]} />

          <primitive object={modelGroup} />
          <ModelTexture group={modelGroup} textureUrl={currentTexture?.url} />
          <AnimationController root={modelGroup} clips={modelData.clips} current={currentAnimation} />

          {/* 地面：仅接收阴影（ShadowMaterial 半透明），位于模型底部 */}
          <mesh position={[0, bodyBox.min.y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[Math.max(boxSize.x, boxSize.z) * 3 + 4, Math.max(boxSize.x, boxSize.z) * 3 + 4]} />
            <shadowMaterial opacity={0.25} />
          </mesh>

          <CameraFit box={bodyBox} />
          {/* 限制垂直旋转角：不允许翻到地面以下 */}
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minPolarAngle={0.05}
            maxPolarAngle={Math.PI / 2 - 0.03}
          />
          <ScreenshotBridge register={registerScreenshot} />
        </Canvas>
      ) : null}

      {/* 中央加载指示器（解码进度 + LoadingManager 纹理进度） */}
      {(!modelData || textureLoading) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,255,255,0.65)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 28,
                height: 28,
                margin: '0 auto 10px',
                border: '3px solid var(--line, #ddd)',
                borderTopColor: 'var(--accent, #4a7dff)',
                borderRadius: '50%',
                animation: 'ysm-spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {modelData ? `加载贴图 ${Math.round(progress)}%` : '正在解密模型…'}
            </span>
          </div>
        </div>
      )}

      {/* 右下角控制面板 */}
      {modelData ? (
        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid var(--line, #ddd)',
            borderRadius: 8,
            padding: '8px 10px',
            flexWrap: 'wrap',
            maxWidth: 'calc(100% - 20px)',
          }}
        >
          <select
            className="input"
            style={{ width: 170, fontSize: 12 }}
            value={currentAnimation}
            onChange={(e) => onAnimationChange?.(e.target.value)}
          >
            <option value="">绑定姿态</option>
            {modelData.clips.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {textures.length > 1 ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setTextureIndex((i) => (i + 1) % textures.length)}
              title={currentTexture?.name}
            >
              切换贴图 ({(textureIndex % textures.length) + 1}/{textures.length})
            </button>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={handleScreenshot}>
            截图
          </button>
          <button className="btn btn-ghost btn-sm" onClick={toggleFullscreen}>
            {fullscreen ? '退出全屏' : '全屏'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
