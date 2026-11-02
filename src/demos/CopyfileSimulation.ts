import { FileLabSession, type LabSessionSnapshot } from '../lab'

export type CopyAction = 'open-source' | 'creat-destination' | 'read' | 'write' | 'close-source' | 'close-destination' | 'done' | 'error'

export interface CopyfileState {
  nextAction: CopyAction
  activeLine: number
  inputDescriptor?: number
  outputDescriptor?: number
  pendingBytes: Uint8Array
  bytesCopied: number
  lastRead: number
  lastWrite: number
  iterations: number
  message: string
  completed: boolean
  error?: string
}

export interface CopyfileSnapshot {
  state: CopyfileState
  lab: LabSessionSnapshot
}

const initialState = (): CopyfileState => ({
  nextAction: 'open-source', activeLine: 1, pendingBytes: new Uint8Array(), bytesCopied: 0,
  lastRead: 0, lastWrite: 0, iterations: 0,
  message: 'Listo para abrir el archivo de origen.', completed: false,
})

export class CopyfileSimulation {
  private session = new FileLabSession('academic-copyfile')
  private state = initialState()

  snapshot(): CopyfileSnapshot {
    return { state: { ...this.state, pendingBytes: this.state.pendingBytes.slice() }, lab: this.session.snapshot() }
  }

  restore(): CopyfileSnapshot {
    this.session = new FileLabSession('academic-copyfile')
    this.state = initialState()
    return this.snapshot()
  }

  next(): CopyfileSnapshot {
    if (this.state.completed || this.state.nextAction === 'error') return this.snapshot()
    switch (this.state.nextAction) {
      case 'open-source': {
        const result = this.session.open('source', 'read')
        if (!result.ok) return this.fail(result.error.message)
        this.state.inputDescriptor = result.value.descriptor
        this.state.activeLine = 2
        this.state.nextAction = 'creat-destination'
        this.state.message = `open devolvió el descriptor ${result.value.descriptor}.`
        break
      }
      case 'creat-destination': {
        const result = this.session.creatFile('copia.bin')
        if (!result.ok) return this.fail(result.error.message)
        this.state.outputDescriptor = result.value.descriptor
        this.state.activeLine = 3
        this.state.nextAction = 'read'
        this.state.message = `creat truncó el destino y devolvió el descriptor ${result.value.descriptor}.`
        break
      }
      case 'read': {
        const result = this.session.read(this.state.inputDescriptor!, 4_096)
        if (!result.ok) return this.fail(result.error.message)
        this.state.lastRead = result.value.bytesTransferred
        this.state.pendingBytes = result.value.buffer.data.slice(0, result.value.buffer.validLength)
        this.state.activeLine = result.value.outcome === 'eof' ? 5 : 4
        if (result.value.outcome === 'eof') {
          this.state.nextAction = 'close-source'
          this.state.message = 'read devolvió EOF con 0 bytes: el ciclo termina sin escribir.'
        } else {
          this.state.nextAction = 'write'
          this.state.message = `read solicitó 4096 y transfirió ${result.value.bytesTransferred} byte(s).`
        }
        break
      }
      case 'write': {
        const result = this.session.write(this.state.outputDescriptor!, this.state.pendingBytes)
        if (!result.ok) return this.fail(result.error.message)
        this.state.lastWrite = result.value.bytesTransferred
        this.state.bytesCopied += result.value.bytesTransferred
        this.state.pendingBytes = this.state.pendingBytes.slice(result.value.bytesTransferred)
        if (this.state.pendingBytes.length > 0) {
          this.state.activeLine = 4
          this.state.message = `write fue parcial: faltan ${this.state.pendingBytes.length} byte(s) de esta lectura.`
        } else {
          this.state.iterations += 1
          this.state.activeLine = 3
          this.state.nextAction = 'read'
          this.state.message = `write recibió exactamente ${result.value.bytesTransferred} byte(s); total copiado: ${this.state.bytesCopied}.`
        }
        break
      }
      case 'close-source': {
        const result = this.session.close(this.state.inputDescriptor!)
        if (!result.ok) return this.fail(result.error.message)
        this.state.activeLine = 6
        this.state.nextAction = 'close-destination'
        this.state.message = 'Descriptor de origen cerrado.'
        break
      }
      case 'close-destination': {
        const result = this.session.close(this.state.outputDescriptor!)
        if (!result.ok) return this.fail(result.error.message)
        this.state.activeLine = 7
        this.state.nextAction = 'done'
        this.state.completed = true
        this.state.message = `Copia terminada: ${this.state.bytesCopied} byte(s) en ${this.state.iterations} iteraciones.`
        break
      }
    }
    return this.snapshot()
  }

  private fail(message: string): CopyfileSnapshot {
    this.state.nextAction = 'error'
    this.state.error = message
    this.state.message = `La simulación se detuvo: ${message}`
    return this.snapshot()
  }
}
