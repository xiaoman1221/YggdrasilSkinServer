import { request } from './client'

export interface Texture {
  id: number
  type: 'skin' | 'cape'
  model: 'classic' | 'slim'
  hash: string
  name: string
  description: string
  width: number
  height: number
  url: string
  library_item?: { id: number; status: string; title: string; usage_agreement?: string }
}

export interface YsmModel {
  id: number
  name: string
  format: 'ysm' | 'zip'
  hash: string
  size: number
  description: string
  usage_agreement: string
  purchase_url: string
  price_info: string
  is_free: boolean
  url: string
  preview_url?: string
  library_item?: { id: number; status: string; title: string }
  created_at: string
}

export interface Profile {
  id: number
  uuid: string
  name: string
  skin_texture_id?: number
  cape_texture_id?: number
  ysm_model_id?: number
  skin_texture?: Texture
  cape_texture?: Texture
  ysm_model?: YsmModel
  created_at: string
}

export const profileApi = {
  list: () => request<{ profiles: Profile[] }>({ method: 'GET', url: '/profiles/minecraft' }),

  create: (name: string) =>
    request<{ profile: Profile }>({ method: 'POST', url: '/profiles/minecraft', data: { name } }),

  rename: (uuid: string, name: string) =>
    request<{ profile: Profile }>({
      method: 'PUT',
      url: `/profiles/minecraft/${uuid}/name`,
      data: { name },
    }),

  remove: (uuid: string) =>
    request<void>({ method: 'DELETE', url: `/profiles/minecraft/${uuid}` }),

  bindTexture: (uuid: string, type: 'skin' | 'cape', textureId: number) =>
    request<{ profile: Profile }>({
      method: 'PUT',
      url: `/profiles/minecraft/${uuid}/textures/${type}`,
      data: { textureId },
    }),

  unbindTexture: (uuid: string, type: 'skin' | 'cape') =>
    request<{ profile: Profile }>({
      method: 'DELETE',
      url: `/profiles/minecraft/${uuid}/textures/${type}`,
    }),

  bindYsm: (uuid: string, modelId: number) =>
    request<{ profile: Profile }>({
      method: 'PUT',
      url: `/profiles/minecraft/${uuid}/ysm/${modelId}`,
    }),

  unbindYsm: (uuid: string) =>
    request<{ profile: Profile }>({
      method: 'DELETE',
      url: `/profiles/minecraft/${uuid}/ysm`,
    }),
}

export const wardrobeApi = {
  list: () => request<{ textures: Texture[] }>({ method: 'GET', url: '/wardrobe/textures' }),

  upload: (type: 'skin' | 'cape', file: File, model = 'classic', name = '', description = '') => {
    const form = new FormData()
    form.append('file', file)
    form.append('model', model)
    if (name) form.append('name', name)
    if (description) form.append('description', description)
    return request<{ texture: Texture }>({
      method: 'POST',
      url: `/wardrobe/textures/${type}`,
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  update: (textureId: number, data: { name?: string; description?: string }) =>
    request<{ texture: Texture }>({
      method: 'PUT',
      url: `/wardrobe/textures/${textureId}`,
      data,
    }),

  remove: (textureId: number) =>
    request<void>({ method: 'DELETE', url: `/wardrobe/textures/${textureId}` }),

  submitLibrary: (textureId: number, data: { title: string; usage_agreement: string; tags?: string[] }) =>
    request<{ item: unknown }>({
      method: 'POST',
      url: `/wardrobe/textures/${textureId}/library-submission`,
      data,
    }),

  removeLibrarySubmission: (textureId: number) =>
    request<void>({ method: 'DELETE', url: `/wardrobe/textures/${textureId}/library-submission` }),
}

export const ysmApi = {
  list: () => request<{ models: YsmModel[] }>({ method: 'GET', url: '/wardrobe/ysm' }),

  upload: (
    file: File,
    name: string,
    description = '',
    meta: { usageAgreement?: string; purchaseUrl?: string; priceInfo?: string } = {},
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    if (description) form.append('description', description)
    if (meta.usageAgreement) form.append('usage_agreement', meta.usageAgreement)
    if (meta.purchaseUrl) form.append('purchase_url', meta.purchaseUrl)
    if (meta.priceInfo) form.append('price_info', meta.priceInfo)
    return request<{ model: YsmModel }>({
      method: 'POST',
      url: '/wardrobe/ysm',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  updateMeta: (
    modelId: number,
    data: { name?: string; description?: string; usage_agreement?: string; purchase_url?: string; price_info?: string },
  ) =>
    request<{ model: YsmModel }>({
      method: 'PUT',
      url: `/wardrobe/ysm/${modelId}`,
      data,
    }),

  remove: (modelId: number) => request<void>({ method: 'DELETE', url: `/wardrobe/ysm/${modelId}` }),

  submitLibrary: (
    modelId: number,
    data: { title: string; usage_agreement: string; price_info: string; purchase_url?: string; tags?: string[] },
  ) =>
    request<{ item: unknown }>({
      method: 'POST',
      url: `/wardrobe/ysm/${modelId}/library-submission`,
      data,
    }),

  removeLibrarySubmission: (modelId: number) =>
    request<void>({ method: 'DELETE', url: `/wardrobe/ysm/${modelId}/library-submission` }),
}

/** 生成同源纹理 URL（避免 127.0.0.1/localhost 跨域导致 WebGL 加载失败） */
export function textureUrl(hash: string): string {
  return `/textures/${hash}.png`
}

/**
 * 下载 YSM 模型文件。
 * 免费模型可直接下载；付费模型需要登录且为作者/管理员，浏览器普通链接不会带登录态，
 * 因此统一用 fetch + Authorization 头拉取后保存为本地文件。
 */
export async function downloadYsmFile(model: { url: string; name: string; format: string }): Promise<void> {
  const token = localStorage.getItem('yss_access_token')
  const resp = await fetch(model.url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!resp.ok) {
    if (resp.status === 403) {
      const text = await resp.text().catch(() => '')
      throw new Error(text.trim() || '该模型为付费模型，购买后才能下载')
    }
    throw new Error(`下载失败（HTTP ${resp.status}）`)
  }
  const blob = await resp.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = `${(model.name || 'model').replace(/[\\/:*?"<>|]/g, '_')}.${model.format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
