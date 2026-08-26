import { RefreshCw } from 'lucide-react'
import { Field, Input } from './ui'

export interface CaptchaValue {
  id: string
  image: string
  code: string
}

export default function CaptchaField({
  value,
  onChange,
  onRefresh,
}: {
  value: CaptchaValue
  onChange: (v: CaptchaValue) => void
  onRefresh: () => void
}) {
  return (
    <Field label="图形验证码" hint="点击图片可刷新">
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <Input
          className="mono"
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          placeholder="输入图中字符"
          autoComplete="off"
          maxLength={8}
        />
        {value.image ? (
          <img
            src={value.image}
            alt="验证码"
            title="点击刷新"
            onClick={onRefresh}
            style={{
              width: 110,
              height: 42,
              cursor: 'pointer',
              borderRadius: 6,
              border: '1px solid var(--line)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 110, height: 42 }}
            onClick={onRefresh}
            title="刷新验证码"
          >
            <RefreshCw size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </Field>
  )
}
