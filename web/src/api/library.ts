import { request } from './client'
import type { Texture, YsmModel } from './profile'

export interface LibraryItem {
  id: number
  title: string
  status: string
  author: number
  tags: string[]
  texture?: Texture
}

export interface TextureTag {
  id: number
  name: string
}

export interface YsmLibraryItem {
  id: number
  title: string
  status: string
  author: number
  usage_agreement: string
  price_info: string
  purchase_url: string
  is_free: boolean
  tags: string[]
  model?: YsmModel
  created_at: string
}

export const libraryApi = {
  tags: () => request<{ tags: TextureTag[] }>({ method: 'GET', url: '/texture-library/tags' }),

  list: (params?: { status?: string; tag?: string; keyword?: string; limit?: number; offset?: number }) =>
    request<{ items: LibraryItem[]; total: number }>({
      method: 'GET',
      url: '/texture-library/textures',
      params,
    }),

  get: (textureId: number) =>
    request<{ item: LibraryItem }>({ method: 'GET', url: `/texture-library/textures/${textureId}` }),

  copy: (textureId: number) =>
    request<{ texture: Texture }>({ method: 'POST', url: `/texture-library/textures/${textureId}/copy` }),

  report: (textureId: number, reason: string) =>
    request<void>({ method: 'POST', url: `/texture-library/textures/${textureId}/reports`, data: { reason } }),
}

export const ysmLibraryApi = {
  tags: () => request<{ tags: TextureTag[] }>({ method: 'GET', url: '/ysm-library/tags' }),

  list: (params?: { status?: string; tag?: string; keyword?: string; limit?: number; offset?: number }) =>
    request<{ items: YsmLibraryItem[]; total: number }>({
      method: 'GET',
      url: '/ysm-library/models',
      params,
    }),

  get: (itemId: number) =>
    request<{ item: YsmLibraryItem }>({ method: 'GET', url: `/ysm-library/models/${itemId}` }),

  copy: (itemId: number) =>
    request<{ model: YsmModel }>({ method: 'POST', url: `/ysm-library/models/${itemId}/copy` }),
}
