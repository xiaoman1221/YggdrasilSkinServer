import { request } from './client'

export interface SiteInfo {
  site_name: string
  site_announcement: string
  font_family: string
  allow_register: boolean
  allow_upload: boolean
  mojang_enabled: boolean
  auth_bg_images: string[]
}

export const siteApi = {
  info: () => request<SiteInfo>({ method: 'GET', url: '/site/info' }),
}

