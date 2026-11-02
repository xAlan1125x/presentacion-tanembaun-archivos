import { useEffect, useRef, type ReactNode } from 'react'

interface FileLabDialogProps {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}

export function FileLabDialog({ title, description, children, onClose }: FileLabDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="filelab-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="filelab-dialog" role="dialog" aria-modal="true" aria-labelledby="filelab-dialog-title" ref={panelRef}>
        <header><div><h3 id="filelab-dialog-title">{title}</h3>{description && <p>{description}</p>}</div><button type="button" onClick={onClose} aria-label="Cerrar diálogo">×</button></header>
        {children}
      </div>
    </div>
  )
}
