import { useEffect, useRef, useState } from 'react'
import {
  createInitialState,
  notifyPhase5ProgressUpdated,
  REPAIR_HINTS,
  RepairSystemGame as RepairEngine,
  resetGameProgress,
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
  useEffect(() => {
    const refresh = () => { const loaded = createActiveGameStore().load(); if (loaded.ok && loaded.value) setPhaseState(loaded.value) }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])
  const run = (action: (game: RepairEngine) => RepairSnapshot) => setSnapshot(action(gameRef.current!))
  const submit = () => {
    const evaluation = gameRef.current!.evaluate()
    const next = saveRepairEvaluation(phaseState, evaluation)
    setPhaseState(next)
    const saved = saveActiveGameState(next)
    notifyPhase5ProgressUpdated()
    setMessage(saved && !saved.ok ? saved.error : `Resultado guardado: ${evaluation.score}/200.`)
    setSnapshot(gameRef.current!.snapshot())
  }
  const reset = () => {
    const next = resetGameProgress(phaseState, 'repair-system')
    gameRef.current = new RepairEngine()
    setPhaseState(next)
    setSnapshot(gameRef.current.snapshot())
    const saved = saveActiveGameState(next)
    notifyPhase5ProgressUpdated()
    setMessage(saved && !saved.ok ? saved.error : 'Escenario restaurado. Las otras etapas no se modificaron.')
  }
  const currentFile = snapshot.lab.engine.files.find((file) => file.id === 'protected')

  return (
    <div className="repair-game">
      <div className="repair-game__intro">
        <div><span className="eyebrow">Operación Rescate · 5.4</span><h2>Repará el sistema</h2><p>El laboratorio quedó en un estado inconsistente. Usá operaciones reales del motor para reparar permisos, descriptores, cursores y el orden del ciclo.</p></div>
        <div className="repair-score"><span>Mejor resultado</span><strong>{phaseState.games['repair-system'].bestScore}<small>/200</small></strong><small>{phaseState.games['repair-system'].attempts} intento(s)</small></div>
      </div>
      <div className="repair-mission"><span>Misión</span><p>Inspeccioná antes de actuar. Los errores quedan registrados y una secuencia incorrecta no marca un problema como resuelto.</p></div>
      <div className="repair-layout">
        <section className="repair-tools" aria-labelledby="repair-tools-title">
          <header><span>Laboratorio de reparación</span><strong id="repair-tools-title">Herramientas del motor</strong></header>
          <div className="repair-file-strip">{snapshot.lab.engine.files.map((file) => <button key={file.id} type="button" onClick={() => run((game) => game.inspect(file.id))} className={file.id === 'protected' ? 'is-focus' : ''}><strong>{file.name}</strong><small>{file.size} B · {file.attributes.readOnly ? 'sólo lectura' : 'escritura habilitada'}</small></button>)}</div>
          <div className="repair-actions-grid">
            <button type="button" onClick={() => run((game) => game.setReadOnly(false))}>Quitar sólo lectura</button>
            <button type="button" onClick={() => run((game) => game.openProtected())}>Abrir reporte R/W</button>
            <button type="button" onClick={() => run((game) => game.writeProtected())}>Escribir reparación</button>
            <button type="button" onClick={() => run((game) => game.invalidRead())}>Probar read(fd inválido)</button>
            <button type="button" onClick={() => run((game) => game.openRecords())}>Abrir registros</button>
            <button type="button" onClick={() => run((game) => game.readRecords())}>Leer registros</button>
            <button type="button" onClick={() => run((game) => game.openSequence())}>Abrir secuencia</button>
            <button type="button" onClick={() => run((game) => game.seekSequence())}>seek secuencia → 4</button>
            <button type="button" onClick={() => run((game) => game.readSequence())}>Leer desde cursor</button>
            <button type="button" onClick={() => run((game) => game.closeAll())}>Cerrar descriptores</button>
          </div>
          <p className="repair-status" role="status">{snapshot.message}</p>
        </section>
        <section className="repair-challenges" aria-labelledby="repair-challenges-title">
          <header><span>Diagnóstico de daños</span><strong id="repair-challenges-title">{snapshot.solvedChallengeIds.length}/4 problemas resueltos</strong></header>
          {snapshot.challenges.map((challenge) => <article key={challenge.id} className={snapshot.solvedChallengeIds.includes(challenge.id) ? 'is-solved' : ''}><span>{snapshot.solvedChallengeIds.includes(challenge.id) ? '✓' : '0'}</span><div><strong>{challenge.title}</strong><p>{challenge.goal}</p>{snapshot.solvedChallengeIds.includes(challenge.id) && <small>{challenge.explanation}</small>}</div></article>)}
        </section>
      </div>
      <section className="repair-observer" aria-labelledby="repair-observer-title">
        <header><span>Estado real del simulador</span><strong id="repair-observer-title">Archivos, descriptores y resultados</strong></header>
        <div className="repair-observer-grid"><div><span>Reporte</span><strong>{currentFile?.attributes.readOnly ? 'readOnly: true' : 'readOnly: false'}</strong><small>{currentFile?.size} bytes</small></div><div><span>Descriptores abiertos</span><strong>{snapshot.lab.engine.processes.reduce((sum, process) => sum + process.openFiles.length, 0)}</strong><small>{snapshot.lab.engine.processes.flatMap((process) => process.openFiles.map((handle) => `fd ${handle.descriptor} · ${handle.fileId} · pos ${handle.position}`)).join(' · ') || 'ninguno'}</small></div><div><span>Acciones</span><strong>{snapshot.actions.length}</strong><small>{snapshot.actions.filter((action) => !action.ok).length} error(es) registrado(s)</small></div></div>
      </section>
      <section className="repair-hints"><span>Pistas opcionales</span>{REPAIR_HINTS.map((hint) => <button type="button" key={hint.id} onClick={() => run((game) => game.useHint(hint.id))} disabled={snapshot.hintsUsed.includes(hint.id)}>{snapshot.hintsUsed.includes(hint.id) ? hint.text : `Pedir pista (-${hint.penaltyPoints})`}</button>)}</section>
      <div className="repair-footer-actions"><button type="button" className="primary-action" onClick={submit}>Evaluar reparación <span aria-hidden="true">→</span></button><button type="button" className="filelab-secondary-button" onClick={reset}>Restaurar escenario</button><span>{snapshot.actions.length} operación(es) ejecutada(s)</span></div>
      {message && <p className="repair-persistence" role="status">{message}</p>}
    </div>
  )
}
