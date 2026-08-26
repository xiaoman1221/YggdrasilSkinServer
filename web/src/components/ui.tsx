import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { X } from 'lucide-react'

/* ---------- 按钮 ---------- */

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'outline', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} ${size !== 'md' ? `btn-${size}` : ''} ${className}`.trim()}
      {...rest}
    />
  )
}

/* ---------- 表单字段 ---------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{hint}</span> : null}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`input ${className}`.trim()} {...rest} />
  },
)

/* ---------- 分段选择器 ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- 面板 ---------- */

export function Panel({
  title,
  extra,
  children,
  className = '',
}: {
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title != null ? (
        <header className="panel-head">
          <h3 className="panel-title">{title}</h3>
          {extra}
        </header>
      ) : null}
      <div className="panel-body" style={{ padding: 0 }}>
        {children}
      </div>
    </section>
  )
}

/* ---------- 表格 ---------- */

export interface Column<T> {
  key: string
  title: ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number | string
  render: (row: T) => ReactNode
}

export function Table<T>({
  columns,
  data,
  empty = '暂无数据',
  className = '',
}: {
  columns: Column<T>[]
  data: T[]
  empty?: string
  className?: string
}) {
  if (data.length === 0) {
    return <div className="empty">{empty}</div>
  }
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'num' : ''} style={{ width: c.width }}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- 状态标签 ---------- */

export function StatusTag({ kind, children }: { kind: 'on' | 'warn' | 'danger' | 'off'; children: ReactNode }) {
  return <span className={`tag ${kind !== 'off' ? kind : ''}`}>{children}</span>
}

/* ---------- 文字链接按钮 ---------- */

export function TextLink({
  danger,
  children,
  onClick,
}: {
  danger?: boolean
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button type="button" className={`link-btn ${danger ? 'danger' : ''}`.trim()} onClick={onClick}>
      {children}
    </button>
  )
}

/* ---------- 空状态（虚线框，无插画） ---------- */

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return <div className="empty">{text}</div>
}

/* ---------- 弹窗 ---------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number | string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={width ? { width, maxWidth: '94vw' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

/* ---------- 分页 ---------- */

export function Pager({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number
  total: number
  pageSize: number
  onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pager">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span>
        {page} / {pages}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        下一页
      </Button>
    </div>
  )
}

/* ---------- 加载中（极简） ---------- */

export function Spinner({ label = '加载中' }: { label?: string }) {
  return (
    <div className="empty">
      <span className="data">{label}…</span>
    </div>
  )
}

/* ---------- 文本域 ---------- */

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`textarea ${className}`.trim()} {...rest} />
  },
)

/* ---------- 开关 ---------- */

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
      {label ? <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span> : null}
    </span>
  )
}

