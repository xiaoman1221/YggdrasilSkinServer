export interface FontPreset {
  id: string
  name: string
  family: string
  url: string
}

/** 全局字体预设：默认 Mojangles（Minecraft 像素风），并预置几个常用字体。 */
export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'mojangles',
    name: 'Mojangles（Minecraft 像素风）',
    family: '"Mojangles", "IBM Plex Sans", sans-serif',
    url: 'https://raw.githubusercontent.com/EJD799/mathcraft3d/master/mojangles.ttf',
  },
  {
    id: 'oppo-sans',
    name: 'OPPO Sans',
    family: '"OPPO Sans", "IBM Plex Sans", sans-serif',
    url: 'https://dsfs.oppo.com/store/public/font/OPPOSans-Medium.woff2',
  },
  {
    id: 'yahei',
    name: '微软雅黑',
    family: '"Microsoft YaHei", "IBM Plex Sans", sans-serif',
    url: '',
  },
  {
    id: 'ibm',
    name: '默认（IBM Plex Sans）',
    family: '"IBM Plex Sans", "Segoe UI", sans-serif',
    url: '',
  },
]

/** 从 font-family 栈中提取第一个字体名（用于注册 @font-face）。 */
export function firstFontFamily(stack: string): string {
  const m = (stack || '').match(/^["']?([^"',]+)["']?/)
  return m ? m[1].trim() : ''
}

/** 加载自定义字体文件并注册到 document.fonts。 */
export function loadCustomFont(family: string, url: string): void {
  const name = firstFontFamily(family)
  if (!name || !url) return
  const face = new FontFace(name, `url(${url})`)
  face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded)
    })
    .catch(() => {
      /* 字体加载失败时回退默认字体 */
    })
}
