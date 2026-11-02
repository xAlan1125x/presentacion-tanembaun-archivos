import { useEffect, useState, type ReactNode } from 'react'

interface DemoFrameProps {
  number: string
  title: string
  description: string
  children: ReactNode
  onReset: () => void
}

export function DemoFrame({ number, title, description, children, onReset }: DemoFrameProps) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', handleKey) }
  }, [expanded])

  return (
    <section className={`academic-demo ${expanded ? 'is-expanded' : ''}`} aria-label={`Demostración ${title}`}>
      <header className="academic-demo__header">
        <div className="academic-demo__identity"><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></div>
        <div className="academic-demo__controls">
          <button type="button" onClick={onReset}>↶ Reiniciar</button>
          <button type="button" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Reducir' : 'Ampliar'} <span aria-hidden="true">{expanded ? '↙' : '↗'}</span></button>
        </div>
      </header>
      <div className="academic-demo__body">{children}</div>
      <footer><span className="demo-engine-dot" />Motor FileLab · escenario restaurable <small>Esc para volver</small></footer>
    </section>
  )
}
