import { describe, expect, it } from 'vitest'
import { createInitialState, createLocalGameStore } from '..'

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

  it('rechaza datos manipulados o incompatibles explícitamente', () => {
    const fakeStorage = storage()
    const store = createLocalGameStore(fakeStorage)
    fakeStorage.setItem('filelab:phase5:progress:v1', '{"version":99}')
    expect(store.load()).toEqual({ ok: false, error: 'El progreso guardado no tiene un formato compatible.' })
  })

  it('permite reiniciar borrando únicamente su clave', () => {
    const fakeStorage = storage()
    const store = createLocalGameStore(fakeStorage)
    store.save(createInitialState('jugador'))
    expect(store.clear()).toEqual({ ok: true, value: undefined })
    expect(store.load()).toEqual({ ok: true, value: null })
  })
})
