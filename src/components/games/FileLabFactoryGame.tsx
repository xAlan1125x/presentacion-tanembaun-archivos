import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import {
  createFactoryStateStore,
  createInitialFactoryState,
  createInitialState,
  evaluateFactory,
  finalizeLocalParticipation,
  factoryActiveStorageKey,
  factoryReducer,
  fixedGamesScore,
  isCurrentRunComplete,
  notifyPhase5ProgressUpdated,
  saveFactoryEvaluation,
  startNewRun,
  totalScore,
  type FactoryOrder,
  type FactoryState,
  type FactoryStationId,
  type Phase5State,
} from '../../game'
import { createActiveGameStore, finalizeOnlineParticipation, getOnlineParticipant, saveActiveGameState } from '../../supabase'

const factoryStorageKey = (playerId: string, runId: string) => {
  const participant = getOnlineParticipant()
  return factoryActiveStorageKey(`${participant?.participantId ?? playerId}:${runId}`)
}

function initialGameState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

function loadFactoryState(key: string): FactoryState {
  if (typeof window === 'undefined') return createInitialFactoryState()
  const loaded = createFactoryStateStore(window.localStorage, key).load()
  if (!loaded.ok || !loaded.value) return createInitialFactoryState()
  return loaded.value.started && !loaded.value.finished
    ? factoryReducer(loaded.value, { type: 'TICK', now: Date.now() })
    : loaded.value
}

