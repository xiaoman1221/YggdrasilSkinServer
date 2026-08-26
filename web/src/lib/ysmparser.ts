/**
 * YSMParser WASM 封装：在浏览器中解密 .ysm 模型。
 * 产物来自 https://github.com/OpenYSM/YSMParser （MIT License），
 * 静态文件位于 /ysmparser/YSMParser.js + YSMParser.wasm。
 *
 * 注意：程序执行 exit() 后 Emscripten 运行时即失效，因此
 * 每次解码都必须使用全新的模块实例，不能复用。
 */

export interface DecodedFile {
  path: string
  data: Uint8Array
}

interface ParserFS {
  writeFile(path: string, data: Uint8Array): void
  readFile(path: string): Uint8Array
  readdir(path: string): string[]
  stat(path: string): { mode: number }
  isDir(mode: number): boolean
  mkdir(path: string): void
  rmdir(path: string): void
  unlink(path: string): void
}

interface ParserInstance {
  callMain(args: string[]): number
  FS: ParserFS
}

type ParserFactory = (options: Record<string, unknown>) => Promise<ParserInstance>

declare global {
  interface Window {
    YSMParserModule?: ParserFactory
  }
}

let scriptLoaded = false

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (scriptLoaded && window.YSMParserModule) return resolve()
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      // 已在加载中或已加载完成
      if (window.YSMParserModule) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('加载 YSMParser 运行时失败')))
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('加载 YSMParser 运行时失败'))
    document.head.appendChild(s)
  })
}

function getFactory(): ParserFactory {
  const factory = window.YSMParserModule
  if (!factory) throw new Error('YSMParser 运行时不可用')
  return factory
}

function ensureDir(FS: ParserFS, dir: string) {
  let current = ''
  for (const part of dir.split('/').filter(Boolean)) {
    current += `/${part}`
    try {
      FS.mkdir(current)
    } catch {
      /* 已存在 */
    }
  }
}

function collectFiles(FS: ParserFS, root: string): DecodedFile[] {
  const out: DecodedFile[] = []
  const walk = (dir: string, relBase: string) => {
    for (const name of FS.readdir(dir)) {
      if (name === '.' || name === '..') continue
      const full = `${dir}/${name}`
      const rel = relBase ? `${relBase}/${name}` : name
      if (FS.isDir(FS.stat(full).mode)) {
        walk(full, rel)
      } else {
        out.push({ path: rel, data: FS.readFile(full) })
      }
    }
  }
  try {
    walk(root, '')
  } catch {
    /* ignore */
  }
  return out
}

class ExitStatusError extends Error {
  status: number
  constructor(status: number) {
    super(`exit:${status}`)
    this.name = 'ExitStatus'
    this.status = status
  }
}

/** 解密一个 .ysm 文件，返回还原出的工程文件列表（ysm.json、models/、textures/ 等）。 */
export async function decodeYsm(bytes: Uint8Array, fileName = 'model.ysm'): Promise<DecodedFile[]> {
  await loadScript('/ysmparser/YSMParser.js')
  const factory = getFactory()

  // 捕获解析器的 stdout/stderr，失败时用于诊断
  const logs: string[] = []
  const log = (text: unknown) => {
    if (logs.length > 200) logs.shift()
    logs.push(String(text))
  }

  // 每次解码都创建全新实例：程序 exit() 后旧实例不可复用
  const mod = await factory({
    noInitialRun: true,
    print: log,
    printErr: log,
    locateFile: (path: string) => `/ysmparser/${path}`,
  })
  const { FS } = mod

  ensureDir(FS, '/input')
  ensureDir(FS, '/output')
  FS.writeFile(`/input/${fileName}`, bytes)

  // 确认写入成功
  if (!FS.readdir('/input').includes(fileName)) {
    throw new Error('内部错误：模型数据未能写入解密器')
  }

  let crashMessage: string | null = null
  try {
    const code = mod.callMain(['-i', '/input', '-o', '/output'])
    // 注意：不信任退出码——部分版本即使成功也可能返回非零，
    // 以 /output 是否有文件为准
    void code
  } catch (err) {
    if (err instanceof ExitStatusError) {
      /* 正常退出路径，忽略状态码 */
    } else if (
      err &&
      typeof err === 'object' &&
      String((err as { name?: string }).name || '').includes('ExitStatus')
    ) {
      /* 同上 */
    } else {
      crashMessage = (err as Error)?.message || String(err)
    }
  }

  const files = crashMessage ? [] : collectFiles(FS, '/output')
  if (crashMessage) {
    throw new Error(`解密器崩溃：${crashMessage}`)
  }
  if (files.length === 0) {
    // 诊断：列出根目录与各目录内容，定位输出实际位置
    const diag: string[] = []
    try {
      const roots = FS.readdir('/').filter((n) => n !== '.' && n !== '..')
      for (const dir of roots) {
        const p = `/${dir}`
        let isDir = false
        try {
          isDir = FS.isDir(FS.stat(p).mode)
        } catch {
          /* ignore */
        }
        if (!isDir) {
          diag.push(`/${dir} (file)`)
          continue
        }
        const entries = FS.readdir(p).filter((n) => n !== '.' && n !== '..')
        diag.push(`${p}: ${entries.length ? entries.join(', ') : '(空)'}`)
      }
    } catch {
      /* ignore */
    }
    const detail = [...logs.slice(-6), ...diag.map((d) => `[FS] ${d}`)].filter(Boolean).join(' | ')
    throw new Error(
      detail
        ? `解密失败：${detail}`
        : '解密失败：没有产出任何文件，该模型的加密版本可能不受支持',
    )
  }
  return files
}
