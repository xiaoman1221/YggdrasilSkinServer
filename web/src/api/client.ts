import axios, { AxiosError, AxiosInstance } from 'axios'

/**
 * 项目 API 统一 envelope：
 * { error: { code, message } | null, data: any }
 */

export interface ApiEnvelope<T = any> {
  error: { code: number; message: string } | null
  data: T
}

const client: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('yss_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && typeof body === 'object' && 'error' in body && body.error) {
      return Promise.reject(new Error(body.error.message || 'request failed'))
    }
    return resp
  },
  (err: AxiosError) => {
    const status = err?.response?.status
    const url = err?.config?.url || ''

    // 登录失败（密码错误等）属于正常业务错误，保留后端错误信息，不跳转
    // 注意：必须精确匹配，避免误伤 /auth/login-records
    if (status === 401 && /^\/auth\/login$/.test(url)) {
      return Promise.reject(err)
    }

    // 会话失效：清除本地令牌并回到登录页
    if (status === 401) {
      localStorage.removeItem('yss_access_token')
      localStorage.removeItem('yss_refresh_token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      const normalized = new Error('登录已过期，请重新登录')
      ;(normalized as AxiosError).response = err.response
      return Promise.reject(normalized)
    }

    return Promise.reject(err)
  },
)

/** 发起请求并解包 envelope，返回 data 部分。 */
export async function request<T = any>(config: Parameters<AxiosInstance['request']>[0]): Promise<T> {
  const resp = await client.request<ApiEnvelope<T>>(config)
  return resp.data.data
}

export default client
