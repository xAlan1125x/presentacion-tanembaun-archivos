interface PresentationControlsProps {
  current: number
  total: number
  presentationMode: boolean
  onPrevious: () => void
  onNext: () => void
  onTogglePresentation: () => void
}

export function PresentationControls({
  current,
  total,
  presentationMode,
  onPrevious,
  onNext,
  onTogglePresentation,
}: PresentationControlsProps) {
  return (
    <div className="presentation-controls" aria-label="Controles de presentación">
      <button type="button" onClick={onPrevious} disabled={current === 0} aria-label="Sección anterior">←</button>
      <span aria-live="polite">{current + 1} / {total}</span>
      <button type="button" onClick={onNext} disabled={current === total - 1} aria-label="Sección siguiente">→</button>
      <span className="control-divider" aria-hidden="true" />
      <button className="presentation-mode-button" type="button" onClick={onTogglePresentation}>
        <span aria-hidden="true">{presentationMode ? '⊙' : '⛶'}</span>
        {presentationMode ? 'Salir' : 'Exponer'}
      </button>
    </div>
  )
}