export function FileLabFactoryGame() {
  const [phaseState, setPhaseState] = useState(initialGameState)
  const storageKeyRef = useRef(factoryStorageKey(phaseState.playerId, phaseState.currentRunId))
  const [state, dispatch] = useReducer(factoryReducer, storageKeyRef.current, loadFactoryState)
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const [finalizing, setFinalizing] = useState(false)

  useEffect(() => {
    if (!state.started || state.finished) return undefined
    const timer = window.setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 1_000)
    return () => window.clearInterval(timer)
  }, [state.started, state.finished])

  useEffect(() => {
    const saved = createFactoryStateStore(window.localStorage, storageKeyRef.current).save(state)
    if (!saved.ok) setPersistenceMessage(saved.error)
  }, [state])

  useEffect(() => {
    if (!state.finished || state.resultSaved) return
    const evaluation = evaluateFactory(state)
    const next = saveFactoryEvaluation(phaseState, evaluation)
    setPhaseState(next)
    const saved = saveActiveGameState(next)
    dispatch({ type: 'MARK_SAVED' })
    notifyPhase5ProgressUpdated()
    setPersistenceMessage(saved.ok ? 'Resultado de Factory guardado.' : saved.error)
  }, [phaseState, state])

  useEffect(() => {
    const refresh = () => {
      const loaded = createActiveGameStore().load()
      if (loaded.ok && loaded.value) setPhaseState(loaded.value)
    }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])

  function drop(event: DragEvent<HTMLButtonElement>, stationId: FactoryStationId) {
    event.preventDefault()
    const orderId = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isFinite(orderId)) dispatch({ type: 'ASSIGN', orderId, stationId })
  }

  const saveRunState = (next: Phase5State, message: string) => {
    const saved = saveActiveGameState(next)
    if (!saved.ok) {
      setPersistenceMessage(saved.error)
      return false
    }
    setPhaseState(next)
    notifyPhase5ProgressUpdated()
    setPersistenceMessage(message)
    return true
  }

  const retryCompleteRun = () => {
    const next = startNewRun(phaseState)
    if (next === phaseState || !saveRunState(next, `Recorrido ${next.currentRunNumber} iniciado.`)) return
    storageKeyRef.current = factoryStorageKey(next.playerId, next.currentRunId)
    dispatch({ type: 'RESET' })
    document.getElementById('clasificar-archivos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const finishParticipation = async () => {
    if (getOnlineParticipant()) {
      setFinalizing(true)
      const result = await finalizeOnlineParticipation(phaseState)
      setFinalizing(false)
      if (result.error) {
        setPersistenceMessage(`No se pudo finalizar: ${result.error.message}`)
        return
      }
      setPhaseState(result.state)
      notifyPhase5ProgressUpdated()
      setPersistenceMessage('Participación finalizada. El mejor recorrido ya está publicado en la clasificación.')
      return
    }
    const next = finalizeLocalParticipation(phaseState)
    if (next !== phaseState) saveRunState(next, 'Participación finalizada. El mejor recorrido quedó bloqueado.')
  }

  if (state.finished || phaseState.games['escape-room'].status === 'completed') {
    const completed = state.orders.filter((order) => order.status === 'done').length
    const currentFactoryScore = phaseState.games['escape-room'].bestScore || state.score
    return <div className="factory-game prototype-centered"><span className="prototype-eyebrow">Operación Rescate · recorrido {phaseState.currentRunNumber}</span><h2>Turno de fábrica terminado</h2><strong className="prototype-final-score">{currentFactoryScore} puntos</strong><p>{completed} pedidos completos · {state.errors} errores</p><p><strong>Primeros cuatro:</strong> {fixedGamesScore(phaseState)}/400 · <strong>Factory:</strong> {currentFactoryScore} · <strong>Total:</strong> {totalScore(phaseState)}</p>{phaseState.bestRun && <p><strong>Mejor recorrido histórico:</strong> {phaseState.bestRun.totalScore} puntos <small>({phaseState.bestRun.fixedGamesScore}/400 + {phaseState.bestRun.factoryScore} de Factory)</small></p>}{phaseState.finalizedAt ? <strong>Participación finalizada. No se admiten nuevos recorridos ni cambios.</strong> : isCurrentRunComplete(phaseState) && <div className="factory-final-actions"><button type="button" className="prototype-primary" onClick={retryCompleteRun} disabled={finalizing}>Reintentar recorrido completo</button><button type="button" className="filelab-secondary-button" onClick={() => void finishParticipation()} disabled={finalizing}>{finalizing ? 'Finalizando…' : 'Finalizar participación'}</button></div>}{persistenceMessage && <p role="status">{persistenceMessage}</p>}</div>
  }

  const queuedOrders = state.orders.filter((order) => order.status === 'waiting')
  return (
    <div className="factory-game factory-prototype">
      <header className="prototype-header"><div><span className="prototype-eyebrow">Operación Rescate · etapa 5</span><h2>FileLab Factory</h2></div><div className="prototype-hud"><strong>{state.remaining}s</strong><span>{state.score} puntos · {state.errors} errores</span></div></header>
      {!state.started && <section className="factory-preflight" aria-labelledby="factory-preflight-title"><div><span>Antes de abrir</span><strong id="factory-preflight-title">Mirá la cola y las ocho llamadas</strong><small>Tenés 105 segundos. Cada pedido completado suma 25 puntos y cada error resta 5.</small></div><div><button type="button" className="prototype-primary" onClick={() => dispatch({ type: 'START', now: Date.now() })}>Comenzar turno</button></div></section>}
      <div className="factory-scoreboard"><span>📥 {queuedOrders.length} en cola</span><span>⚙ {state.stations.filter((station) => station.orderId).length} en estaciones</span><strong>✓ {state.orders.filter((order) => order.status === 'done').length} despachadas</strong></div>
      <p className="prototype-metaphor prototype-metaphor--compact">Seleccioná un archivo → llamada correcta. Al terminar, movelo desde esa estación al siguiente paso.</p>
      <div className="factory-layout">
        <section className="factory-orders" aria-labelledby="factory-orders-title"><h3 id="factory-orders-title"><span aria-hidden="true">🧾</span> Pedidos en cola <b>{queuedOrders.length}</b></h3>{queuedOrders.map((order) => <OrderCard key={order.id} order={order} selected={state.selectedId === order.id} enabled={state.started} onSelect={() => dispatch({ type: 'SELECT', orderId: order.id })} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(order.id))} />)}</section>
        <section className="factory-floor" aria-labelledby="factory-floor-title"><div className="factory-floor-heading"><h3 id="factory-floor-title">Línea de producción</h3><span>{state.selectedId ? `Archivo #${state.selectedId} en mano` : 'Elegí un archivo'}</span></div><div className="factory-stations">{state.stations.map((station) => {
          const activeOrder = state.orders.find((order) => order.id === station.orderId)
          const progress = station.orderId && !station.readyToMove ? ((station.duration - station.remaining) / station.duration) * 100 : 100
          const clickable = Boolean(activeOrder?.status === 'ready' || (!station.orderId && state.selectedId))
          return <button type="button" draggable={activeOrder?.status === 'ready'} key={station.id} className={'factory-station station-' + station.id + (station.orderId ? ' is-busy' : '') + (station.readyToMove ? ' is-ready' : '') + (state.selectedId === station.orderId ? ' is-selected-file' : '')} disabled={!state.started || !clickable} onClick={() => activeOrder?.status === 'ready' ? dispatch({ type: 'SELECT', orderId: activeOrder.id }) : state.selectedId && dispatch({ type: 'ASSIGN', orderId: state.selectedId, stationId: station.id })} onDragStart={(event) => activeOrder && event.dataTransfer.setData('text/plain', String(activeOrder.id))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, station.id)}><span className="factory-station-icon" aria-hidden="true">{station.icon}</span><b>{station.label}</b><small className="factory-station-action">{station.action}</small>{activeOrder ? <div className="factory-station-file"><strong>{activeOrder.name}</strong><small>{station.readyToMove ? `LISTO · mover a ${activeOrder.sequence[activeOrder.step].toUpperCase()}` : `${station.remaining}s · procesando`}</small>{!station.readyToMove && <i><b style={{ width: `${progress}%` }} /></i>}</div> : <><strong>LIBRE</strong><small>Soltá aquí</small></>}</button>
        })}</div><p className={'prototype-feedback is-' + state.feedbackTone} role="status" aria-live="polite">{state.message}</p></section>
      </div>
      {persistenceMessage && <p role="status">{persistenceMessage}</p>}
    </div>
  )
}

function OrderCard({ order, selected, enabled, onSelect, onDragStart }: { order: FactoryOrder; selected: boolean; enabled: boolean; onSelect: () => void; onDragStart: (event: DragEvent<HTMLButtonElement>) => void }) {
  return <button type="button" draggable={enabled} disabled={!enabled} className={'factory-order' + (selected ? ' is-selected' : '')} onClick={onSelect} onDragStart={onDragStart}><span>Pedido #{order.id}</span><div className="factory-order-title"><i aria-hidden="true">▤</i><strong>{order.name}</strong></div><small>{order.task}</small><em>{order.permission}</em><div className="factory-sequence">{order.sequence.map((step, index) => <b key={step + index} className={index === order.step ? 'is-current' : ''}>{step}</b>)}</div><strong className="factory-next">LLEVÁ A {order.sequence[order.step].toUpperCase()}</strong></button>
}
