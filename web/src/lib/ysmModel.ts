/**
 * 从模型 URL 加载 YSM 模型（加密 .ysm / 开放 .zip），
 * 解出内部文件列表，供几何解析与贴图提取使用。
 */
import JSZip from 'jszip'
import { decodeYsm, type DecodedFile } from './ysmparser'

export type { DecodedFile }

function isPng(data: Uint8Array): boolean {
  return data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
}

/**
 * 【Wasm 解析接口】解密模型二进制流，返回内部文件列表。
 *
 * 安全边界：模型数据不以明文 JSON 暴露在 Network 中——前端请求二进制流，
 * 加密模型经 YSMParser WASM 在本地解密，zip 模型本地解包，之后才喂给 three.js。
 */
export async function decodeYsmModelFile(buffer: ArrayBuffer, format: 'ysm' | 'zip'): Promise<DecodedFile[]> {
  const bytes = new Uint8Array(buffer)
  if (format === 'zip') {
    const zip = await JSZip.loadAsync(bytes)
    const entries = Object.values(zip.files).filter((e) => !e.dir && !e.name.includes('__MACOSX'))
    const files: DecodedFile[] = []
    for (const entry of entries) {
      files.push({ path: entry.name, data: new Uint8Array(await entry.async('uint8array')) })
    }
    if (files.length === 0) throw new Error('压缩包为空')
    return files
  }
  return decodeYsm(bytes)
}

/** 带下载进度的模型二进制流获取。 */
export async function fetchModelBuffer(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`下载模型失败（HTTP ${resp.status}）`)
  const total = Number(resp.headers.get('content-length')) || 0
  if (!resp.body || !total) return resp.arrayBuffer()
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out.buffer
}

export interface YsmTextureOption {
  name: string
  url: string
}

/**
 * 构建全部可切换贴图（blob URL）：
 * 1. ysm.json 的 files.player.texture[].uv 指定的贴图
 * 2. 回退 textures/ 目录下的 PNG
 */
export function buildTextureOptions(files: DecodedFile[]): YsmTextureOption[] {
  const options: YsmTextureOption[] = []
  const seen = new Set<string>()
  const add = (f: DecodedFile | undefined) => {
    if (!f || !isPng(f.data) || seen.has(f.path)) return
    seen.add(f.path)
    options.push({
      name: f.path.split('/').pop() || f.path,
      url: URL.createObjectURL(new Blob([f.data.slice().buffer as ArrayBuffer], { type: 'image/png' })),
    })
  }

  const ysmJson = files.find((f) => f.path.toLowerCase().endsWith('ysm.json'))
  if (ysmJson) {
    try {
      const doc = JSON.parse(new TextDecoder().decode(ysmJson.data))
      const list = doc?.files?.player?.texture
      if (Array.isArray(list)) {
        for (const entry of list) {
          const wanted = String(entry?.uv || '').toLowerCase()
          add(files.find((f) => f.path.toLowerCase().endsWith(wanted)))
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (options.length === 0) {
    for (const f of files.filter((x) => isPng(x.data) && x.path.toLowerCase().includes('textures/'))) add(f)
  }
  if (options.length === 0) {
    for (const f of files.filter((x) => isPng(x.data))) add(f)
  }
  return options
}

export async function loadYsmFiles(url: string, format: string): Promise<DecodedFile[]> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`下载模型失败（HTTP ${resp.status}）`)
  return decodeYsmModelFile(await resp.arrayBuffer(), format as 'ysm' | 'zip')
}
