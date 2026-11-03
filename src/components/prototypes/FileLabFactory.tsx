import { useEffect, useReducer, type DragEvent } from 'react'

type FactoryStationId = 'open' | 'read' | 'write' | 'close' | 'delete' | 'create' | 'seek' | 'rename'
type OrderStatus = 'waiting' | 'processing' | 'ready' | 'done'

interface OrderTemplate {
  name: string
  task: string
  permission: string
  sequence: FactoryStationId[]
}

interface FactoryOrder extends OrderTemplate {
  id: number
  step: number
  status: OrderStatus
}

interface FactoryStation {
  id: FactoryStationId
  label: string
  action: string
  icon: string
  duration: number
  orderId?: number
  remaining: number
  readyToMove: boolean
}

interface FactoryState {
  started: boolean
  finished: boolean
  practice: boolean
  elapsed: number
  remaining: number
  orders: FactoryOrder[]
  stations: FactoryStation[]
  selectedId?: number
  score: number
  errors: number
  message: string
  feedbackTone: 'neutral' | 'success' | 'error'
  pendingOrders: FactoryOrder[]
  nextOrderId: number
  nextArrivalAt: number
}

type FactoryAction =
  | { type: 'START'; practice: boolean }
  | { type: 'SELECT'; orderId: number }
  | { type: 'ASSIGN'; orderId: number; stationId: FactoryStationId }
  | { type: 'TICK' }

const FACTORY_DURATION = 105
const ORDER_TEMPLATES: OrderTemplate[] = [
  { name: 'clientes.csv', task: 'Consultar registros', permission: 'Lectura permitida', sequence: ['open', 'read', 'close'] },
  { name: 'resumen.txt', task: 'Guardar el resumen', permission: 'Escritura permitida', sequence: ['open', 'write', 'close'] },
  { name: 'temporal.tmp', task: 'Eliminar el archivo', permission: 'Eliminación permitida', sequence: ['delete'] },
  { name: 'informe.txt', task: 'Crear y guardar contenido', permission: 'Archivo nuevo', sequence: ['create', 'open', 'write', 'close'] },
  { name: 'auditoria.log', task: 'Leer desde otra posición', permission: 'Sólo lectura', sequence: ['open', 'seek', 'read', 'close'] },
  { name: 'borrador.md', task: 'Cambiar el nombre', permission: 'Renombrado permitido', sequence: ['rename'] },
  { name: 'estado.dat', task: 'Actualizar una zona', permission: 'Escritura permitida', sequence: ['open', 'seek', 'write', 'close'] },
  { name: 'manual.md', task: 'Consultar instrucciones', permission: 'Sólo lectura', sequence: ['open', 'read', 'close'] },
  { name: 'salida.bin', task: 'Crear el resultado', permission: 'Archivo nuevo', sequence: ['create', 'open', 'write', 'close'] },
  { name: 'viejo.log', task: 'Retirar el registro', permission: 'Eliminación permitida', sequence: ['delete'] },
]

const STATION_DEFINITIONS: FactoryStation[] = [
  { id: 'open', label: 'OPEN', action: 'Abrir', icon: '↗', duration: 2, remaining: 0, readyToMove: false },
  { id: 'read', label: 'READ', action: 'Leer', icon: '👁', duration: 3, remaining: 0, readyToMove: false },
  { id: 'write', label: 'WRITE', action: 'Escribir', icon: '✎', duration: 4, remaining: 0, readyToMove: false },
  { id: 'close', label: 'CLOSE', action: 'Cerrar', icon: '×', duration: 2, remaining: 0, readyToMove: false },
  { id: 'delete', label: 'DELETE', action: 'Eliminar', icon: '⌫', duration: 3, remaining: 0, readyToMove: false },
  { id: 'create', label: 'CREATE', action: 'Crear', icon: '＋', duration: 3, remaining: 0, readyToMove: false },
  { id: 'seek', label: 'SEEK', action: 'Saltar', icon: '↪', duration: 2, remaining: 0, readyToMove: false },
  { id: 'rename', label: 'RENAME', action: 'Renombrar', icon: 'Aa', duration: 3, remaining: 0, readyToMove: false },
]

