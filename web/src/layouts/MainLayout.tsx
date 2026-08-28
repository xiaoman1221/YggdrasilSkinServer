import { useEffect, useState } from 'react'
import { History, LayoutDashboard, LogOut, Palette, Shield, Store } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import { siteApi } from '../api/site'
import { Spinner } from '../components/ui'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeSwitcher from '../components/ThemeSwitcher'
import { assetUrl } from '../utils/format'

export default function MainLayout() {
  const { user, loading, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [siteName, setSiteName] = useState('YSS')

  // 站点信息与登录状态无关，仅加载一次
  useEffect(() => {
    siteApi
      .info()
      .then((info) => setSiteName(info.site_name || 'YSS'))
      .catch(() => {})
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spinner label={t('layout.loadingSession')} />
      </div>
    )
  }

  // 声明式守卫：未登录时不渲染任何子内容，避免子页面先发起无效请求
  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isSuper = user.id === 1
  const perms = (user.permissions || '').split(',').map((p) => p.trim())
  const isAdmin = isSuper || perms.includes('admin')
  const canManage = isAdmin || perms.includes('texture_library') || perms.includes('user_manage')

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: <LayoutDashboard size={17} strokeWidth={1.5} />, end: true },
    { to: '/wardrobe', label: t('nav.wardrobe'), icon: <Palette size={17} strokeWidth={1.5} /> },
    { to: '/library', label: t('nav.library'), icon: <Store size={17} strokeWidth={1.5} /> },
    { to: '/records', label: t('nav.records'), icon: <History size={17} strokeWidth={1.5} /> },
  ]

  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="mark" />
          YSS
        </Link>
        <span className="site-name">{siteName}</span>
        <span className="spacer" />
        <LanguageSwitcher />
        <ThemeSwitcher compact />
        <div className="user">
          {isSuper ? <span className="badge">{t('layout.badgeSuper')}</span> : isAdmin ? <span className="badge">{t('layout.badgeAdmin')}</span> : null}
          {user.avatar_url ? (
            <img
              src={assetUrl(user.avatar_url)}
              alt={t('layout.avatarAlt')}
              onClick={() => navigate('/settings')}
              title={t('layout.settingsTitle')}
              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line)', imageRendering: 'pixelated', cursor: 'pointer' }}
            />
          ) : null}
          <span className="name">{user.username}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/settings')}
            title={t('layout.settingsTitle')}
          >
            {t('layout.settings')}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut size={15} strokeWidth={1.5} />
            {t('layout.logout')}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <span className="side-label">{t('layout.sidebarNav')}</span>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          {canManage && (
            <>
              <span className="side-label">{t('layout.sidebarManage')}</span>
              {(isAdmin || perms.includes('user_manage') || perms.includes('texture_library')) && (
                <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Shield size={17} strokeWidth={1.5} />
                  {t('nav.admin')}
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin/records" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <History size={17} strokeWidth={1.5} />
                  {t('nav.allRecords')}
                </NavLink>
              )}
            </>
          )}
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
