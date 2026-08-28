import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import SkinPreview3D from './SkinPreview3D'

/**
 * 3D 预览卡片（Blessing Skin 风格）。
 * 皮肤以 skinview3d 3D 模型展示，无皮肤时回退默认 Steve。
 */
export function PreviewCard({
  skinUrl,
  capeUrl,
  slim,
  baseSkinUrl,
  title,
  meta,
  actions,
  emptyText,
}: {
  skinUrl?: string | null
  capeUrl?: string | null
  slim?: boolean
  baseSkinUrl?: string | null
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  emptyText?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="pcard">
      <div className="pcard-stage">
        <SkinPreview3D
          skinUrl={skinUrl}
          capeUrl={capeUrl}
          slim={slim}
          baseSkinUrl={baseSkinUrl}
          width={176}
          height={216}
        />
        {!skinUrl ? <span className="pcard-empty">{emptyText || t('preview.emptySkin')}</span> : null}
      </div>
      <div className="pcard-body">
        <div className="pcard-title">{title}</div>
        {meta ? <div className="pcard-meta">{meta}</div> : null}
        {actions ? <div className="pcard-actions">{actions}</div> : null}
      </div>
    </div>
  )
}
