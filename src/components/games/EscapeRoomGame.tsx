import { useEffect, useRef, useState } from 'react'
import {
  createInitialState,
  notifyPhase5ProgressUpdated,
  ESCAPE_ROOM_HINTS,
  EscapeRoomGame as EscapeRoomEngine,
  resetGameProgress,
  saveEscapeRoomEvaluation,
  type EscapeRoomSnapshot,
  type Phase5State,
} from '../../game'
import { createActiveGameStore, saveActiveGameState } from '../../supabase'

function initialState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

export function EscapeRoomGame() {
  const engineRef = useRef<EscapeRoomEngine | null>(null)
  if (!engineRef.current) engineRef.current = new EscapeRoomEngine()
  const [snapshot, setSnapshot] = useState<EscapeRoomSnapshot>(() => engineRef.current!.snapshot())
  const [phaseState, setPhaseState] = useState(initialState)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const refresh = () => { const loaded = createActiveGameStore().load(); if (loaded.ok && loaded.value) setPhaseState(loaded.value) }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])
  const run = (action: (engine: EscapeRoomEngine) => EscapeRoomSnapshot) => setSnapshot(action(engineRef.current!))
  const submit = () => {
    const evaluation = engineRef.current!.evaluate()
    const next = saveEscapeRoomEvaluation(phaseState, evaluation)
    setPhaseState(next)
    const saved = saveActiveGameState(next)
    notifyPhase5ProgressUpdated()
    setMessage(saved && !saved.ok ? saved.error : `Resultado guardado: ${evaluation.score}/200.`)
    setSnapshot(engineRef.current!.snapshot())
  }
  const reset = () => {
    const next = resetGameProgress(phaseState, 'escape-room')
    engineRef.current = new EscapeRoomEngine()
    setPhaseState(next)
    setSnapshot(engineRef.current.snapshot())
    const saved = saveActiveGameState(next)
    notifyPhase5ProgressUpdated()
    setMessage(saved && !saved.ok ? saved.error : 'Escape Room reiniciado. Las otras etapas no se modificaron.')
  }
  const files = snapshot.lab.engine.files
  const handles = snapshot.lab.engine.processes.flatMap((process) => process.openFiles.map((handle) => `${handle.descriptor} · ${handle.fileId} · pos ${handle.position}`))
  const currentStep = snapshot.steps.find((step) => !step.solved)

  return (
    <div className="escape-room-game">
      <div className="escape-room__intro">
        <div><span className="eyebrow">Operación Rescate · 5.6</span><h2>Escape Room: Cámara de recuperación</h2><p>La información crítica quedó encerrada en un sistema ficticio. Observá evidencias, repará el acceso, recuperá los bytes y salí dejando el sistema limpio.</p></div>
        <div className="escape-room-score"><span>Mejor resultado</span><strong>{phaseState.games['escape-room'].bestScore}<small>/200</small></strong><small>{phaseState.games['escape-room'].attempts} intento(s)</small></div>
      </div>
      <div className="escape-room-mission"><span>Objetivo actual</span><strong>{currentStep?.title ?? 'Misión completada'}</strong><p>{currentStep?.description ?? 'La evidencia fue recuperada y verificada. Podés revisar la traza antes de volver a jugar.'}</p></div>
      <div className="escape-room-progress">{snapshot.steps.map((step, index) => <article key={step.id} className={`${step.solved ? 'is-solved' : ''} ${step.unlocked ? 'is-unlocked' : 'is-locked'}`}><b>{index + 1}</b><span>{step.title}</span><small>{step.solved ? 'resuelto' : step.unlocked ? 'disponible' : 'bloqueado'}</small></article>)}</div>
      <div className="escape-room-layout">
        <section className="escape-room-explorer" aria-labelledby="escape-room-explorer-title">
          <header><span>Explorador de evidencias</span><strong id="escape-room-explorer-title">Cámara de rescate</strong></header>
          <div className="escape-room-files">{files.map((file) => <article key={file.id} className={snapshot.selectedFileId === file.id ? 'is-selected' : ''}><div><strong>{file.name}</strong><small>{file.type} · {file.format} · {file.size} B</small></div><div><button type="button" onClick={() => run((engine) => engine.inspect(file.id))}>Inspeccionar</button><button type="button" onClick={() => run((engine) => engine.selectFile(file.id))} disabled={!snapshot.steps[0].unlocked}>Seleccionar</button></div></article>)}</div>
        </section>
        <section className="escape-room-tools" aria-labelledby="escape-room-tools-title">
          <header><span>Herramientas desbloqueables</span><strong id="escape-room-tools-title">Intervención sobre el sistema</strong></header>
          <div className="escape-room-tool-buttons">
            <button type="button" onClick={() => run((engine) => engine.setAccess())} disabled={!snapshot.steps[1].unlocked}>Comprobar acceso de lectura</button>
            <button type="button" onClick={() => run((engine) => engine.openArchive())} disabled={!snapshot.steps[2].unlocked}>open evidencia</button>
            <button type="button" onClick={() => run((engine) => engine.seek(7))} disabled={!snapshot.steps[2].unlocked}>seek cursor</button>
            <button type="button" onClick={() => run((engine) => engine.readSecret())} disabled={!snapshot.steps[2].unlocked}>read bloque</button>
            <button type="button" onClick={() => run((engine) => engine.prepareRecovery())} disabled={!snapshot.steps[3].unlocked}>creat recuperación</button>
            <button type="button" onClick={() => run((engine) => engine.writeRecovery())} disabled={!snapshot.steps[3].unlocked}>write bytes</button>
            <button type="button" onClick={() => run((engine) => engine.verify())} disabled={!snapshot.steps[4].unlocked}>Verificar contenido</button>
            <button type="button" onClick={() => run((engine) => engine.closeAll())}>Cerrar descriptores</button>
          </div>
          <p className="escape-room-status" role="status">{snapshot.message}</p>
        </section>
      </div>
      <div className="escape-room-observer"><div><span>Cursor / descriptores</span><strong>{handles.length ? handles.join(' · ') : 'ninguno abierto'}</strong></div><div><span>Búfer recuperado</span><strong>{snapshot.pendingBytes.length ? new TextDecoder().decode(snapshot.pendingBytes) : 'vacío'}</strong></div><div><span>Destino</span><strong>{files.find((file) => file.id === 'recovery')?.size ?? 0} B</strong></div></div>
      <section className="escape-room-trace" aria-labelledby="escape-room-trace-title"><header><span>Registro de consecuencias</span><strong id="escape-room-trace-title">{snapshot.actions.length} acción(es)</strong></header><div>{snapshot.actions.slice().reverse().map((action) => <article key={action.id} className={action.ok ? 'is-ok' : 'is-error'}><b>{action.id}</b><code>{action.name}</code><p>{action.message}</p></article>)}</div></section>
      <div className="escape-room-hints"><span>Pistas opcionales</span>{ESCAPE_ROOM_HINTS.map((hint) => <button type="button" key={hint.id} onClick={() => run((engine) => engine.useHint(hint.id))} disabled={snapshot.hintsUsed.includes(hint.id)}>{snapshot.hintsUsed.includes(hint.id) ? hint.text : `Pedir pista (-${hint.penaltyPoints})`}</button>)}</div>
      <div className="escape-room-actions"><button type="button" className="primary-action" onClick={submit}>Evaluar misión <span aria-hidden="true">→</span></button><button type="button" className="filelab-secondary-button" onClick={reset}>Reiniciar Escape Room</button><span>{snapshot.completed ? 'Misión completa' : 'La cámara sigue bloqueada'}</span></div>
      {message && <p className="escape-room-persistence" role="status">{message}</p>}
    </div>
  )
}
