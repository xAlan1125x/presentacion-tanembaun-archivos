import { FileLabSession, type LabSessionSnapshot } from '../lab'
import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export type CopyChallengeAction = 'open-source' | 'prepare-destination' | 'read' | 'write' | 'write-wrong-count' | 'close-source' | 'close-destination'

export interface CopyChallengeActionRecord {
  id: number
  name: CopyChallengeAction
  ok: boolean
  message: string
}

export interface CopyChallengeSnapshot {
  lab: LabSessionSnapshot
  sourceDescriptor?: number
  destinationDescriptor?: number
  pendingBytes: Uint8Array
  bytesCopied: number
  reads: number
  writes: number
  eofReached: boolean
  completed: boolean
  actions: CopyChallengeActionRecord[]
  hintsUsed: string[]
  message: string
}

export const COPYFILE_HINTS = [
  { id: 'buffer', text: 'Después de read, usá sólo los bytes válidos del búfer.', penaltyPoints: 5 },
  { id: 'partial', text: 'Si write transfiere menos, repetí write con los bytes pendientes.', penaltyPoints: 5 },
  { id: 'eof', text: 'EOF exitoso con 0 bytes termina el ciclo; no es un error.', penaltyPoints: 5 },
]

export interface CopyChallengeEvaluation extends GameEvaluation {
  bytesMatch: boolean
  eofReached: boolean
  descriptorsClosed: boolean
  failedActionCount: number
  hintsUsed: string[]
}

const bytesEqual = (left: Uint8Array | undefined, right: Uint8Array | undefined) =>
  Boolean(left && right && left.length === right.length && left.every((byte, index) => byte === right[index]))

export class CopyfileChallenge {
  private session = new FileLabSession('copyfile-challenge')
  private pendingBytes = new Uint8Array()
  private sourceDescriptor?: number
  private destinationDescriptor?: number
  private bytesCopied = 0
  private reads = 0
  private writes = 0
  private eofReached = false
  private actions: CopyChallengeActionRecord[] = []
  private hintsUsed: string[] = []
  private message = 'Abrí el origen para comenzar la copia.'

  snapshot(): CopyChallengeSnapshot {
    return {
      lab: this.session.snapshot(),
      sourceDescriptor: this.sourceDescriptor,
      destinationDescriptor: this.destinationDescriptor,
      pendingBytes: this.pendingBytes.slice(),
      bytesCopied: this.bytesCopied,
      reads: this.reads,
      writes: this.writes,
      eofReached: this.eofReached,
      completed: this.canComplete(),
      actions: this.actions.map((action) => ({ ...action })),
      hintsUsed: [...this.hintsUsed],
      message: this.message,
    }
  }

  restore(): CopyChallengeSnapshot {
    this.session = new FileLabSession('copyfile-challenge')
    this.pendingBytes = new Uint8Array()
    this.sourceDescriptor = undefined
    this.destinationDescriptor = undefined
    this.bytesCopied = 0
    this.reads = 0
    this.writes = 0
    this.eofReached = false
    this.actions = []
    this.hintsUsed = []
    this.message = 'Escenario restaurado. El destino vuelve a contener datos viejos.'
    return this.snapshot()
  }

  openSource(): CopyChallengeSnapshot {
    if (this.sourceDescriptor !== undefined) return this.record('open-source', false, 'El origen ya está abierto; cerralo antes de volver a abrirlo.')
    const result = this.session.open('source', 'read')
    if (result.ok) this.sourceDescriptor = result.value.descriptor
    return this.record('open-source', result.ok, result.ok ? `open devolvió fd ${result.value.descriptor}.` : result.error.message)
  }

  prepareDestination(): CopyChallengeSnapshot {
    if (this.destinationDescriptor !== undefined) return this.record('prepare-destination', false, 'El destino ya está preparado; cerralo antes de volver a crearlo.')
    const result = this.session.creatFile('destino-reto.bin')
    if (result.ok) this.destinationDescriptor = result.value.descriptor
    return this.record('prepare-destination', result.ok, result.ok ? `creat truncó el destino y devolvió fd ${result.value.descriptor}.` : result.error.message)
  }

  read(): CopyChallengeSnapshot {
    if (this.sourceDescriptor === undefined) return this.record('read', false, 'Abrí el origen antes de leer.')
    const result = this.session.read(this.sourceDescriptor, 4_096)
    if (!result.ok) return this.record('read', false, result.error.message)
    this.reads += 1
    if (result.value.outcome === 'eof') {
      this.eofReached = true
      this.pendingBytes = new Uint8Array()
      return this.record('read', true, 'EOF exitoso: read devolvió 0 bytes y la copia puede terminar.')
    }
    this.pendingBytes = result.value.buffer.data.slice(0, result.value.buffer.validLength)
    return this.record('read', true, `read transfirió ${result.value.bytesTransferred} byte(s) válidos al búfer.`)
  }

