import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import Login from '../pages/Login'
import Register from '../pages/Register'
import Dashboard from '../pages/Dashboard'
import Wardrobe from '../pages/Wardrobe'
import TextureLibrary from '../pages/TextureLibrary'
import LoginRecords from '../pages/LoginRecords'
import Admin from '../pages/Admin'
import AdminRecords from '../pages/AdminRecords'
import BindMojang from '../pages/BindMojang'
import Settings from '../pages/Settings'
import ForgotPassword from '../pages/ForgotPassword'
import ResetPassword from '../pages/ResetPassword'
import OAuthCallback from '../pages/OAuthCallback'
import NotFound from '../pages/NotFound'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />,
  },
  {
    path: '/reset-password',
    element: <ResetPassword />,
  },
  {
    path: '/oauth/callback',
    element: <OAuthCallback />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'wardrobe', element: <Wardrobe /> },
      { path: 'library', element: <TextureLibrary /> },
      { path: 'records', element: <LoginRecords /> },
      { path: 'bind-mojang', element: <BindMojang /> },
      { path: 'settings', element: <Settings /> },
      { path: 'admin', element: <Admin /> },
      { path: 'admin/records', element: <AdminRecords /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

