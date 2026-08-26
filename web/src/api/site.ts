import { request } from './client'

export interface SiteInfo {
  site_name: string
  site_announcement: string
  allow_register: boolean
  allow_upload: boolean
  mojang_enabled: boolean
}

export const siteApi = {
  info: () => request<SiteInfo>({ method: 'GET', url: '/site/info' }),
}

