import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export type ChaosProcessId = 'p1' | 'p2' | 'p3'
export type ChaosFileId = 'informe.dat' | 'registro.log'
export type ChaosOperation = 'read' | 'write'
export type ChaosProcessStatus = 'idle' | 'ready' | 'waiting' | 'running' | 'release'

export interface ChaosRequest {
  id: string
  processId: ChaosProcessId
  fileId: ChaosFileId
  operation: ChaosOperation
  availableAt: number
  duration: number
}

export const CHAOS_REQUESTS: readonly ChaosRequest[] = [
  { id: 'r1', processId: 'p1', fileId: 'informe.dat', operation: 'read', availableAt: 0, duration: 3 },
  { id: 'r2', processId: 'p2', fileId: 'registro.log', operation: 'write', availableAt: 0, duration: 4 },
  { id: 'r3', processId: 'p3', fileId: 'informe.dat', operation: 'write', availableAt: 5, duration: 4 },
  { id: 'r4', processId: 'p1', fileId: 'registro.log', operation: 'read', availableAt: 12, duration: 3 },
  { id: 'r5', processId: 'p2', fileId: 'informe.dat', operation: 'write', availableAt: 20, duration: 4 },
  { id: 'r6', processId: 'p3', fileId: 'registro.log', operation: 'read', availableAt: 28, duration: 3 },
  { id: 'r7', processId: 'p1', fileId: 'informe.dat', operation: 'write', availableAt: 36, duration: 4 },
  { id: 'r8', processId: 'p2', fileId: 'registro.log', operation: 'read', availableAt: 44, duration: 3 },
  { id: 'r9', processId: 'p3', fileId: 'informe.dat', operation: 'read', availableAt: 52, duration: 3 },
]

interface ActiveUse {
  requestId: string
  remainingSeconds: number
}

export interface ChaosProcessSnapshot {
  id: ChaosProcessId
  name: string
  status: ChaosProcessStatus
  request?: ChaosRequest
}

export interface ChaosFileSnapshot {
  id: ChaosFileId
  label: string
  holder?: ChaosProcessId
  remainingSeconds: number
  readyToRelease: boolean
}

export interface EscapeRoomSnapshot {
  elapsedSeconds: number
  remainingSeconds: number
  processes: ChaosProcessSnapshot[]
  files: ChaosFileSnapshot[]
  completedCount: number
  totalRequests: number
  score: number
  penalties: number
  failedActionCount: number
  message: string
  finished: boolean
}

export interface EscapeRoomEvaluation extends GameEvaluation {
  completedRequests: number
  penalties: number
  failedActionCount: number
}

const PROCESS_NAMES: Record<ChaosProcessId, string> = {
  p1: 'Proceso 1',
  p2: 'Proceso 2',
  p3: 'Proceso 3',
}

const FILE_LABELS: Record<ChaosFileId, string> = {
  'informe.dat': 'Informe de datos',
  'registro.log': 'Registro del sistema',
}

const GAME_SECONDS = 90
const ERROR_PENALTY = 5
const POINTS_PER_REQUEST = 20
const COMPLETION_BONUS = 20

export class EscapeRoomGame {
  private elapsedSeconds = 0
  private completed = new Set<string>()
  private active = new Map<ChaosFileId, ActiveUse>()
  private penalties = 0
  private failedActionCount = 0
  private finished = false
  private message = 'Elegí un proceso y asignale el archivo que solicita.'

  snapshot(): EscapeRoomSnapshot {
    return {
      elapsedSeconds: this.elapsedSeconds,
      remainingSeconds: Math.max(0, GAME_SECONDS - this.elapsedSeconds),
      processes: (Object.keys(PROCESS_NAMES) as ChaosProcessId[]).map((id) => this.processSnapshot(id)),
      files: (Object.keys(FILE_LABELS) as ChaosFileId[]).map((id) => this.fileSnapshot(id)),
      completedCount: this.completed.size,
      totalRequests: CHAOS_REQUESTS.length,
      score: this.score(),
      penalties: this.penalties,
      failedActionCount: this.failedActionCount,
      message: this.message,
      finished: this.finished,
    }
  }

  assign(processId: ChaosProcessId, fileId: ChaosFileId): EscapeRoomSnapshot {
    if (this.finished) return this.snapshot()

    const request = this.currentRequest(processId)
    if (!request || request.availableAt > this.elapsedSeconds) {
      return this.fail('Ese proceso todavía no tiene una solicitud disponible.')
    }
    if (this.findActiveByProcess(processId)) {
      return this.fail(PROCESS_NAMES[processId] + ' ya está trabajando con un archivo.')
    }
    if (request.fileId !== fileId) {
      return this.fail(PROCESS_NAMES[processId] + ' necesita ' + request.fileId + ', no ese archivo.')
    }
    if (this.active.has(fileId)) {
      return this.fail(fileId + ' está ocupado: el proceso debe esperar hasta que se libere.')
    }

    this.active.set(fileId, { requestId: request.id, remainingSeconds: request.duration })
    this.message = 'open: ' + PROCESS_NAMES[processId] + ' inició ' + request.operation + ' sobre ' + fileId + '.'
    return this.snapshot()
  }

