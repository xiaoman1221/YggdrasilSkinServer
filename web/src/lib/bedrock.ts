/**
 * 基岩版（Bedrock）模型几何解析与 three.js 场景构建。
 * 面序 / UV / 骨骼约定对齐 YSMViewer 参考实现：
 *   https://github.com/DrAbcOfficial/YSMViewer （GeometryBuilder.cs）
 */
import * as THREE from 'three'

export interface BedrockCube {
  origin: [number, number, number]
  size: [number, number, number]
  /** 旧版 box UV：[u, v]；或基岩 1.12+ per-face UV 对象：{ north: {uv, uv_size}, ... } */
  uv?: [number, number] | Record<string, { uv: number[]; uv_size?: number[] }>
  inflate?: number
  pivot?: [number, number, number]
  rotation?: [number, number, number]
  /** 部分导出格式把 per-face UV 放在 faces 字段 */
  faces?: Record<string, { uv: number[]; uv_size?: number[] }>
}

export interface BedrockBone {
  name: string
  parent?: string
  pivot?: [number, number, number]
  rotation?: [number, number, number]
  cubes?: BedrockCube[]
}

export interface BedrockGeometry {
  description: {
    texture_width?: number
    texture_height?: number
  }
  bones: BedrockBone[]
}

export interface GeometryEntry {
  path: string
  geometry: BedrockGeometry
}

interface GeometryJson {
  'minecraft:geometry'?: BedrockGeometry[]
}

/** 从一组文件中提取全部几何定义（带来源路径）。 */
export function extractGeometries(files: { path: string; text: string }[]): GeometryEntry[] {
  const out: GeometryEntry[] = []
  for (const f of files) {
    if (!f.path.toLowerCase().endsWith('.json')) continue
    let json: unknown
    try {
      json = JSON.parse(f.text)
    } catch {
      continue
    }
    const g = json as GeometryJson
    const list = g && Array.isArray(g['minecraft:geometry']) ? g['minecraft:geometry'] : null
    if (!list) continue
    for (const geom of list) {
      if (geom && Array.isArray(geom.bones) && geom.bones.length > 0) {
        out.push({ path: f.path, geometry: geom })
      }
    }
  }
  return out
}

/** 选择主模型几何：优先 models/main.json。 */
export function pickMainGeometry(entries: GeometryEntry[]): GeometryEntry | null {
  if (entries.length === 0) return null
  return (
    entries.find((e) => /main\.json$/i.test(e.path)) ??
    entries.find((e) => /body|player|model/i.test(e.path)) ??
    entries[0]
  )
}

function asVec3(v: unknown): [number, number, number] {
  if (Array.isArray(v)) {
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]
  }
  return [0, 0, 0]
}

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 应用 YSM/geckolib 的旋转约定：X/Y 取反 + ZYX 序（等价参考实现 CreateBlockbenchQuaternion）。 */
function applyYsmRotation(target: THREE.Object3D, rotation: unknown) {
  if (!Array.isArray(rotation) || rotation.length < 3) return
  const [rx, ry, rz] = asVec3(rotation)
  target.rotation.set(
    -THREE.MathUtils.degToRad(rx),
    -THREE.MathUtils.degToRad(ry),
    THREE.MathUtils.degToRad(rz),
    'ZYX',
  )
}

export interface YsmBoneBind {
  /** 骨局部位置（相对父骨 pivot，X 已镜像），单位与模型一致（像素）。 */
  position: [number, number, number]
  /** 骨绑定旋转（度，X/Y 已镜像），供动画叠加与绑定姿态使用。 */
  rotation: [number, number, number]
}

/**
 * 计算骨骼绑定姿态表（X 镜像 + 相对父骨偏移），
 * 与 buildModel 的骨骼布局一致，动画转换时用于把绑定姿态嵌入关键帧。
 */
