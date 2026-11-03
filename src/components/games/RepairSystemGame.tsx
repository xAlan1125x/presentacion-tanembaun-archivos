import { useEffect, useRef, useState } from 'react'
import {
  createInitialState,
  notifyPhase5ProgressUpdated,
  RepairSystemGame as RepairEngine,
  saveRepairEvaluation,
  type Phase5State,
  type RepairSnapshot,
} from '../../game'
import { createActiveGameStore, saveActiveGameState } from '../../supabase'

function initialState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

export function RepairSystemGame() {
  const gameRef = useRef<RepairEngine | null>(null)
  if (!gameRef.current) gameRef.current = new RepairEngine()
  const [snapshot, setSnapshot] = useState<RepairSnapshot>(() => gameRef.current!.snapshot())
  const [phaseState, setPhaseState] = useState(initialState)
  const [message, setMessage] = useState('')
  const savedAttemptRef = useRef(false)
  useEffect(() => {
    const refresh = () => { const loaded = createActiveGameStore().load(); if (loaded.ok && loaded.value) setPhaseState(loaded.value) }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])

  const advance = () => {
    const nextSnapshot = gameRef.current!.advance()
    setSnapshot(nextSnapshot)
    if (!nextSnapshot.completed || savedAttemptRef.current) return
    savedAttemptRef.current = true
    const evaluation = gameRef.current!.evaluate()
    const next = saveRepairEvaluation(phaseState, evaluation)
    setPhaseState(next)
    const saved = saveActiveGameState(next)
    notifyPhase5ProgressUpdated()
    setMessage(saved && !saved.ok ? saved.error : 'Resultado guardado automáticamente: ' + evaluation.score + '/100.')
  }
  const challenge = snapshot.challenges[snapshot.currentIndex]
  const answer = snapshot.answers.find((item) => item.challengeId === challenge.id)
  const storedCompletion = phaseState.games['repair-system'].status === 'completed' && !snapshot.completed
  const score = snapshot.completed
    ? snapshot.answers.filter((item) => item.correct).length * 25
    : phaseState.games['repair-system'].bestScore

  return (
    <div className="repair-game">
      <div className="repair-game__intro">
        <div><span className="eyebrow">Operación Rescate · 5.4</span><h2>Repará el sistema</h2><p>Resolvé cuatro situaciones breves sobre operaciones y estado de archivos.</p></div>
        <div className="repair-score"><span>Mejor resultado</span><strong>{phaseState.games['repair-system'].bestScore}<small>/100</small></strong><small>{phaseState.games['repair-system'].attempts} intento(s)</small></div>
      </div>

      {!snapshot.completed && !storedCompletion ? (
        <section className="repair-question" aria-labelledby="repair-question-title">
          <header><span>Problema {snapshot.currentIndex + 1} de 4</span><strong id="repair-question-title">{challenge.title}</strong></header>
          <p className="repair-situation">{challenge.situation}</p>
          <h3>{challenge.question}</h3>
          <div className="repair-options">
            {challenge.options.map((option) => {
              const selected = answer?.optionId === option.id
              return <button type="button" key={option.id} onClick={() => setSnapshot(gameRef.current!.answer(option.id))} disabled={Boolean(answer)} className={answer && option.correct ? 'is-correct' : selected ? 'is-incorrect' : ''}><span>{option.label}</span>{answer && option.correct ? <b>✓ Correcta</b> : selected ? <b>✕ Elegida</b> : null}</button>
            })}
          </div>
          <p className="repair-feedback" role="status">{snapshot.feedback}</p>
          {answer && <button type="button" className="primary-action" onClick={advance}>{snapshot.currentIndex === 3 ? 'Ver resultado' : 'Siguiente problema'} <span aria-hidden="true">→</span></button>}
        </section>
      ) : (
        <section className="repair-question repair-summary" aria-labelledby="repair-summary-title">
          <header><span>4 de 4 respondidos</span><strong id="repair-summary-title">Diagnóstico completado</strong></header>
          <p>Puntuación: <strong>{score}/100</strong>. Este es el resultado definitivo de la etapa en el recorrido actual.</p>
          <small>Podrás repetirla al iniciar un recorrido completo nuevo.</small>
        </section>
      )}

      {!storedCompletion && <div className="repair-progress" aria-label={snapshot.answers.length + ' de 4 problemas respondidos'}>
        {snapshot.challenges.map((item, index) => <span key={item.id} className={snapshot.answers[index]?.correct ? 'is-correct' : snapshot.answers[index] ? 'is-incorrect' : index === snapshot.currentIndex ? 'is-current' : ''}>{index + 1}</span>)}
      </div>}
      <div className="repair-footer-actions"><span>{storedCompletion ? 'Etapa completada' : snapshot.answers.length + '/4 respondidos'}</span></div>
      {message && <p className="repair-persistence" role="status">{message}</p>}
    </div>
  )
}