  release(fileId: ChaosFileId): EscapeRoomSnapshot {
    if (this.finished) return this.snapshot()

    const use = this.active.get(fileId)
    if (!use) return this.fail(fileId + ' ya está libre.')
    if (use.remainingSeconds > 0) {
      return this.fail('La operación aún no terminó. Esperá antes de cerrar y liberar el archivo.')
    }

    this.active.delete(fileId)
    this.completed.add(use.requestId)
    this.message = 'close: solicitud completada y ' + fileId + ' quedó disponible.'
    if (this.completed.size === CHAOS_REQUESTS.length) {
      this.finished = true
      this.message = '¡Sistema organizado! Completaste todas las solicitudes.'
    }
    return this.snapshot()
  }

  tick(seconds = 1): EscapeRoomSnapshot {
    if (this.finished || seconds <= 0) return this.snapshot()

    const advance = Math.min(seconds, GAME_SECONDS - this.elapsedSeconds)
    this.elapsedSeconds += advance
    for (const use of this.active.values()) {
      use.remainingSeconds = Math.max(0, use.remainingSeconds - advance)
    }
    if (this.elapsedSeconds >= GAME_SECONDS) {
      this.finished = true
      this.message = 'Tiempo terminado. Las solicitudes completadas determinan tu puntuación.'
    }
    return this.snapshot()
  }

  restore(): EscapeRoomSnapshot {
    this.elapsedSeconds = 0
    this.completed.clear()
    this.active.clear()
    this.penalties = 0
    this.failedActionCount = 0
    this.finished = false
    this.message = 'Elegí un proceso y asignale el archivo que solicita.'
    return this.snapshot()
  }

  evaluate(): EscapeRoomEvaluation {
    const score = this.score()
    const base = evaluateResolution(
      { resolutionQuality: score / 200, completed: this.finished },
      'Cada archivo admite un solo proceso a la vez en este modelo didáctico. Abrir, usar y cerrar libera el recurso para la siguiente solicitud.',
    )
    return {
      ...base,
      score,
      completedRequests: this.completed.size,
      penalties: this.penalties,
      failedActionCount: this.failedActionCount,
    }
  }

  private score(): number {
    const bonus = this.completed.size === CHAOS_REQUESTS.length ? COMPLETION_BONUS : 0
    return Math.max(0, Math.min(200, this.completed.size * POINTS_PER_REQUEST + bonus - this.penalties))
  }

  private fail(message: string): EscapeRoomSnapshot {
    this.penalties += ERROR_PENALTY
    this.failedActionCount += 1
    this.message = message + ' −' + ERROR_PENALTY + ' puntos.'
    return this.snapshot()
  }

  private currentRequest(processId: ChaosProcessId): ChaosRequest | undefined {
    const activeUse = this.findActiveByProcess(processId)
    if (activeUse) return CHAOS_REQUESTS.find((request) => request.id === activeUse[1].requestId)
    return CHAOS_REQUESTS.find(
      (request) => request.processId === processId && !this.completed.has(request.id),
    )
  }

  private findActiveByProcess(processId: ChaosProcessId): [ChaosFileId, ActiveUse] | undefined {
    return [...this.active.entries()].find(([, use]) => {
      const request = CHAOS_REQUESTS.find((candidate) => candidate.id === use.requestId)
      return request?.processId === processId
    })
  }

  private processSnapshot(id: ChaosProcessId): ChaosProcessSnapshot {
    const request = this.currentRequest(id)
    if (!request || request.availableAt > this.elapsedSeconds) {
      return { id, name: PROCESS_NAMES[id], status: 'idle', request }
    }

    const activeUse = this.findActiveByProcess(id)
    if (activeUse) {
      return {
        id,
        name: PROCESS_NAMES[id],
        status: activeUse[1].remainingSeconds === 0 ? 'release' : 'running',
        request,
      }
    }

    return {
      id,
      name: PROCESS_NAMES[id],
      status: this.active.has(request.fileId) ? 'waiting' : 'ready',
      request,
    }
  }

  private fileSnapshot(id: ChaosFileId): ChaosFileSnapshot {
    const use = this.active.get(id)
    const request = use ? CHAOS_REQUESTS.find((candidate) => candidate.id === use.requestId) : undefined
    return {
      id,
      label: FILE_LABELS[id],
      holder: request?.processId,
      remainingSeconds: use?.remainingSeconds ?? 0,
      readyToRelease: Boolean(use && use.remainingSeconds === 0),
    }
  }
}

export function saveEscapeRoomEvaluation(
  state: Phase5State,
  evaluation: EscapeRoomEvaluation,
  now?: string,
): Phase5State {
  return recordEvaluation(state, 'escape-room', evaluation, now)
}