export function buildBoneBindMap(geom: BedrockGeometry): Map<string, YsmBoneBind> {
  const pivots = new Map<string, [number, number, number]>()
  for (const bone of geom.bones) pivots.set(bone.name, asVec3(bone.pivot))

  const map = new Map<string, YsmBoneBind>()
  for (const bone of geom.bones) {
    const p = pivots.get(bone.name)!
    const parentName = typeof bone.parent === 'string' ? bone.parent : ''
    const pp = parentName ? pivots.get(parentName) : null
    // 镜像后的 pivot：(-x, y, z)；子骨位置 = 子 pivot - 父 pivot（局部）
    const position: [number, number, number] = pp
      ? [pp[0] - p[0], p[1] - pp[1], p[2] - pp[2]]
      : [-p[0], p[1], p[2]]
    const rot = asVec3(bone.rotation)
    map.set(bone.name, {
      position,
      rotation: [-rot[0], -rot[1], rot[2]],
    })
  }
  return map
}

/**
 * 计算某个面的归一化 UV 四角。
 * 返回 [uLeft, vTopPixel, uRight, vBottomPixel]，均为像素空间带符号值，
 * 负 uv_size 表示镜像采样，保留符号交给顶点赋值处理。
 */
function faceRect(
  cube: BedrockCube,
  size: [number, number, number],
  face: string,
  texW: number,
  texH: number,
): [number, number, number, number] | null {
  const [sx, sy, sz] = size
  const ax = Math.abs(sx)
  const ay = Math.abs(sy)
  const az = Math.abs(sz)

  let u: number
  let v: number
  let du: number
  let dv: number

  // per-face UV 可能存放在 faces 字段，或直接作为 uv 字段的对象形态（基岩 1.12+ 标准）
  const faceMap =
    cube.faces ??
    (cube.uv && typeof cube.uv === 'object' && !Array.isArray(cube.uv)
      ? (cube.uv as Record<string, { uv: number[]; uv_size?: number[] }>)
      : undefined)
  const perFace = faceMap?.[face]
  if (perFace && Array.isArray(perFace.uv)) {
    const uv = perFace.uv.map(asNum)
    const us = Array.isArray(perFace.uv_size) ? perFace.uv_size.map(asNum) : null
    if (us) {
      // bedrock per-face：原点 + 带符号尺寸
      u = uv[0]
      v = uv[1]
      du = us[0]
      dv = us[1]
    } else if (uv.length >= 4) {
      // Blockbench 风格四角坐标
      u = Math.min(uv[0], uv[2])
      v = Math.min(uv[1], uv[3])
      du = Math.abs(uv[2] - uv[0])
      dv = Math.abs(uv[3] - uv[1])
    } else {
      u = uv[0]
      v = uv[1]
      du = face === 'up' || face === 'down' ? sz : sx
      dv = face === 'up' || face === 'down' ? sz : sy
    }
  } else if (Array.isArray(cube.uv)) {
    // 旧版 box UV 展开（含 up 垂直翻转、down 水平翻转，对齐 YSMViewer Expand()）
    const bu = asNum(cube.uv[0])
    const bv = asNum(cube.uv[1])
    switch (face) {
      case 'east':
        ;[u, v, du, dv] = [bu, bv + az, sz, sy]
        break
      case 'north':
        ;[u, v, du, dv] = [bu + az, bv + az, sx, sy]
        break
      case 'west':
        ;[u, v, du, dv] = [bu + az + ax, bv + az, sz, sy]
        break
      case 'south':
        ;[u, v, du, dv] = [bu + az + az + ax, bv + az, sx, sy]
        break
      case 'up':
        ;[u, v, du, dv] = [bu + az + ax, bv + az, -sx, -sz]
        break
      case 'down':
      default:
        ;[u, v, du, dv] = [bu + az + ax + ax, bv, -sx, sz]
        break
    }
  } else {
    return null
  }

  return [u / texW, v / texH, (u + du) / texW, (v + dv) / texH]
}

// three.js BoxGeometry 面参数化顺序：px nx py ny pz nz → east west up down south north
const BOX_FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north']

function applyFaceUVs(
  geo: THREE.BoxGeometry,
  cube: BedrockCube,
  size: [number, number, number],
  texW: number,
  texH: number,
) {
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute
  for (let f = 0; f < 6; f++) {
    const rect = faceRect(cube, size, BOX_FACE_ORDER[f], texW, texH)
    if (!rect) continue
    const [ua, va, ub, vb] = rect
    // 像素空间 v 向下，three.js UV v 向上；带符号值直接赋给四角实现镜像
    const corners: Array<[number, number]> = [
      [ua, 1 - va],
      [ub, 1 - va],
      [ua, 1 - vb],
      [ub, 1 - vb],
    ]
    corners.forEach(([cu, cv], i) => uvAttr.setXY(f * 4 + i, cu, cv))
  }
  uvAttr.needsUpdate = true
}

