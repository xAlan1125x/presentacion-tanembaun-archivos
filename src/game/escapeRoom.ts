import { FileLabSession, type LabSessionSnapshot } from '../lab'
import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export type EscapeRoomAction = 'inspect' | 'select-file' | 'set-access' | 'open-archive' | 'seek' | 'read-secret' | 'prepare-recovery' | 'write-recovery' | 'verify' | 'close-all'

export interface EscapeRoomActionRecord {
  id: number
  name: EscapeRoomAction
  ok: boolean
  message: string
}

export interface EscapeRoomStep {
  id: string
  title: string
  description: string
  unlocked: boolean
  solved: boolean
  explanation: string
}

export interface EscapeRoomSnapshot {
  lab: LabSessionSnapshot
  selectedFileId?: string
  archiveDescriptor?: number
  recoveryDescriptor?: number
  pendingBytes: Uint8Array
  steps: EscapeRoomStep[]
  actions: EscapeRoomActionRecord[]
  hintsUsed: string[]
  message: string
  completed: boolean
}

export interface EscapeRoomEvaluation extends GameEvaluation {
  solvedStepIds: string[]
  descriptorsClosed: boolean
  bytesRecovered: boolean
  failedActionCount: number
  hintsUsed: string[]
}

export const ESCAPE_ROOM_HINTS = [
  { id: 'identify', text: 'Compará tipo, formato y contenido: el archivo correcto es binario y contiene una cabecera legible.', penaltyPoints: 10 },
  { id: 'access', text: 'readOnly restringe la escritura, no la lectura. Confirmá el modo de apertura que necesitás.', penaltyPoints: 10 },
  { id: 'seek', text: 'La clave comienza después de HEADER|; usá acceso aleatorio para llegar a ese offset.', penaltyPoints: 10 },
  { id: 'verify', text: 'La misión termina cuando recuperacion.txt coincide con los bytes leídos y no quedan descriptores.', penaltyPoints: 10 },
]

const STEPS: EscapeRoomStep[] = [
  { id: 'identify', title: 'Identificar el archivo', description: 'Inspeccioná los candidatos y seleccioná el archivo binario que contiene la evidencia.', unlocked: true, solved: false, explanation: 'La evidencia está en rescate-final.bin: su formato binario y contenido con cabecera lo distinguen del señuelo.' },
  { id: 'access', title: 'Interpretar la protección', description: 'Examiná los atributos y decidí si readOnly impide abrir el archivo para lectura.', unlocked: false, solved: false, explanation: 'readOnly bloquea modificaciones, pero no impide abrir este archivo para lectura. La protección debe interpretarse según la operación solicitada.' },
  { id: 'seek', title: 'Localizar la clave', description: 'Abrí el archivo, reposicioná el cursor y leé el bloque recuperable.', unlocked: false, solved: false, explanation: 'La clave CLAVE-42 ocupa ocho bytes a partir del offset 7, después de HEADER|.' },
  { id: 'recover', title: 'Recuperar la información', description: 'Prepará el archivo de recuperación y escribí los bytes obtenidos.', unlocked: false, solved: false, explanation: 'Los mismos bytes leídos deben escribirse en recuperacion.txt mediante el descriptor del destino.' },
  { id: 'verify', title: 'Verificar y salir', description: 'Comprobá el contenido final y cerrá todos los descriptores.', unlocked: false, solved: false, explanation: 'La misión sólo es válida cuando el destino coincide byte a byte y el sistema no conserva descriptores abiertos.' },
]

export class EscapeRoomGame {
  private session = new FileLabSession('escape-room')
  private selectedFileId?: string
  private archiveDescriptor?: number
  private recoveryDescriptor?: number
  private pendingBytes = new Uint8Array()
  private actions: EscapeRoomActionRecord[] = []
  private hintsUsed: string[] = []
  private message = 'La cámara está bloqueada. Inspeccioná los archivos candidatos.'

  snapshot(): EscapeRoomSnapshot {
    const solved = this.solvedStepIds()
    const steps = STEPS.map((step, index) => ({ ...step, unlocked: index === 0 || solved.includes(STEPS[index - 1].id), solved: solved.includes(step.id) }))
    return { lab: this.session.snapshot(), selectedFileId: this.selectedFileId, archiveDescriptor: this.archiveDescriptor, recoveryDescriptor: this.recoveryDescriptor, pendingBytes: this.pendingBytes.slice(), steps, actions: this.actions.map((action) => ({ ...action })), hintsUsed: [...this.hintsUsed], message: this.message, completed: solved.length === STEPS.length }
  }

