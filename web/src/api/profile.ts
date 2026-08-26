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
  library_item?: { id: number; status: string; title: string }
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
  url: string
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
}

/** 生成同源纹理 URL（避免 127.0.0.1/localhost 跨域导致 WebGL 加载失败） */
export function textureUrl(hash: string): string {
  return `/textures/${hash}.png`
}