function createOrderPlan(startId = 1): FactoryOrder[] {
  const shuffled = [...ORDER_TEMPLATES]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
  }
  return shuffled.map((template, index) => ({ ...template, sequence: [...template.sequence], id: startId + index, step: 0, status: 'waiting' }))
}

function initialFactoryState(): FactoryState {
  const orderPlan = createOrderPlan()
  return {
    started: false, finished: false, practice: false, elapsed: 0, remaining: FACTORY_DURATION,
    orders: orderPlan.slice(0, 2), stations: STATION_DEFINITIONS.map((station) => ({ ...station })),
    score: 0, errors: 0, message: 'Tomá una orden y llevala a su primera llamada.', feedbackTone: 'neutral',
    pendingOrders: orderPlan.slice(2), nextOrderId: orderPlan.length + 1, nextArrivalAt: 10,
  }
}

function penalize(state: FactoryState, message: string): FactoryState {
  return { ...state, errors: state.errors + 1, score: state.practice ? 0 : Math.max(0, state.score - 5), message: (state.practice ? '' : '−5 · ') + message, feedbackTone: 'error' }
}

function factoryReducer(state: FactoryState, action: FactoryAction): FactoryState {
  if (action.type === 'START') {
    if (!state.started && !state.finished) return { ...state, started: true, practice: action.practice }
    return { ...initialFactoryState(), started: true, practice: action.practice }
  }
  if (action.type === 'SELECT') {
    const order = state.orders.find((candidate) => candidate.id === action.orderId)
    return state.started && order && (order.status === 'waiting' || order.status === 'ready') ? { ...state, selectedId: action.orderId, message: order.name + ' seleccionado. Próximo paso: ' + order.sequence[order.step].toUpperCase() + '.', feedbackTone: 'neutral' } : state
  }
  if (state.finished) return state

  if (action.type === 'ASSIGN') {
    if (!state.started) return state
    const order = state.orders.find((candidate) => candidate.id === action.orderId)
    const station = state.stations.find((candidate) => candidate.id === action.stationId)
    if (!order || !station || (order.status !== 'waiting' && order.status !== 'ready')) return state
    if (station.orderId) return penalize(state, station.label + ' está ocupada. Elegí otra orden o liberá esa estación.')
    const expected = order.sequence[order.step]
    if (expected !== action.stationId) {
      const rule = action.stationId === 'read' || action.stationId === 'write' ? ' READ y WRITE requieren OPEN antes.' : ''
      return penalize(state, 'Secuencia incorrecta: el próximo paso es ' + expected.toUpperCase() + '.' + rule)
    }
    const sourceId = state.stations.find((candidate) => candidate.orderId === order.id)?.id
    return {
      ...state,
      selectedId: undefined,
      orders: state.orders.map((candidate) => candidate.id === order.id ? { ...candidate, status: 'processing' } : candidate),
      stations: state.stations.map((candidate) => {
        if (candidate.id === sourceId) return { ...candidate, orderId: undefined, remaining: 0, readyToMove: false }
        if (candidate.id === station.id) return { ...candidate, orderId: order.id, remaining: candidate.duration, readyToMove: false }
        return candidate
      }),
      message: order.name + ' está procesándose en ' + station.label + '.', feedbackTone: 'neutral',
    }
  }

  if (action.type === 'TICK') {
    if (!state.started) return state
    const remaining = state.practice ? FACTORY_DURATION : Math.max(0, state.remaining - 1)
    const elapsed = state.elapsed + 1
    let score = state.score
    let message = state.message
    let feedbackTone = state.feedbackTone
    let orders = state.orders.map((order) => ({ ...order }))
    let completedOperation = false
    const stations = state.stations.map((station) => {
      if (!station.orderId || station.readyToMove) return station
      const nextRemaining = station.remaining - 1
      if (nextRemaining > 0) return { ...station, remaining: nextRemaining }
      const order = orders.find((candidate) => candidate.id === station.orderId)
      if (!order) return { ...station, orderId: undefined, remaining: 0, readyToMove: false }
      order.step += 1
      completedOperation = true
      if (order.step === order.sequence.length) {
        order.status = 'done'
        if (!state.practice) score += 25
        message = order.name + ' completado y despachado.'
        return { ...station, orderId: undefined, remaining: 0, readyToMove: false }
      }
      order.status = 'ready'
      if (!state.practice) score += 8
      message = station.label + ' terminó. Mové ' + order.name + ' a ' + order.sequence[order.step].toUpperCase() + '.'
      return { ...station, remaining: 0, readyToMove: true }
    })

    let pendingOrders = state.pendingOrders
    let nextOrderId = state.nextOrderId
    let nextArrivalAt = state.nextArrivalAt
    if (elapsed >= 55 && nextArrivalAt > elapsed + 4) nextArrivalAt = elapsed + 4
    if (elapsed >= nextArrivalAt) {
      if (pendingOrders.length === 0) {
        pendingOrders = createOrderPlan(nextOrderId)
        nextOrderId += pendingOrders.length
      }
      orders = [...orders, pendingOrders[0]]
      pendingOrders = pendingOrders.slice(1)
      nextArrivalAt = elapsed + (elapsed < 35 ? 10 : elapsed < 55 ? 7 : 4)
      message = 'Llegó un nuevo pedido a la cola.'
      feedbackTone = 'neutral'
    } else if (completedOperation) feedbackTone = 'success'

    return { ...state, elapsed, remaining, orders, stations, score, message, feedbackTone, pendingOrders, nextOrderId, nextArrivalAt, finished: !state.practice && remaining === 0 }
  }
  return state
}

