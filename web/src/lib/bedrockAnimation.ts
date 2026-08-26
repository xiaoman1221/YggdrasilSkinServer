/**
 * 基岩版动画（*.animation.json）→ three.js AnimationClip 转换器。
 *
 * 支持内容：
 *   - bones.rotation / bones.position / bones.scale 的数值关键帧
 *     （含 "0.0"/"0.5" 时间轴对象与直接数组两种形态）
 *   - loop: true → 循环播放；否则单次播放并保持在末帧
 *   - Molang 表达式关键帧无法在纯前端求值，按 0 处理并跳过
 *
 * 坐标/旋转约定与 buildModel 的绑定姿态一致（对齐 geckolib / YSMViewer）：
 *   - 旋转为增量，叠加到骨绑定旋转后转为四元数（欧拉角 + 'ZYX' 序）
 *   - 位移为增量（像素），叠加到骨绑定位置，X 取反
 *   - scale 为绝对值
 */
import * as THREE from 'three'
import type { YsmBoneBind } from './bedrock'

export interface BedrockAnimationFile {
  format_version?: string
  animations?: Record<
    string,
    {
      loop?: boolean | 'hold_on_last_frame'
      animation_length?: number
      bones?: Record<
        string,
        {
          rotation?: unknown
          position?: unknown
          scale?: unknown
        }
      >
    }
  >
}

/** 关键帧通道：时间 → 值 */
type Keyframes = { time: number; value: [number, number, number] }[]

function asVec3(v: unknown): [number, number, number] | null {
  if (Array.isArray(v) && v.length >= 1) {
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]
  }
  return null
}

/** 标量统一广播为 [v, v, v]（scale 通道常见单值写法）。 */
function asVec3Broadcast(v: unknown): [number, number, number] | null {
  if (typeof v === 'number' && Number.isFinite(v)) return [v, v, v]
  return asVec3(v)
}

/**
 * 解析单个通道（rotation/position）。
 * 两种形态：
 *   1. 直接数组 [x,y,z] —— 恒定值
 *   2. 关键帧对象 { "0.0": [x,y,z], "0.5": ... }（值可能是 Molang 字符串，跳过）
 */
function parseChannel(channel: unknown, scale = 1): Keyframes | null {
  if (channel == null) return null

  // 恒定值
  const constant = asVec3Broadcast(channel)
  if (constant) {
    return [{ time: 0, value: [constant[0] * scale, constant[1] * scale, constant[2] * scale] }]
  }

  if (typeof channel !== 'object') return null
  const frames: Keyframes = []
  for (const [timeKey, raw] of Object.entries(channel as Record<string, unknown>)) {
    const time = Number(timeKey)
    if (!Number.isFinite(time)) continue
    // 关键帧值可能是 { post: ..., pre: ... } 包装，取 post 优先
    let value: unknown = raw
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const wrapped = raw as { post?: unknown; pre?: unknown }
      value = wrapped.post ?? wrapped.pre
    }
    const vec = asVec3Broadcast(value)
    if (!vec) continue // Molang 表达式等无法静态求值的帧
    frames.push({ time, value: [vec[0] * scale, vec[1] * scale, vec[2] * scale] })
  }
  if (frames.length === 0) return null
  frames.sort((a, b) => a.time - b.time)
  return frames
}

/** 生成均匀时间轴（three.js 关键帧要求时间递增数组） */
function timesOf(frames: Keyframes): number[] {
  return frames.map((f) => f.time)
}

function flatten(frames: Keyframes): number[] {
  const out: number[] = []
  for (const f of frames) out.push(f.value[0], f.value[1], f.value[2])
  return out
}

/**
 * 将基岩动画文件集合转换为 AnimationClip 列表。
 * 关键帧直接输出"绑定姿态 + 动画增量"的绝对局部变换，
 * 使 AnimationMixer 写入后骨骼保持正确绑定（不会从绑定姿态跳开）。
 * @param files 路径 → 已解码的动画 JSON
 * @param bindMap 主模型骨骼绑定表（来自 buildBoneBindMap）；提供时跳过模型中不存在的骨骼
 */
