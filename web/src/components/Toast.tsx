import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'err' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastApi | null>(null)

let seed = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++seed
      setItems((prev) => [...prev.slice(-3), { id, kind, message }])
      const timer = setTimeout(() => dismiss(id), 2600)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  // 保持 value 引用稳定，避免依赖 useToast() 的 useCallback/useEffect 反复触发
  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind !== 'info' ? t.kind : ''}`.trim()} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