  restore(): EscapeRoomSnapshot {
    this.session = new FileLabSession('escape-room')
    this.selectedFileId = undefined
    this.archiveDescriptor = undefined
    this.recoveryDescriptor = undefined
    this.pendingBytes = new Uint8Array()
    this.actions = []
    this.hintsUsed = []
    this.message = 'Escenario restaurado. La misión vuelve al primer objetivo.'
    return this.snapshot()
  }

  inspect(fileId: string): EscapeRoomSnapshot {
    const result = this.session.getAttributes(fileId)
    return this.record('inspect', result.ok, result.ok ? `Atributos inspeccionados: ${fileId}.` : result.error.message)
  }

  selectFile(fileId: string): EscapeRoomSnapshot {
    const file = this.session.snapshot().engine.files.find((candidate) => candidate.id === fileId)
    const correct = Boolean(file && file.id === 'archive' && file.type === 'regular' && file.format === 'binary' && new TextDecoder().decode(file.content).includes('HEADER|'))
    if (correct) this.selectedFileId = fileId
    return this.record('select-file', correct, correct ? 'Archivo candidato confirmado por tipo, formato y contenido.' : 'Ese candidato no reúne las evidencias del archivo de recuperación.')
  }

  setAccess(): EscapeRoomSnapshot {
    if (!this.selectedFileId) return this.record('set-access', false, 'Seleccioná primero el archivo de evidencia.')
    const result = this.session.getAttributes('archive')
    return this.record('set-access', result.ok, result.ok ? 'readOnly está activa: impide escribir, pero permite abrir este archivo en modo lectura.' : result.error.message)
  }

  openArchive(): EscapeRoomSnapshot {
    if (!this.stepSolved('access')) return this.record('open-archive', false, 'Primero resolvé la restricción de acceso.')
    const result = this.session.open('archive', 'read')
    if (result.ok) this.archiveDescriptor = result.value.descriptor
    return this.record('open-archive', result.ok, result.ok ? `Archivo abierto con fd ${result.value.descriptor}.` : result.error.message)
  }

  seek(offset: number): EscapeRoomSnapshot {
    if (this.archiveDescriptor === undefined) return this.record('seek', false, 'Abrí el archivo antes de usar seek.')
    const result = this.session.seek(this.archiveDescriptor, offset)
    return this.record('seek', result.ok, result.ok ? `Cursor reposicionado en ${offset}.` : result.error.message)
  }

  readSecret(): EscapeRoomSnapshot {
    if (this.archiveDescriptor === undefined) return this.record('read-secret', false, 'Abrí el archivo antes de leer.')
    const result = this.session.read(this.archiveDescriptor, 8)
    if (result.ok && result.value.outcome === 'data') this.pendingBytes = result.value.buffer.data.slice(0, result.value.buffer.validLength)
    return this.record('read-secret', result.ok && result.value.outcome === 'data' && this.pendingBytes.length === 8, result.ok ? `read recuperó ${result.value.bytesTransferred} byte(s).` : result.error.message)
  }

  prepareRecovery(): EscapeRoomSnapshot {
    if (!this.stepSolved('seek')) return this.record('prepare-recovery', false, 'Primero recuperá los bytes mediante seek y read.')
    const result = this.session.creatFile('recuperacion.txt')
    if (result.ok) this.recoveryDescriptor = result.value.descriptor
    return this.record('prepare-recovery', result.ok, result.ok ? `Destino preparado con fd ${result.value.descriptor}.` : result.error.message)
  }

  writeRecovery(): EscapeRoomSnapshot {
    if (this.recoveryDescriptor === undefined || this.pendingBytes.length === 0) return this.record('write-recovery', false, 'Prepará el destino y conservá los bytes recuperados.')
    const result = this.session.write(this.recoveryDescriptor, this.pendingBytes)
    return this.record('write-recovery', result.ok, result.ok ? `Se escribieron ${result.value.bytesTransferred} byte(s) recuperados.` : result.error.message)
  }

