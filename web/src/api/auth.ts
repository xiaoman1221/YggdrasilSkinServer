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

export interface SessionInfo {
  id: number
  user_id: number
  ip: string
  user_agent: string
  expires_at: string
  created_at: string
  current?: boolean
}

export interface PasskeyCredential {
  id: number
  user_id: number
  credential_id: string
  name: string
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

export interface CaptchaPayload {
  captchaId?: string
  captchaCode?: string
}

export interface OAuthProvider {
  name: string
  display_name?: string
  allowed?: boolean
}

export const authApi = {
  setup: (payload: { username: string; email: string; password: string }) =>
    request<{ user: User }>({ method: 'POST', url: '/auth/setup', data: payload }),

  register: (payload: { username: string; email: string; password: string } & CaptchaPayload) =>
    request<{ user: User }>({ method: 'POST', url: '/auth/register', data: payload }),

  login: (payload: { account: string; password: string } & CaptchaPayload) =>
    request<LoginResult>({ method: 'POST', url: '/auth/login', data: payload }),

  refresh: (refreshToken: string) =>
    request<LoginResult>({ method: 'POST', url: '/auth/refresh', data: { refreshToken } }),

  logout: (refreshToken: string) =>
    request<void>({ method: 'POST', url: '/auth/logout', data: { refreshToken } }),

  me: () => request<{ user: User }>({ method: 'GET', url: '/auth/me' }),

  setAvatar: (textureId: number) =>
    request<{ user: User }>({ method: 'PUT', url: '/auth/avatar', data: { textureId } }),

  uploadAvatar: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request<{ user: User }>({ method: 'POST', url: '/auth/avatar/upload', data: fd })
  },

  clearAvatar: () => request<{ user: User }>({ method: 'DELETE', url: '/auth/avatar' }),

  loginRecords: (params?: { limit?: number; offset?: number }) =>
    request<Paged<LoginRecord>>({ method: 'GET', url: '/auth/login-records', params }),

  listSessions: (currentRefreshToken?: string) =>
    request<{ sessions: SessionInfo[] }>({
      method: 'GET',
      url: '/auth/sessions',
      headers: currentRefreshToken ? { 'X-Refresh-Token': currentRefreshToken } : undefined,
    }),

  revokeSession: (sessionId: number) =>
    request<void>({ method: 'DELETE', url: `/auth/sessions/${sessionId}` }),

  revokeOtherSessions: (refreshToken: string) =>
    request<void>({ method: 'DELETE', url: '/auth/sessions', data: { refreshToken } }),

  passkeyRegisterBegin: () =>
    request<{ sessionId: string; options: any }>({ method: 'POST', url: '/auth/passkey/register/begin' }),

  passkeyRegisterFinish: (sessionId: string, response: any) =>
    request<{ credentialId: string }>({
      method: 'POST',
      url: '/auth/passkey/register/finish',
      data: { sessionId, response },
    }),

  passkeyLoginBegin: (account: string) =>
    request<{ sessionId: string; options: any }>({
      method: 'POST',
      url: '/auth/passkey/login/begin',
      data: { account },
    }),

  passkeyLoginFinish: (sessionId: string, response: any) =>
    request<LoginResult>({
      method: 'POST',
      url: '/auth/passkey/login/finish',
      data: { sessionId, response },
    }),

  passkeyCredentials: () =>
    request<{ credentials: PasskeyCredential[] }>({ method: 'GET', url: '/auth/passkey/credentials' }),

  passkeyRemove: (id: number) =>
    request<void>({ method: 'DELETE', url: `/auth/passkey/credentials/${id}` }),

  mojangAuthorize: (profileId?: string) =>
    request<{ url: string }>({
      method: 'GET',
      url: '/auth/mojang/authorize',
      params: profileId ? { profileId } : undefined,
    }),

  updateProfile: (payload: { username: string; email: string }) =>
    request<{ user: User }>({ method: 'PUT', url: '/auth/profile', data: payload }),

  changePassword: (payload: { current: string; new: string }) =>
    request<void>({ method: 'PUT', url: '/auth/password', data: payload }),

  forgotPassword: (email: string) =>
    request<void>({ method: 'POST', url: '/auth/forgot-password', data: { email } }),

  resetPassword: (token: string, password: string) =>
    request<void>({ method: 'POST', url: '/auth/reset-password', data: { token, password } }),

  oauthProviders: () =>
    request<{ enabled: boolean; providers: OAuthProvider[] }>({
      method: 'GET',
      url: '/auth/oauth/providers',
    }),

  oauthAuthorize: (type: string) =>
    request<{ url: string }>({ method: 'GET', url: '/auth/oauth/authorize', params: { type } }),

  oauthBindAuthorize: (type: string) =>
    request<{ url: string }>({ method: 'GET', url: '/auth/oauth/bind-authorize', params: { type } }),

  oauthUnbind: () => request<{ user: User }>({ method: 'POST', url: '/auth/oauth/unbind' }),
}




