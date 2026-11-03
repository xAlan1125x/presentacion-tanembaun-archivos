import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../game'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../client', () => ({ supabase: { rpc: mocks.rpc } }))

import { joinSession, loadParticipantRunState, loadSessionParticipantSummary, loadSessionRanking, saveParticipantRunState } from '../service'

beforeEach(() => mocks.rpc.mockReset())

describe('contratos Supabase de recorridos v3', () => {
  it('recibe el recorrido inicial junto con la identidad al ingresar', async () => {
    const state = createInitialState('Ada', '2026-11-03T00:00:00.000Z', 'server-run')
    mocks.rpc.mockResolvedValue({ data: [{ participant_id: 'p-1', session_id: 's-1', nickname: 'Ada', finished_at: null, rules_version: 3, run_state: state }], error: null })

    const result = await joinSession('a1b2c3d4', ' Ada ')

    expect(result).toMatchObject({ participantId: 'p-1', sessionId: 's-1', rulesVersion: 3, state })
    expect(mocks.rpc).toHaveBeenCalledWith('join_game_session', { requested_code: 'A1B2C3D4', participant_nickname: 'Ada' })
  })

  it('envía y recupera el estado completo usando el participante indicado', async () => {
    const state = createInitialState('Ada', '2026-11-03T00:00:00.000Z', 'run-1')
    mocks.rpc.mockResolvedValueOnce({ data: state, error: null }).mockResolvedValueOnce({ data: state, error: null })

    await expect(saveParticipantRunState('participant-a', state)).resolves.toEqual({ state, error: null })
    await expect(loadParticipantRunState('participant-a')).resolves.toEqual({ state, error: null })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'save_participant_run_state_v3', { target_participant_id: 'participant-a', next_state: state })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_participant_run_state_v3', { target_participant_id: 'participant-a' })
  })

  it('mapea el ranking sin perder el subtotal académico ni Factory', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ position: 1, nickname: 'Lin', academic_score: 360, factory_score: 175, total_score: 535 }], error: null })

    const result = await loadSessionRanking('session-a')

    expect(mocks.rpc).toHaveBeenCalledWith('get_session_ranking', { target_session_id: 'session-a' })
    expect(result.ranking).toEqual([{ position: 1, nickname: 'Lin', academicScore: 360, factoryScore: 175, totalScore: 535 }])
  })

  it('consulta el panel docente dentro de una única sesión', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ participant_id: 'p-1', nickname: 'Sol', finished_at: null, academic_score: 280, factory_score: 100, total_score: 380 }], error: null })

    const result = await loadSessionParticipantSummary('session-b')

    expect(mocks.rpc).toHaveBeenCalledWith('get_session_participant_summary', { target_session_id: 'session-b' })
    expect(result.participants[0]).toMatchObject({ participantId: 'p-1', academicScore: 280, factoryScore: 100, totalScore: 380 })
  })
})
