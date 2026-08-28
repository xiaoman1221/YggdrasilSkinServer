import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p className="mono-label">404 · Not Found</p>
        <h1 className="page-title" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '12px 0 8px' }}>
          {t('notFound.title')}
        </h1>
        <p className="page-sub" style={{ marginBottom: 24 }}>
          {t('notFound.subtitle')}
        </p>
        <Link to="/" className="btn btn-outline">
          <ArrowLeft size={15} strokeWidth={1.5} />
          {t('notFound.btnHome')}
        </Link>
      </div>
    </div>
  )
}
