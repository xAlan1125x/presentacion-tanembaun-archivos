import { useEffect, useRef, useState } from 'react'
import {
  createInitialState,
  EscapeRoomGame as EscapeRoomSession,
  notifyPhase5ProgressUpdated,
  saveEscapeRoomEvaluation,
  type ChaosFileId,
  type ChaosProcessId,
  type EscapeRoomSnapshot,
  type Phase5State,
} from '../../game'
import { createActiveGameStore, saveActiveGameState } from '../../supabase'

const STATUS_LABELS = {
  idle: 'Sin solicitud disponible', ready: 'Listo para asignar', waiting: 'Esperando archivo',
  running: 'Operación en curso', release: 'Listo para liberar',
} as const
const OPERATION_LABELS = { read: 'lectura', write: 'escritura' } as const

function initialState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

export function EscapeRoomGame() {
  const sessionRef = useRef(new EscapeRoomSession())
  const savedAttemptRef = useRef(false)
  const [snapshot, setSnapshot] = useState<EscapeRoomSnapshot>(() => sessionRef.current.snapshot())
  const [phaseState, setPhaseState] = useState(initialState)
  const phaseStateRef = useRef(phaseState)
  const [selectedProcess, setSelectedProcess] = useState<ChaosProcessId>()
  const [replaying, setReplaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const storedProgress = phaseState.games['escape-room']
  const showStoredResult = storedProgress.status === 'completed' && !replaying && !snapshot.finished

  useEffect(() => { phaseStateRef.current = phaseState }, [phaseState])
  useEffect(() => {
    const refresh = () => {
      const loaded = createActiveGameStore().load()
      if (loaded.ok && loaded.value) setPhaseState(loaded.value)
    }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])

  useEffect(() => {
    if (!started || snapshot.finished || showStoredResult) return undefined
    const timer = window.setInterval(() => {
      const next = sessionRef.current.tick()
      setSnapshot(next)
      if (next.finished) persistResult()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [started, snapshot.finished, showStoredResult])

  function persistResult() {
    if (savedAttemptRef.current) return
    savedAttemptRef.current = true
    const evaluation = sessionRef.current.evaluate()
    const updated = saveEscapeRoomEvaluation(phaseStateRef.current, evaluation)
    phaseStateRef.current = updated
    setPhaseState(updated)
    setReplaying(false)
    const saved = saveActiveGameState(updated)
    notifyPhase5ProgressUpdated()
    setPersistenceMessage(saved.ok ? 'Resultado guardado automáticamente.' : saved.error)
  }

  function apply(action: () => EscapeRoomSnapshot) {
    const next = action()
    setSnapshot(next)
    if (next.finished) persistResult()
  }

  function assignFile(fileId: ChaosFileId) {
    if (!selectedProcess) return
    apply(() => sessionRef.current.assign(selectedProcess, fileId))
    setSelectedProcess(undefined)
  }

  function restart() {
    sessionRef.current = new EscapeRoomSession()
    savedAttemptRef.current = false
    setSnapshot(sessionRef.current.snapshot())
    setSelectedProcess(undefined)
    setReplaying(true)
    setStarted(false)
    setPersistenceMessage('Nuevo intento iniciado. Tu mejor puntuación se conserva.')
  }

  if (showStoredResult) return <div className="escape-room-game chaos-game"><section className="chaos-result"><span className="eyebrow">Misión registrada</span><h2>Caos en el sistema de archivos</h2><strong>{storedProgress.bestScore}/200 puntos</strong><p>Tu mejor resultado está guardado. Podés repetir el desafío para mejorarlo.</p><button type="button" className="primary-action" onClick={restart}>Jugar de nuevo</button></section></div>

  if (snapshot.finished) return <div className="escape-room-game chaos-game"><section className="chaos-result"><span className="eyebrow">Tiempo finalizado</span><h2>Caos bajo control</h2><strong>{snapshot.score}/200 puntos</strong><p>Completaste {snapshot.completedCount} de {snapshot.totalRequests} solicitudes. Mejor resultado: {phaseState.games['escape-room'].bestScore}.</p><button type="button" className="primary-action" onClick={restart}>Intentar otra vez</button>{persistenceMessage && <p role="status">{persistenceMessage}</p>}</section></div>

  if (!started) return <div className="escape-room-game chaos-game"><section className="chaos-result"><span className="eyebrow">Operación Rescate · etapa 5</span><h2>Caos en el sistema de archivos</h2><p>Tendrás 90 segundos: elegí un proceso, asignale el archivo que solicita y cerralo cuando termine para liberarlo. La exclusividad es una regla didáctica de este juego, no una propiedad universal.</p><button type="button" className="primary-action" onClick={() => setStarted(true)}>Comenzar desafío</button></section></div>

  return (
    <div className="escape-room-game chaos-game">
      <header className="chaos-header">
        <div><span className="eyebrow">Operación Rescate · etapa 5</span><h2>Caos en el sistema de archivos</h2><p>Elegí un proceso, asignale el archivo solicitado y liberalo cuando termine. Cada archivo admite un proceso a la vez sólo como regla didáctica del juego; no es una propiedad universal de los sistemas operativos.</p></div>
        <div className="chaos-stats" aria-label="Estado de la partida"><strong>{snapshot.remainingSeconds}s</strong><span>{snapshot.completedCount}/{snapshot.totalRequests} completadas</span><span>{snapshot.score}/200 puntos</span></div>
      </header>
      <div className="chaos-progress" aria-hidden="true"><span style={{ width: `${(snapshot.completedCount / snapshot.totalRequests) * 100}%` }} /></div>
      <p className="chaos-feedback" role="status" aria-live="polite">{snapshot.message}</p>
      <div className="chaos-board">
        <div className="chaos-processes" aria-label="Procesos simulados">
          {snapshot.processes.map((process) => {
            const selectable = process.status === 'ready' || process.status === 'waiting'
            return <button type="button" key={process.id} className={'chaos-process ' + (selectedProcess === process.id ? 'is-selected' : '')} onClick={() => selectable && setSelectedProcess(process.id)} disabled={!selectable} aria-pressed={selectedProcess === process.id}><span className="chaos-process-icon" aria-hidden="true">●</span><strong>{process.name}</strong><span>{STATUS_LABELS[process.status]}</span>{process.request && process.request.availableAt <= snapshot.elapsedSeconds ? <small>Necesita {process.request.fileId} para {OPERATION_LABELS[process.request.operation]}</small> : <small>Próxima solicitud en espera</small>}</button>
          })}
        </div>
        <div className="chaos-files" aria-label="Archivos compartidos">
          {snapshot.files.map((file) => <article key={file.id} className={'chaos-file ' + (file.holder ? 'is-busy' : '')}><span className="chaos-file-icon" aria-hidden="true">▤</span><h3>{file.id}</h3><p>{file.label}</p>{file.holder ? <><span className="chaos-file-state">{file.readyToRelease ? 'Operación terminada' : 'En uso por ' + file.holder.toUpperCase() + ' · ' + file.remainingSeconds + 's'}</span><button type="button" className="primary-action" disabled={!file.readyToRelease} onClick={() => apply(() => sessionRef.current.release(file.id))}>{file.readyToRelease ? 'Cerrar y liberar' : 'Procesando…'}</button></> : <><span className="chaos-file-state">Disponible</span><button type="button" className="primary-action" disabled={!selectedProcess} onClick={() => assignFile(file.id)}>{selectedProcess ? 'Asignar a ' + selectedProcess.toUpperCase() : 'Elegí un proceso'}</button></>}</article>)}
        </div>
      </div>
      {persistenceMessage && <p className="chaos-persistence" role="status">{persistenceMessage}</p>}
    </div>
  )
}
