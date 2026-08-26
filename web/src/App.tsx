import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './stores/auth'
import { ToastProvider } from './components/Toast'
import { router } from './router'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  )
}