/** 将单个几何构建为 three.js Group（静态绑定姿态）。 */
export function buildModel(entry: GeometryEntry, texture: THREE.Texture): THREE.Group {
  const geom = entry.geometry
  const root = new THREE.Group()
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace

  const img = texture.image as { width?: number; height?: number } | undefined
  const texW = geom.description?.texture_width || Math.max(img?.width || 64, 1)
  const texH = geom.description?.texture_height || Math.max(img?.height || 64, 1)

  const groups = new Map<string, THREE.Group>()
  const pivots = new Map<string, [number, number, number]>()
  const getGroup = (bone: BedrockBone): THREE.Group => {
    let g = groups.get(bone.name)
    if (!g) {
      g = new THREE.Group()
      // 命名骨骼，供 AnimationMixer 按 PropertyBinding 查找
      g.name = bone.name
      groups.set(bone.name, g)
      pivots.set(bone.name, asVec3(bone.pivot))
    }
    return g
  }

  // 骨骼绑定姿态表：位置/旋转已做 X 镜像（对齐 geckolib 与 YSMViewer 参考实现）
  const binds = buildBoneBindMap(geom)
  const material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide })

  for (const bone of geom.bones) {
    if (!bone || typeof bone.name !== 'string') continue
    const g = getGroup(bone)
    const pivot = pivots.get(bone.name)!
    const bind = binds.get(bone.name)!
    g.position.set(bind.position[0], bind.position[1], bind.position[2])
    g.rotation.set(
      THREE.MathUtils.degToRad(bind.rotation[0]),
      THREE.MathUtils.degToRad(bind.rotation[1]),
      THREE.MathUtils.degToRad(bind.rotation[2]),
      'ZYX',
    )
    // 绑定姿态快照：动画转换/回退绑定姿态时使用
    g.userData.initialPosition = bind.position
    g.userData.initialRotation = bind.rotation

    for (const cube of Array.isArray(bone.cubes) ? bone.cubes : []) {
      if (!cube || !Array.isArray(cube.origin) || !Array.isArray(cube.size)) continue
      const size = asVec3(cube.size)
      const origin = asVec3(cube.origin)
      const inflate = asNum(cube.inflate)
      const w = Math.abs(size[0]) + inflate * 2
      const h = Math.abs(size[1]) + inflate * 2
      const dd = Math.abs(size[2]) + inflate * 2
      // 立方体 pivot（旋转中心）：参考实现默认 (0,0,0)
      const cp: [number, number, number] = cube.pivot ? asVec3(cube.pivot) : [0, 0, 0]

      const geo = new THREE.BoxGeometry(w, h, dd)
      // 镜像后的盒体中心相对立方体 pivot 的偏移（origin 为最小角，X 取反）
      geo.translate(
        -origin[0] - size[0] / 2 + cp[0],
        origin[1] + size[1] / 2 - cp[1],
        origin[2] + size[2] / 2 - cp[2],
      )
      applyFaceUVs(geo, cube, size, texW, texH)

      const mesh = new THREE.Mesh(geo, material)
      // mesh 锚定在立方体 pivot（相对骨 pivot，X 镜像），旋转绕 pivot 进行
      mesh.position.set(
        pivot[0] - cp[0],
        cp[1] - pivot[1],
        cp[2] - pivot[2],
      )
      applyYsmRotation(mesh, cube.rotation)
      g.add(mesh)
    }
  }

  // 挂接父子关系：绑定姿态已含相对父骨的偏移，此处仅重建层级
  for (const bone of geom.bones) {
    const g = groups.get(bone.name)
    if (!g) continue
    const parentName = typeof bone.parent === 'string' ? bone.parent : ''
    const parent = parentName && groups.has(parentName) ? groups.get(parentName)! : null
    if (parent) {
      parent.add(g)
    } else {
      root.add(g)
    }
  }

  // 包围盒居中，底部落地
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  const wrapper = new THREE.Group()
  wrapper.add(root)
  root.position.set(-center.x, -box.min.y, -center.z)
  return wrapper
}
