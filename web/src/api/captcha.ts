import { request } from './client'

export interface CaptchaImage {
  id: string
  image: string
}

export const captchaApi = {
  get: () => request<CaptchaImage>({ method: 'GET', url: '/captcha' }),
  policy: () => request<{ policy: string }>({ method: 'GET', url: '/captcha/policy' }),
}
