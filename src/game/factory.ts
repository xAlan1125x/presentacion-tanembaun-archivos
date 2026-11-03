import { recordEvaluation } from './rules'
import type { GameEvaluation, PersistenceResult, Phase5State } from './types'

export type FactoryStationId = 'open' | 'read' | 'write' | 'close' | 'delete' | 'create' | 'seek' | 'rename'
export type FactoryOrderStatus = 'waiting' | 'processing' | 'ready' | 'done'

export interface FactoryOrderTemplate { name: string; task: string; permission: string; sequence: FactoryStationId[] }
export interface FactoryOrder extends FactoryOrderTemplate { id: number; step: number; status: FactoryOrderStatus }
export interface FactoryStation { id: FactoryStationId; label: string; action: string; icon: string; duration: number; orderId?: number; remaining: number; readyToMove: boolean }
export interface FactoryState {
  started: boolean
  finished: boolean
  resultSaved: boolean
  elapsed: number
  remaining: number
  deadlineAt?: number
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
export type FactoryAction =
  | { type: 'START'; now: number }
  | { type: 'RESET' }
  | { type: 'SELECT'; orderId: number }
  | { type: 'ASSIGN'; orderId: number; stationId: FactoryStationId }
  | { type: 'TICK'; now: number }
  | { type: 'MARK_SAVED' }
export interface FactoryEvaluation extends GameEvaluation { completedOrders: number; errors: number }

export const FACTORY_DURATION = 105
export const FACTORY_POINTS_PER_ORDER = 25
export const FACTORY_ERROR_PENALTY = 5
export const FACTORY_ACTIVE_STATE_VERSION = 1
export const factoryActiveStorageKey = (scopeId: string) => `filelab:factory:active:v1:${scopeId}`

export const FACTORY_ORDER_TEMPLATES: FactoryOrderTemplate[] = [
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

export const FACTORY_STATIONS: FactoryStation[] = [
  { id: 'open', label: 'OPEN', action: 'Abrir', icon: '↗', duration: 2, remaining: 0, readyToMove: false },
  { id: 'read', label: 'READ', action: 'Leer', icon: '👁', duration: 3, remaining: 0, readyToMove: false },
  { id: 'write', label: 'WRITE', action: 'Escribir', icon: '✎', duration: 4, remaining: 0, readyToMove: false },
  { id: 'close', label: 'CLOSE', action: 'Cerrar', icon: '×', duration: 2, remaining: 0, readyToMove: false },
  { id: 'delete', label: 'DELETE', action: 'Eliminar', icon: '⌫', duration: 3, remaining: 0, readyToMove: false },
  { id: 'create', label: 'CREATE', action: 'Crear', icon: '＋', duration: 3, remaining: 0, readyToMove: false },
  { id: 'seek', label: 'SEEK', action: 'Saltar', icon: '↪', duration: 2, remaining: 0, readyToMove: false },
  { id: 'rename', label: 'RENAME', action: 'Renombrar', icon: 'Aa', duration: 3, remaining: 0, readyToMove: false },
]

export function createFactoryOrderPlan(startId = 1, random = Math.random): FactoryOrder[] {
  const shuffled = [...FACTORY_ORDER_TEMPLATES]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
  }
  return shuffled.map((template, index) => ({ ...template, sequence: [...template.sequence], id: startId + index, step: 0, status: 'waiting' }))
}

export function createInitialFactoryState(random = Math.random): FactoryState {
  const orderPlan = createFactoryOrderPlan(1, random)
  return {
    started: false, finished: false, resultSaved: false, elapsed: 0, remaining: FACTORY_DURATION,
    orders: orderPlan.slice(0, 2), stations: FACTORY_STATIONS.map((station) => ({ ...station })),
    score: 0, errors: 0, message: 'Tomá una orden y llevala a su primera llamada.', feedbackTone: 'neutral',
    pendingOrders: orderPlan.slice(2), nextOrderId: orderPlan.length + 1, nextArrivalAt: 10,
  }
}

function penalize(state: FactoryState, message: string): FactoryState {
  return { ...state, errors: state.errors + 1, score: Math.max(0, state.score - FACTORY_ERROR_PENALTY), message: `−${FACTORY_ERROR_PENALTY} · ${message}`, feedbackTone: 'error' }
}

export function factoryReducer(state: FactoryState, action: FactoryAction): FactoryState {
  if (action.type === 'RESET') return createInitialFactoryState()
  if (action.type === 'START') {
    const base = !state.started && !state.finished ? state : createInitialFactoryState()
    return { ...base, started: true, deadlineAt: action.now + base.remaining * 1_000 }
  }
  if (action.type === 'MARK_SAVED') return { ...state, resultSaved: true }
  if (action.type === 'SELECT') {
    const order = state.orders.find((candidate) => candidate.id === action.orderId)
    return state.started && order && (order.status === 'waiting' || order.status === 'ready')
      ? { ...state, selectedId: action.orderId, message: `${order.name} seleccionado. Próximo paso: ${order.sequence[order.step].toUpperCase()}.`, feedbackTone: 'neutral' }
      : state
  }
  if (state.finished) return state
  if (action.type === 'ASSIGN') {
    if (!state.started) return state
    const order = state.orders.find((candidate) => candidate.id === action.orderId)
    const station = state.stations.find((candidate) => candidate.id === action.stationId)
    if (!order || !station || (order.status !== 'waiting' && order.status !== 'ready')) return state
    if (station.orderId) return penalize(state, `${station.label} está ocupada. Elegí otra orden o liberá esa estación.`)
    const expected = order.sequence[order.step]
    if (expected !== action.stationId) {
      const rule = action.stationId === 'read' || action.stationId === 'write' ? ' READ y WRITE requieren OPEN antes.' : ''
      return penalize(state, `Secuencia incorrecta: el próximo paso es ${expected.toUpperCase()}.${rule}`)
    }
    const sourceId = state.stations.find((candidate) => candidate.orderId === order.id)?.id
    return {
      ...state, selectedId: undefined,
      orders: state.orders.map((candidate) => candidate.id === order.id ? { ...candidate, status: 'processing' } : candidate),
      stations: state.stations.map((candidate) => {
        if (candidate.id === sourceId) return { ...candidate, orderId: undefined, remaining: 0, readyToMove: false }
        if (candidate.id === station.id) return { ...candidate, orderId: order.id, remaining: candidate.duration, readyToMove: false }
        return candidate
      }),
      message: `${order.name} está procesándose en ${station.label}.`, feedbackTone: 'neutral',
    }
  }
  if (action.type === 'TICK') {
    if (!state.started) return state
    const deadlineAt = state.deadlineAt ?? action.now + state.remaining * 1_000
    const remaining = Math.max(0, Math.ceil((deadlineAt - action.now) / 1_000))
    const elapsed = FACTORY_DURATION - remaining
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
        score += FACTORY_POINTS_PER_ORDER
        message = `+${FACTORY_POINTS_PER_ORDER} · ${order.name} completado y despachado.`
        return { ...station, orderId: undefined, remaining: 0, readyToMove: false }
      }
      order.status = 'ready'
      message = `${station.label} terminó. Mové ${order.name} a ${order.sequence[order.step].toUpperCase()}.`
      return { ...station, remaining: 0, readyToMove: true }
    })
    let pendingOrders = state.pendingOrders
    let nextOrderId = state.nextOrderId
    let nextArrivalAt = state.nextArrivalAt
    if (elapsed >= 55 && nextArrivalAt > elapsed + 4) nextArrivalAt = elapsed + 4
    if (elapsed >= nextArrivalAt && remaining > 0) {
      if (pendingOrders.length === 0) {
        pendingOrders = createFactoryOrderPlan(nextOrderId)
        nextOrderId += pendingOrders.length
      }
      orders = [...orders, pendingOrders[0]]
      pendingOrders = pendingOrders.slice(1)
      nextArrivalAt = elapsed + (elapsed < 35 ? 10 : elapsed < 55 ? 7 : 4)
      message = 'Llegó un nuevo pedido a la cola.'
      feedbackTone = 'neutral'
    } else if (completedOperation) feedbackTone = 'success'
    return { ...state, deadlineAt, elapsed, remaining, orders, stations, score, message, feedbackTone, pendingOrders, nextOrderId, nextArrivalAt, finished: remaining === 0 }
  }
  return state
}