  write(): CopyChallengeSnapshot {
    if (this.destinationDescriptor === undefined) return this.record('write', false, 'Prepará el destino antes de escribir.')
    if (this.pendingBytes.length === 0) return this.record('write', false, 'No hay bytes pendientes: leé otro bloque o verificá EOF.')
    const requested = this.pendingBytes.length
    const result = this.session.write(this.destinationDescriptor, this.pendingBytes)
    if (!result.ok) return this.record('write', false, result.error.message)
    this.writes += 1
    this.bytesCopied += result.value.bytesTransferred
    this.pendingBytes = this.pendingBytes.slice(result.value.bytesTransferred)
    return this.record('write', true, result.value.partial ? `write fue parcial: transfirió ${result.value.bytesTransferred}/${requested}; quedan ${this.pendingBytes.length}.` : `write transfirió ${result.value.bytesTransferred} byte(s).`)
  }

  writeWrongCount(): CopyChallengeSnapshot {
    if (this.destinationDescriptor === undefined || this.pendingBytes.length === 0) return this.record('write-wrong-count', false, 'Necesitás destino abierto y bytes pendientes para probar una cantidad incorrecta.')
    const result = this.session.write(this.destinationDescriptor, this.pendingBytes, this.pendingBytes.length + 1)
    return this.record('write-wrong-count', result.ok, result.ok ? 'La escritura aceptó una cantidad inesperada.' : `Error controlado: ${result.error.message}`)
  }

  closeSource(): CopyChallengeSnapshot {
    if (this.sourceDescriptor === undefined) return this.record('close-source', false, 'El origen no está abierto.')
    const result = this.session.close(this.sourceDescriptor)
    if (result.ok) this.sourceDescriptor = undefined
    return this.record('close-source', result.ok, result.ok ? 'Descriptor de origen cerrado.' : result.error.message)
  }

  closeDestination(): CopyChallengeSnapshot {
    if (this.destinationDescriptor === undefined) return this.record('close-destination', false, 'El destino no está abierto.')
    const result = this.session.close(this.destinationDescriptor)
    if (result.ok) this.destinationDescriptor = undefined
    return this.record('close-destination', result.ok, result.ok ? 'Descriptor de destino cerrado.' : result.error.message)
  }

  useHint(id: string): CopyChallengeSnapshot {
    const hint = COPYFILE_HINTS.find((item) => item.id === id)
    if (hint && !this.hintsUsed.includes(id)) {
      this.hintsUsed.push(id)
      this.message = `${hint.text} Penalización: ${hint.penaltyPoints} puntos.`
    }
    return this.snapshot()
  }

  evaluate(): CopyChallengeEvaluation {
    const snapshot = this.snapshot()
    const source = snapshot.lab.engine.files.find((file) => file.id === 'source')?.content
    const destination = snapshot.lab.engine.files.find((file) => file.id === 'destination')?.content
    const bytesMatch = bytesEqual(source, destination)
    const descriptorsClosed = snapshot.lab.engine.processes.every((process) => process.openFiles.length === 0)
    const penaltyPoints = this.hintsUsed.reduce((sum, id) => sum + (COPYFILE_HINTS.find((hint) => hint.id === id)?.penaltyPoints ?? 0), 0)
    const completed = bytesMatch && snapshot.eofReached && descriptorsClosed
    const explanation = completed
      ? 'Copia correcta: el destino coincide byte a byte con el origen, EOF fue tratado como éxito y ambos descriptores quedaron cerrados.'
      : `La copia aún no es válida: ${bytesMatch ? '' : 'el destino no coincide con el origen; '}${snapshot.eofReached ? '' : 'falta alcanzar EOF; '}${descriptorsClosed ? '' : 'quedan descriptores abiertos.'}`
    return {
      ...evaluateResolution({ resolutionQuality: completed ? 1 : Math.min(0.99, (bytesMatch ? 0.4 : 0) + (snapshot.eofReached ? 0.3 : 0) + (descriptorsClosed ? 0.3 : 0)), completed, penaltyPoints }, explanation),
      bytesMatch,
      eofReached: snapshot.eofReached,
      descriptorsClosed,
      failedActionCount: this.actions.filter((action) => !action.ok).length,
      hintsUsed: [...this.hintsUsed],
    }
  }

  private canComplete(): boolean {
    const snapshot = this.session.snapshot()
    const source = snapshot.engine.files.find((file) => file.id === 'source')?.content
    const destination = snapshot.engine.files.find((file) => file.id === 'destination')?.content
    return bytesEqual(source, destination) && this.eofReached && snapshot.engine.processes.every((process) => process.openFiles.length === 0)
  }

  private record(name: CopyChallengeAction, ok: boolean, message: string): CopyChallengeSnapshot {
    this.actions.push({ id: this.actions.length + 1, name, ok, message })
    this.message = message
    return this.snapshot()
  }
}

export function saveCopyChallengeEvaluation(state: Phase5State, evaluation: CopyChallengeEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'copyfile-challenge', evaluation, now)
}
