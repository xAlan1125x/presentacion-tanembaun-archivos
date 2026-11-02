import { useState, type ReactNode } from 'react'

interface ExpandablePanelProps {
  title: string
  hint?: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}

export function ExpandablePanel({
  title,
  hint,
  children,
  defaultOpen = true,
  className = '',
}: ExpandablePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section className={`expandable-panel ${isOpen ? 'is-open' : ''} ${className}`}>
      <button
        className="expandable-panel__trigger"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </span>
        <span className="expandable-panel__chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen && <div className="expandable-panel__body">{children}</div>}
    </section>
  )
}