export function FileLabFactory() {
  const [state, dispatch] = useReducer(factoryReducer, undefined, initialFactoryState)

  useEffect(() => {
    if (!state.started || state.finished) return undefined
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => window.clearInterval(timer)
  }, [state.started, state.finished])

  function drop(event: DragEvent<HTMLButtonElement>, stationId: FactoryStationId) {
    event.preventDefault()
    const orderId = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isFinite(orderId)) dispatch({ type: 'ASSIGN', orderId, stationId })
  }

  if (state.finished) {
    const completed = state.orders.filter((order) => order.status === 'done').length
    return <main id="contenido" className="prototype-shell prototype-centered"><span className="prototype-eyebrow">Resultado local · no se guarda</span><h1>Turno de fábrica terminado</h1><strong className="prototype-final-score">{state.score} puntos</strong><p>{completed} órdenes completas · {state.errors} errores</p><button type="button" className="prototype-primary" onClick={() => dispatch({ type: 'START', practice: false })}>Nuevo turno</button></main>
  }

  const queuedOrders = state.orders.filter((order) => order.status === 'waiting')
  return (
    <main id="contenido" className="prototype-shell factory-prototype">
      <header className="prototype-header"><div><span className="prototype-eyebrow">Prototipo B · gestión</span><h1>FileLab Factory</h1></div><div className="prototype-hud"><strong>{state.practice ? 'LIBRE' : state.remaining + 's'}</strong><span>{state.practice ? 'Modo práctica · sin puntaje' : state.score + ' puntos · ' + state.errors + ' errores'}</span></div></header>
      {!state.started && <section className="factory-preflight" aria-labelledby="factory-preflight-title"><div><span>Antes de abrir</span><strong id="factory-preflight-title">Mirá la cola y las ocho llamadas</strong><small>Cada archivo sigue una secuencia de hasta cuatro pasos. En práctica no hay reloj ni puntaje.</small></div><div><button type="button" className="prototype-primary" onClick={() => dispatch({ type: 'START', practice: false })}>Comenzar turno</button><button type="button" className="prototype-secondary" onClick={() => dispatch({ type: 'START', practice: true })}>Practicar</button></div></section>}
      <div className="factory-scoreboard"><span>📥 {queuedOrders.length} en cola</span><span>⚙ {state.stations.filter((station) => station.orderId).length} en estaciones</span><strong>✓ {state.orders.filter((order) => order.status === 'done').length} despachadas</strong></div>
      <p className="prototype-metaphor prototype-metaphor--compact">Seleccioná un archivo → llamada correcta. Al terminar, movelo desde esa estación al siguiente paso.</p>
      <div className="factory-layout">
        <section className="factory-orders" aria-labelledby="factory-orders-title"><h2 id="factory-orders-title"><span aria-hidden="true">🧾</span> Pedidos en cola <b>{queuedOrders.length}</b></h2>{queuedOrders.map((order) => <OrderCard key={order.id} order={order} selected={state.selectedId === order.id} enabled={state.started} onSelect={() => dispatch({ type: 'SELECT', orderId: order.id })} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(order.id))} />)}</section>
        <section className="factory-floor" aria-labelledby="factory-floor-title"><div className="factory-floor-heading"><h2 id="factory-floor-title">Línea de producción</h2><span>{state.selectedId ? 'Archivo #' + state.selectedId + ' en mano' : 'Elegí un archivo'}</span></div><div className="factory-stations">{state.stations.map((station) => {
          const activeOrder = state.orders.find((order) => order.id === station.orderId)
          const progress = station.orderId && !station.readyToMove ? ((station.duration - station.remaining) / station.duration) * 100 : 100
          const clickable = Boolean(activeOrder?.status === 'ready' || (!station.orderId && state.selectedId))
          return <button type="button" draggable={activeOrder?.status === 'ready'} key={station.id} className={'factory-station station-' + station.id + (station.orderId ? ' is-busy' : '') + (station.readyToMove ? ' is-ready' : '') + (state.selectedId === station.orderId ? ' is-selected-file' : '')} disabled={!state.started || !clickable} onClick={() => activeOrder?.status === 'ready' ? dispatch({ type: 'SELECT', orderId: activeOrder.id }) : state.selectedId && dispatch({ type: 'ASSIGN', orderId: state.selectedId, stationId: station.id })} onDragStart={(event) => activeOrder && event.dataTransfer.setData('text/plain', String(activeOrder.id))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, station.id)}><span className="factory-station-icon" aria-hidden="true">{station.icon}</span><b>{station.label}</b><small className="factory-station-action">{station.action}</small>{activeOrder ? <div className="factory-station-file"><strong>{activeOrder.name}</strong><small>{station.readyToMove ? 'LISTO · mover a ' + activeOrder.sequence[activeOrder.step].toUpperCase() : station.remaining + 's · procesando'}</small>{!station.readyToMove && <i><b style={{ width: progress + '%' }} /></i>}</div> : <><strong>LIBRE</strong><small>Soltá aquí</small></>}</button>
        })}</div><p className={'prototype-feedback is-' + state.feedbackTone} role="status" aria-live="polite">{state.message}</p></section>
      </div>
    </main>
  )
}

function OrderCard({ order, selected, enabled, onSelect, onDragStart }: { order: FactoryOrder; selected: boolean; enabled: boolean; onSelect: () => void; onDragStart: (event: DragEvent<HTMLButtonElement>) => void }) {
  return <button type="button" draggable={enabled} disabled={!enabled} className={'factory-order' + (selected ? ' is-selected' : '')} onClick={onSelect} onDragStart={onDragStart}><span>Pedido #{order.id}</span><div className="factory-order-title"><i aria-hidden="true">▤</i><strong>{order.name}</strong></div><small>{order.task}</small><em>{order.permission}</em><div className="factory-sequence">{order.sequence.map((step, index) => <b key={step + index} className={index === order.step ? 'is-current' : ''}>{step}</b>)}</div><strong className="factory-next">LLEVÁ A {order.sequence[order.step].toUpperCase()}</strong></button>
}
