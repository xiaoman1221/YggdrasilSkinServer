import { useEffect, useState } from 'react'
import { siteApi } from '../api/site'
import { useTranslation } from 'react-i18next'

let cachedImages: string[] | null = null

/**
 * 认证页左侧装饰栏。展示站点名/标语，并随机展示后台配置的认证页背景图
 * （设置键 auth_bg_images，逐页随机取一张，空则不显示背景）。
 */
export default function AuthAside({
  wordmark = 'YSS',
  tagline,
}: {
  wordmark?: string
  tagline?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [bg, setBg] = useState('')

  useEffect(() => {
    let alive = true
    const load = cachedImages
      ? Promise.resolve({ auth_bg_images: cachedImages })
      : siteApi.info().then((res) => {
          cachedImages = res.auth_bg_images || []
          return res
        })
    load
      .then((res) => {
        const list = (res.auth_bg_images || []).filter(Boolean)
        if (alive && list.length > 0) {
          setBg(list[Math.floor(Math.random() * list.length)])
        }
      })
      .catch(() => {
        /* 站点信息拉取失败时保持纯色背景 */
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <aside className={bg ? 'auth-aside auth-aside--bg' : 'auth-aside'} style={bg ? { backgroundImage: `url("${bg}")` } : undefined}>
      <div>
        <div className="wordmark">{wordmark}</div>
        {tagline ? <p className="tagline">{tagline}</p> : null}
      </div>
      <div className="foot">{t('authAside.footer')}</div>
    </aside>
  )
}
