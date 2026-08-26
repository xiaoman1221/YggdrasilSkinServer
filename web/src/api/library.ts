import { request } from './client'
import type { Texture } from './profile'

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
