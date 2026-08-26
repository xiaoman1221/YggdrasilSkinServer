import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p className="mono-label">404 · Not Found</p>
        <h1 className="page-title" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '12px 0 8px' }}>
          页面不存在
        </h1>
        <p className="page-sub" style={{ marginBottom: 24 }}>
          你要找的内容不在这里，或者从未存在过。
        </p>
        <Link to="/" className="btn btn-outline">
          <ArrowLeft size={15} strokeWidth={1.5} />
          返回首页
        </Link>
      </div>
    </div>
  )
}