export function buildAnimationClips(
  files: { path: string; json: BedrockAnimationFile }[],
  bindMap?: Map<string, YsmBoneBind>,
): THREE.AnimationClip[] {
  const clips: THREE.AnimationClip[] = []
  for (const file of files) {
    const animations = file.json?.animations
    if (!animations) continue
    for (const [name, anim] of Object.entries(animations)) {
      if (!anim?.bones) continue
      const tracks: THREE.KeyframeTrack[] = []
      let maxTime = 0

      for (const [boneName, channels] of Object.entries(anim.bones)) {
        if (!channels) continue
        const bind = bindMap?.get(boneName)
        // 参考实现：动画只作用于模型中存在的骨骼
        if (bindMap && !bind) continue

        const rotation = parseChannel(channels.rotation)
        if (rotation && rotation.length > 0) {
          // 旋转（增量，度）：总角 = 绑定旋转(X/Y 取反) + 动画增量(-ax, -ay, az)
          const times = timesOf(rotation)
          const quats: number[] = []
          const euler = new THREE.Euler()
          for (const f of rotation) {
            const tx = bind ? bind.rotation[0] - f.value[0] : -f.value[0]
            const ty = bind ? bind.rotation[1] - f.value[1] : -f.value[1]
            const tz = bind ? bind.rotation[2] + f.value[2] : f.value[2]
            euler.set(
              THREE.MathUtils.degToRad(tx),
              THREE.MathUtils.degToRad(ty),
              THREE.MathUtils.degToRad(tz),
              'ZYX',
            )
            const q = new THREE.Quaternion().setFromEuler(euler)
            quats.push(q.x, q.y, q.z, q.w)
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, quats))
          maxTime = Math.max(maxTime, ...times)
        }

        const position = parseChannel(channels.position)
        if (position && position.length > 0) {
          // 位移（增量，像素）：绑定位置 + (-x, +y, +z)；单位与 buildModel 一致（不除 16）
          const bx = bind ? bind.position[0] : 0
          const by = bind ? bind.position[1] : 0
          const bz = bind ? bind.position[2] : 0
          const values: number[] = []
          for (const f of position) {
            values.push(bx - f.value[0], by + f.value[1], bz + f.value[2])
          }
          tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, timesOf(position), values))
          maxTime = Math.max(maxTime, ...position.map((f) => f.time))
        }

        const scale = parseChannel(channels.scale)
        if (scale && scale.length > 0) {
          // scale 为绝对值（绑定比例为 1）
          tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.scale`, timesOf(scale), flatten(scale)))
          maxTime = Math.max(maxTime, ...scale.map((f) => f.time))
        }
      }

      if (tracks.length === 0) continue
      const duration = anim.animation_length || maxTime || 0.1
      const clip = new THREE.AnimationClip(name, duration, tracks)
      // loop 元数据挂到 clip 上，播放侧读取
      ;(clip as THREE.AnimationClip & { userMetadata?: object }).userMetadata = {
        loop: anim.loop === true,
        holdOnLastFrame: anim.loop === 'hold_on_last_frame',
        source: file.path,
      }
      clips.push(clip)
    }
  }
  return clips
}

/** 从解码出的文件列表中找出动画 JSON 并构建 clips。 */
export function buildClipsFromFiles(
  files: { path: string; data: Uint8Array }[],
  bindMap?: Map<string, YsmBoneBind>,
): THREE.AnimationClip[] {
  const decoder = new TextDecoder()
  const animFiles = files
    .filter((f) => /animations\/.*\.json$/i.test(f.path))
    .map((f) => {
      try {
        return { path: f.path, json: JSON.parse(decoder.decode(f.data)) as BedrockAnimationFile }
      } catch {
        return null
      }
    })
    .filter(Boolean) as { path: string; json: BedrockAnimationFile }[]
  return buildAnimationClips(animFiles, bindMap)
}
