import { request } from './client'

export interface User {
  id: number
  email: string
  username: string
  permissions: string
  created_at: string
  avatar_url?: string
  mojang_uuid?: string
  mojang_name?: string
  oauth_type?: string
}


export interface LoginRecord {
  id: number
  user_id: number
  profile_id: string
  profile_name: string
  ip: string
  user_agent: string
  launcher: string
  created_at: string
}

export interface Paged<T> {
  records: T[]
  total: number
}
export interface LoginResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: User
}

export const authApi = {
  setup: (payload: { username: string; email: string; password: string }) =>
    request<{ user: User }>({ method: 'POST', url: '/auth/setup', data: payload }),

  register: (payload: { username: string; email: string; password: string }) =>
    request<{ user: User }>({ method: 'POST', url: '/auth/register', data: payload }),

  login: (payload: { account: string; password: string }) =>
    request<LoginResult>({ method: 'POST', url: '/auth/login', data: payload }),

  refresh: (refreshToken: string) =>
    request<LoginResult>({ method: 'POST', url: '/auth/refresh', data: { refreshToken } }),

  logout: (refreshToken: string) =>
    request<void>({ method: 'POST', url: '/auth/logout', data: { refreshToken } }),

  me: () => request<{ user: User }>({ method: 'GET', url: '/auth/me' }),

  setAvatar: (textureId: number) =>
    request<{ user: User }>({ method: 'PUT', url: '/auth/avatar', data: { textureId } }),

  clearAvatar: () => request<{ user: User }>({ method: 'DELETE', url: '/auth/avatar' }),

  loginRecords: (params?: { limit?: number; offset?: number }) =>
    request<Paged<LoginRecord>>({ method: 'GET', url: '/auth/login-records', params }),

  mojangAuthorize: () =>
    request<{ url: string }>({ method: 'GET', url: '/auth/mojang/authorize' }),

  updateProfile: (payload: { username: string; email: string }) =>
    request<{ user: User }>({ method: 'PUT', url: '/auth/profile', data: payload }),

  changePassword: (payload: { current: string; new: string }) =>
    request<void>({ method: 'PUT', url: '/auth/password', data: payload }),

  forgotPassword: (email: string) =>
    request<void>({ method: 'POST', url: '/auth/forgot-password', data: { email } }),

  resetPassword: (token: string, password: string) =>
    request<void>({ method: 'POST', url: '/auth/reset-password', data: { token, password } }),

  oauthProviders: () =>
    request<{ enabled: boolean; providers: { name: string; display_name?: string }[] }>({
      method: 'GET',
      url: '/auth/oauth/providers',
    }),

  oauthAuthorize: (type: string) =>
    request<{ url: string }>({ method: 'GET', url: '/auth/oauth/authorize', params: { type } }),
}




