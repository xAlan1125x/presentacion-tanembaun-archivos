import { describe, expect, it } from 'vitest'
import {
  FACTORY_DURATION,
  FACTORY_ORDER_TEMPLATES,
  createFactoryStateStore,
  createInitialFactoryState,
  createInitialState,
  evaluateFactory,
  factoryReducer,
  recordEvaluation,
  saveFactoryEvaluation,
  type FactoryState,
} from '..'

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

function deleteOrderState(): FactoryState {
  const initial = createInitialFactoryState(() => 0)
  return {
    ...initial,
    orders: [{ id: 1, name: 'temporal.tmp', task: 'Eliminar', permission: 'Permitido', sequence: ['delete'], step: 0, status: 'waiting' }],
    pendingOrders: [],
  }
}

describe('FileLab Factory', () => {
  it('usa pedidos de uno a cuatro pasos con secuencias lógicas', () => {
    expect(FACTORY_ORDER_TEMPLATES.every((order) => order.sequence.length >= 1 && order.sequence.length <= 4)).toBe(true)
    for (const order of FACTORY_ORDER_TEMPLATES) {
      for (const operation of ['read', 'write', 'seek'] as const) {
        const index = order.sequence.indexOf(operation)
        if (index >= 0) expect(order.sequence.slice(0, index)).toContain('open')
      }
    }
  })

  it('dura 105 segundos y conserva el límite temporal al recargar', () => {
    const started = factoryReducer(deleteOrderState(), { type: 'START', now: 1_000 })
    const fakeStorage = storage()
    const store = createFactoryStateStore(fakeStorage, 'factory')
    expect(store.save(started).ok).toBe(true)
    const loaded = store.load()
    expect(loaded.ok && loaded.value).toBeTruthy()
    const restored = factoryReducer(loaded.ok ? loaded.value! : started, { type: 'TICK', now: 31_000 })
    expect(FACTORY_DURATION).toBe(105)
    expect(restored.remaining).toBe(75)
  })

  it('mantiene el pedido en la estación hasta completar la operación', () => {
    let state = factoryReducer(deleteOrderState(), { type: 'START', now: 0 })
    state = factoryReducer(state, { type: 'ASSIGN', orderId: 1, stationId: 'delete' })
    expect(state.stations.find((station) => station.id === 'delete')?.orderId).toBe(1)
    state = factoryReducer(state, { type: 'TICK', now: 1_000 })
    state = factoryReducer(state, { type: 'TICK', now: 2_000 })
    expect(state.orders[0].status).toBe('processing')
    state = factoryReducer(state, { type: 'TICK', now: 3_000 })
    expect(state.orders[0].status).toBe('done')
    expect(state.score).toBe(25)
  })

  it('penaliza una llamada incorrecta y admite puntuación abierta', () => {
    let state = factoryReducer(deleteOrderState(), { type: 'START', now: 0 })
    state = factoryReducer(state, { type: 'ASSIGN', orderId: 1, stationId: 'read' })
    expect(state).toMatchObject({ score: 0, errors: 1, feedbackTone: 'error' })
    const unlocked = (['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge'] as const).reduce(
      (progress, gameId) => recordEvaluation(progress, gameId, { score: 100, completed: true, explanation: 'Lista.' }),
      createInitialState('jugador'),
    )
    const phaseState = saveFactoryEvaluation(unlocked, { ...evaluateFactory({ ...state, finished: true, score: 725 }), completed: true })
    expect(phaseState.games['escape-room'].bestScore).toBe(725)
  })

  it('finaliza cuando vence el plazo guardado', () => {
    const started = factoryReducer(deleteOrderState(), { type: 'START', now: 5_000 })
    const finished = factoryReducer(started, { type: 'TICK', now: 110_000 })
    expect(finished).toMatchObject({ remaining: 0, finished: true })
  })
})
