import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import AuthAside from '../components/AuthAside'
import AuthLangSwitch from '../components/AuthLangSwitch'

/**
 * OauthGo 授权回调落地页。
 * 后端把令牌放在 URL fragment（#access=...&refresh=...）中重定向回这里，
 * fragment 不会发往服务器，读取后写入本地存储并进入控制台。
 */
export default function OAuthCallback() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [error, setError] = useState('')
  const [bound, setBound] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const params = new URLSearchParams(window.location.search)
    if (params.get('result') === 'fail') {
      setError(params.get('message') || t('oauthCallback.error.oauthFailed'))
      return
    }
    if (params.get('result') === 'success' && params.get('action') === 'bind') {
      setBound(true)
      return
    }
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const access = frag.get('access')
    const refresh = frag.get('refresh')
    if (!access || !refresh) {
      setError(t('oauthCallback.error.paramsMissing'))
      return
    }
    localStorage.setItem('yss_access_token', access)
    localStorage.setItem('yss_refresh_token', refresh)
    refreshUser()
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError(t('oauthCallback.error.tokenFailed')))
  }, [navigate, refreshUser, t])

  return (
    <div className="split-auth">
      <AuthAside tagline={t('oauthCallback.tagline')} />
      <main className="auth-main">
        <AuthLangSwitch />
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          {bound ? (
            <div>
              <h1>{t('oauthCallback.bound.title')}</h1>
              <p className="hint">{t('oauthCallback.bound.hint')}</p>
              <p className="auth-switch">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    navigate('/settings', { replace: true })
                  }}
                >
                  {t('oauthCallback.bound.linkSettings')}
                </a>
              </p>
            </div>
          ) : error ? (
            <>
              <div>
                <h1>{t('oauthCallback.error.title')}</h1>
                <p className="hint">{error}</p>
              </div>
              <p className="auth-switch">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    navigate('/login', { replace: true })
                  }}
                >
                  {t('oauthCallback.error.linkLogin')}
                </a>
              </p>
            </>
          ) : (
            <div>
              <h1>{t('oauthCallback.loading.title')}</h1>
              <p className="hint">{t('oauthCallback.loading.hint')}</p>
            </div>
          )}
        </form>
      </main>
    </div>
  )
}