  verify(): EscapeRoomSnapshot {
    const files = this.session.snapshot().engine.files
    const archive = files.find((file) => file.id === 'archive')?.content
    const recovery = files.find((file) => file.id === 'recovery')?.content
    const bytesRecovered = Boolean(archive && recovery && recovery.length === 8 && recovery.every((byte, index) => byte === archive[index + 7]))
    return this.record('verify', bytesRecovered, bytesRecovered ? 'La información recuperada coincide con el bloque de evidencia.' : 'El archivo de recuperación todavía no contiene los bytes correctos.')
  }

  closeAll(): EscapeRoomSnapshot {
    const handles = this.session.snapshot().engine.processes[0]?.openFiles ?? []
    if (handles.length === 0) return this.record('close-all', false, 'No hay descriptores abiertos para cerrar.')
    handles.forEach((handle) => this.session.close(handle.descriptor))
    return this.record('close-all', true, `${handles.length} descriptor(es) cerrado(s).`)
  }

  useHint(id: string): EscapeRoomSnapshot {
    const hint = ESCAPE_ROOM_HINTS.find((item) => item.id === id)
    if (hint && !this.hintsUsed.includes(id)) {
      this.hintsUsed.push(id)
      this.message = `${hint.text} Penalización: ${hint.penaltyPoints} puntos.`
    }
    return this.snapshot()
  }

  evaluate(): EscapeRoomEvaluation {
    const snapshot = this.snapshot()
    const solvedStepIds = snapshot.steps.filter((step) => step.solved).map((step) => step.id)
    const descriptorsClosed = snapshot.lab.engine.processes.every((process) => process.openFiles.length === 0)
    const files = snapshot.lab.engine.files
    const archive = files.find((file) => file.id === 'archive')?.content
    const recovery = files.find((file) => file.id === 'recovery')?.content
    const bytesRecovered = Boolean(archive && recovery && recovery.length === 8 && recovery.every((byte, index) => byte === archive[index + 7]))
    const completed = solvedStepIds.length === STEPS.length && descriptorsClosed && bytesRecovered
    const penaltyPoints = this.hintsUsed.reduce((sum, id) => sum + (ESCAPE_ROOM_HINTS.find((hint) => hint.id === id)?.penaltyPoints ?? 0), 0)
    return { ...evaluateResolution({ resolutionQuality: completed ? 1 : solvedStepIds.length / STEPS.length, completed, penaltyPoints }, completed ? 'Misión completada: se identificó, interpretó la protección, leyó, recuperó y verificó la evidencia; no quedaron descriptores abiertos.' : `Misión incompleta: faltan ${STEPS.filter((step) => !solvedStepIds.includes(step.id)).map((step) => step.title).join(', ')} o cerrar los descriptores abiertos.`), solvedStepIds, descriptorsClosed, bytesRecovered, failedActionCount: this.actions.filter((action) => !action.ok).length, hintsUsed: [...this.hintsUsed] }
  }

  private solvedStepIds(): string[] {
    const files = this.session.snapshot().engine.files
    const archive = files.find((file) => file.id === 'archive')?.content
    const recovery = files.find((file) => file.id === 'recovery')?.content
    const bytesRecovered = Boolean(archive && recovery && recovery.length === 8 && recovery.every((byte, index) => byte === archive[index + 7]))
    const archiveOpened = this.actions.some((action) => action.name === 'open-archive' && action.ok)
    const read = this.pendingBytes.length === 8 && this.actions.some((action) => action.name === 'read-secret' && action.ok)
    const access = this.actions.some((action) => action.name === 'set-access' && action.ok)
    const selected = this.selectedFileId === 'archive'
    const wrote = this.actions.some((action) => action.name === 'write-recovery' && action.ok) && bytesRecovered
    return [selected, access, archiveOpened && read, wrote, wrote && bytesRecovered && this.actions.some((action) => action.name === 'verify' && action.ok) && this.session.snapshot().engine.processes.every((process) => process.openFiles.length === 0)].map((value, index) => value ? STEPS[index].id : '').filter(Boolean)
  }

  private stepSolved(id: string): boolean { return this.solvedStepIds().includes(id) }

  private record(name: EscapeRoomAction, ok: boolean, message: string): EscapeRoomSnapshot {
    this.actions.push({ id: this.actions.length + 1, name, ok, message })
    this.message = message
    return this.snapshot()
  }
}

export function saveEscapeRoomEvaluation(state: Phase5State, evaluation: EscapeRoomEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'escape-room', evaluation, now)
}
