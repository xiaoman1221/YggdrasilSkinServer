import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './stores/auth'
import { ToastProvider } from './components/Toast'
import { siteApi } from './api/site'
import { loadCustomFont } from './lib/fonts'
import { router } from './router'

export default function App() {
  // 应用站点设置中的全局字体（未配置时保持默认字体）
  useEffect(() => {
    siteApi
      .info()
      .then((info) => {
        const font = (info.font_family || '').trim()
        if (font) {
          document.documentElement.style.setProperty('--font-ui', font)
        }
        loadCustomFont(font, (info.font_url || '').trim())
        if (info.font_size > 0) {
          document.documentElement.style.setProperty('--fs', `${info.font_size}px`)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  )
}
