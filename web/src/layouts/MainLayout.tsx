import { useEffect, useState } from 'react'
import { History, LayoutDashboard, LogOut, Palette, Shield, Store } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { siteApi } from '../api/site'
import { Spinner } from '../components/ui'
import { assetUrl } from '../utils/format'

export default function MainLayout() {
  const { user, loading, logout } = useAuth()
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
        <Spinner label="正在读取会话" />
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
    { to: '/', label: '控制台', icon: <LayoutDashboard size={17} strokeWidth={1.5} />, end: true },
    { to: '/wardrobe', label: '个人皮肤', icon: <Palette size={17} strokeWidth={1.5} /> },
    { to: '/library', label: '公共皮肤库', icon: <Store size={17} strokeWidth={1.5} /> },
    { to: '/records', label: '登录记录', icon: <History size={17} strokeWidth={1.5} /> },
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
        <div className="user">
          {isSuper ? <span className="badge">超级管理员</span> : isAdmin ? <span className="badge">管理员</span> : null}
          {user.avatar_url ? (
            <img
              src={assetUrl(user.avatar_url)}
              alt="头像"
              onClick={() => navigate('/settings')}
              title="个人设置"
              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line)', imageRendering: 'pixelated', cursor: 'pointer' }}
            />
          ) : null}
          <span className="name">{user.username}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/settings')}
            title="个人设置"
          >
            设置
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut size={15} strokeWidth={1.5} />
            退出
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <span className="side-label">导航</span>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          {canManage && (
            <>
              <span className="side-label">管理</span>
              {(isAdmin || perms.includes('user_manage') || perms.includes('texture_library')) && (
                <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Shield size={17} strokeWidth={1.5} />
                  管理
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin/records" className={({ isActive }) => (isActive ? 'active' : '')}>
                  <History size={17} strokeWidth={1.5} />
                  全部登录记录
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
