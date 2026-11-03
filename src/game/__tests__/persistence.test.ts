import { describe, expect, it } from 'vitest'
import { GAME_IDS, PHASE5_STORAGE_KEY, createInitialState, createLocalGameStore, recordEvaluation } from '..'

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

describe('persistencia local de fase 5', () => {
  it('recupera un estado serializable después de guardar', () => {
    const store = createLocalGameStore(storage())
    const state = createInitialState('jugador', '2026-01-01T00:00:00.000Z')
    expect(store.save(state).ok).toBe(true)
    expect(store.load()).toEqual({ ok: true, value: state })
  })

  it('recupera el recorrido actual y el mejor recorrido completo', () => {
    const store = createLocalGameStore(storage())
    const state = GAME_IDS.reduce(
      (current, gameId, index) => recordEvaluation(current, gameId, { score: index === 4 ? 150 : 100, completed: true, explanation: 'Lista.' }),
      createInitialState('jugador', '2026-01-01T00:00:00.000Z', 'run-persistido'),
    )
    expect(store.save(state).ok).toBe(true)
    const loaded = store.load()
    expect(loaded.ok && loaded.value?.currentRunId).toBe('run-persistido')
    expect(loaded.ok && loaded.value?.bestRun?.totalScore).toBe(550)
  })

  it('rechaza datos manipulados o incompatibles explícitamente', () => {
    const fakeStorage = storage()
    const store = createLocalGameStore(fakeStorage)
    fakeStorage.setItem(PHASE5_STORAGE_KEY, '{"version":99}')
    expect(store.load()).toEqual({ ok: false, error: 'El progreso guardado no tiene un formato compatible.' })
  })

  it('conserva separada la clave anterior para no mezclar puntuaciones', () => {
    const fakeStorage = storage()
    fakeStorage.setItem('filelab:phase5:progress:v1', '{"version":1,"legacy":true}')
    fakeStorage.setItem('filelab:phase5:progress:v2', '{"version":2,"legacy":true}')
    const store = createLocalGameStore(fakeStorage)
    expect(store.load()).toEqual({ ok: true, value: null })
    expect(fakeStorage.getItem('filelab:phase5:progress:v1')).toContain('legacy')
    expect(fakeStorage.getItem('filelab:phase5:progress:v2')).toContain('legacy')
  })

  it('permite reiniciar borrando únicamente su clave', () => {
    const fakeStorage = storage()
    const store = createLocalGameStore(fakeStorage)
    store.save(createInitialState('jugador'))
    expect(store.clear()).toEqual({ ok: true, value: undefined })
    expect(store.load()).toEqual({ ok: true, value: null })
  })
})
