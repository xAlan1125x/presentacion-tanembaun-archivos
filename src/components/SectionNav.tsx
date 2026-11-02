import type { PresentationSection } from '../data/sections'

interface SectionNavProps {
  sections: PresentationSection[]
  activeId: string
  isOpen: boolean
  onToggle: () => void
  onNavigate: (id: string) => void
}

export function SectionNav({ sections, activeId, isOpen, onToggle, onNavigate }: SectionNavProps) {
  return (
    <>
      <button
        className="mobile-nav-toggle"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls="section-navigation"
      >
        <span aria-hidden="true">☰</span>
        Secciones
      </button>

      <nav
        id="section-navigation"
        className={`section-nav ${isOpen ? 'is-open' : ''}`}
        aria-label="Secciones de la presentación"
      >
        <div className="section-nav__brand" aria-label="FileLab">
          <span className="brand-mark" aria-hidden="true">FL</span>
          <span><strong>FileLab</strong><small>Archivos · Capítulo 4.1</small></span>
        </div>

        <ol>
          {sections.map((section, index) => (
            <li key={section.id}>
              <button
                type="button"
                className={activeId === section.id ? 'is-active' : ''}
                aria-current={activeId === section.id ? 'step' : undefined}
                onClick={() => onNavigate(section.id)}
              >
                <span className="section-nav__number">{String(index + 1).padStart(2, '0')}</span>
                <span><small>{section.eyebrow}</small>{section.shortTitle}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="section-nav__status">
          <span className="status-dot" aria-hidden="true" />
          Fase 4 · Clase interactiva
        </div>
      </nav>
      {isOpen && <button className="nav-backdrop" type="button" aria-label="Cerrar navegación" onClick={onToggle} />}
    </>
  )
}