export function evaluateFactory(state: FactoryState): FactoryEvaluation {
  const completedOrders = state.orders.filter((order) => order.status === 'done').length
  return { score: Math.max(0, Math.round(state.score)), completed: state.finished, explanation: `Completaste ${completedOrders} pedido(s) y registraste ${state.errors} error(es) durante 105 segundos.`, completedOrders, errors: state.errors }
}

export function saveFactoryEvaluation(state: Phase5State, evaluation: FactoryEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'escape-room', evaluation, now)
}

interface StoredFactoryState { version: typeof FACTORY_ACTIVE_STATE_VERSION; state: FactoryState }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function isFactoryState(value: unknown): value is FactoryState {
  if (!isRecord(value)) return false
  return typeof value.started === 'boolean' && typeof value.finished === 'boolean' && typeof value.resultSaved === 'boolean' &&
    Number.isInteger(value.elapsed) && Number.isInteger(value.remaining) && Number.isInteger(value.score) && Number(value.score) >= 0 &&
    Number.isInteger(value.errors) && Number(value.errors) >= 0 && typeof value.message === 'string' &&
    ['neutral', 'success', 'error'].includes(String(value.feedbackTone)) && Array.isArray(value.orders) &&
    Array.isArray(value.stations) && Array.isArray(value.pendingOrders) && typeof value.nextOrderId === 'number' &&
    typeof value.nextArrivalAt === 'number' && (value.deadlineAt === undefined || typeof value.deadlineAt === 'number')
}

export function createFactoryStateStore(storage: Storage, key: string) {
  return {
    load(): PersistenceResult<FactoryState | null> {
      try {
        const raw = storage.getItem(key)
        if (!raw) return { ok: true, value: null }
        const parsed: unknown = JSON.parse(raw)
        if (!isRecord(parsed) || parsed.version !== FACTORY_ACTIVE_STATE_VERSION || !isFactoryState(parsed.state)) return { ok: false, error: 'La partida activa de Factory no tiene un formato compatible.' }
        return { ok: true, value: (parsed as unknown as StoredFactoryState).state }
      } catch { return { ok: false, error: 'No se pudo recuperar la partida activa de Factory.' } }
    },
    save(state: FactoryState): PersistenceResult<void> {
      try { storage.setItem(key, JSON.stringify({ version: FACTORY_ACTIVE_STATE_VERSION, state } satisfies StoredFactoryState)); return { ok: true, value: undefined } }
      catch { return { ok: false, error: 'No se pudo guardar la partida activa de Factory.' } }
    },
    clear(): PersistenceResult<void> {
      try { storage.removeItem(key); return { ok: true, value: undefined } }
      catch { return { ok: false, error: 'No se pudo borrar la partida activa de Factory.' } }
    },
  }
}
