import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import AuthAside from '../components/AuthAside'

/**
 * OauthGo 授权回调落地页。
 * 后端把令牌放在 URL fragment（#access=...&refresh=...）中重定向回这里，
 * fragment 不会发往服务器，读取后写入本地存储并进入控制台。
 */
export default function OAuthCallback() {
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
      setError(params.get('message') || '第三方登录失败')
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
      setError('回调参数缺失')
      return
    }
    localStorage.setItem('yss_access_token', access)
    localStorage.setItem('yss_refresh_token', refresh)
    refreshUser()
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError('登录态获取失败'))
  }, [navigate, refreshUser])

  return (
    <div className="split-auth">
      <AuthAside tagline="第三方登录" />
      <main className="auth-main">
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          {bound ? (
            <div>
              <h1>绑定成功</h1>
              <p className="hint">第三方账号已绑定到当前用户。</p>
              <p className="auth-switch">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    navigate('/settings', { replace: true })
                  }}
                >
                  返回个人设置
                </a>
              </p>
            </div>
          ) : error ? (
            <>
              <div>
                <h1>登录失败</h1>
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
                  返回登录
                </a>
              </p>
            </>
          ) : (
            <div>
              <h1>登录中…</h1>
              <p className="hint">正在完成第三方登录</p>
            </div>
          )}
        </form>
      </main>
    </div>
  )
}
