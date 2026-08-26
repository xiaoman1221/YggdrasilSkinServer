import { request } from './client'
import type { LoginRecord, Paged } from './auth'
import type { LibraryItem } from './library'

export interface SiteSettings {
  site_name: string
  site_announcement: string
  site_url: string
  allow_register: string
  allow_upload: string
  max_upload_size_mb: string
  allow_ysm_upload: string
  max_ysm_size_mb: string
  upload_max_width: string
  upload_max_height: string
  yggdrasil_server_name: string
  yggdrasil_impl_name: string
  yggdrasil_impl_version: string
  yggdrasil_skin_domains: string
  yggdrasil_non_email_login: string
  jwt_expire_hours: string
  mojang_client_id: string
  mojang_client_secret: string
  mojang_redirect_uri: string
  smtp_host: string
  smtp_port: string
  smtp_username: string
  smtp_password: string
  smtp_from: string
  oauthgo_enabled: string
  oauthgo_api_base: string
  oauthgo_app_id: string
  oauthgo_app_key: string
}

export interface AdminUser {
  id: number
  username: string
  email: string
  permissions: string
  mojang_name?: string
  created_at: string
}

export interface AdminTexture {
  id: number
  user_id: number
  type: string
  model: string
  hash: string
  width: number
  height: number
  url: string
  created_at: string
}

export interface AdminProfile {
  id: number
  uuid: string
  name: string
  user_id: number
  skin_texture_id?: number
  cape_texture_id?: number
  created_at: string
}

export interface TextureReport {
  id: number
  item_id: number
  reporter_id: number
  reason: string
  status: string
  created_at: string
}

export interface AdminYsmModel {
  id: number
  user_id: number
  name: string
  format: string
  hash: string
  size: number
  description: string
  url: string
  created_at: string
}

export interface PagedList<T> {
  items: T[]
  total: number
}

export const adminApi = {
  getSettings: () => request<{ settings: SiteSettings }>({ method: 'GET', url: '/admin/settings' }),

  updateSettings: (settings: Partial<SiteSettings>) =>
    request<{ settings: SiteSettings }>({
      method: 'PUT',
      url: '/admin/settings',
      data: { settings },
    }),

  loginRecords: (params?: { limit?: number; offset?: number }) =>
    request<Paged<LoginRecord>>({ method: 'GET', url: '/admin/login-records', params }),

  deleteLoginRecord: (recordId: number) =>
    request<void>({ method: 'DELETE', url: `/admin/login-records/${recordId}` }),

  batchDeleteLoginRecords: (ids: number[]) =>
    request<{ deleted: number }>({ method: 'POST', url: '/admin/login-records/batch-delete', data: { ids } }),

  updateUser: (userId: number, data: { username?: string; email?: string; new_password?: string }) =>
    request<{ user: AdminUser }>({ method: 'PUT', url: `/admin/users/${userId}`, data }),

  emailTest: (to: string) =>
    request<void>({ method: 'POST', url: '/admin/settings/email-test', data: { to } }),

  listUsers: (params?: { limit?: number; offset?: number; keyword?: string }) =>
    request<{ users: AdminUser[]; total: number }>({ method: 'GET', url: '/admin/users', params }),

  setUserPermissions: (userId: number, permissions: string) =>
    request<{ user: AdminUser }>({
      method: 'PUT',
      url: `/admin/users/${userId}/permissions`,
      data: { permissions },
    }),

  deleteUser: (userId: number) => request<void>({ method: 'DELETE', url: `/admin/users/${userId}` }),

  listTextures: (params?: { limit?: number; offset?: number }) =>
    request<{ textures: AdminTexture[]; total: number }>({ method: 'GET', url: '/admin/textures', params }),

  deleteTexture: (textureId: number) => request<void>({ method: 'DELETE', url: `/admin/textures/${textureId}` }),

  listProfiles: (params?: { limit?: number; offset?: number; name?: string }) =>
    request<{ profiles: AdminProfile[]; total: number }>({ method: 'GET', url: '/admin/minecraft-profiles', params }),

  renameProfile: (uuid: string, name: string) =>
    request<{ profile: AdminProfile }>({
      method: 'PUT',
      url: `/admin/minecraft-profiles/${uuid}/name`,
      data: { name },
    }),

  deleteProfile: (uuid: string) => request<void>({ method: 'DELETE', url: `/admin/minecraft-profiles/${uuid}` }),

  listLibraryTextures: (params?: { status?: string; limit?: number; offset?: number }) =>
    request<PagedList<LibraryItem>>({ method: 'GET', url: '/admin/texture-library/textures', params }),

  setLibraryStatus: (textureId: number, action: 'approve' | 'reject' | 'unpublish') =>
    request<void>({ method: 'POST', url: `/admin/texture-library/textures/${textureId}/${action}` }),

  listReports: (params?: { status?: string; limit?: number; offset?: number }) =>
    request<{ reports: TextureReport[]; total: number }>({
      method: 'GET',
      url: '/admin/texture-library/reports',
      params,
    }),

  handleReport: (reportId: number, action: 'accept' | 'reject') =>
    request<void>({ method: 'POST', url: `/admin/texture-library/reports/${reportId}/${action}` }),

  listYsmModels: (params?: { limit?: number; offset?: number }) =>
    request<{ models: AdminYsmModel[]; total: number }>({ method: 'GET', url: '/admin/ysm', params }),

  deleteYsmModel: (modelId: number) => request<void>({ method: 'DELETE', url: `/admin/ysm/${modelId}` }),
}
