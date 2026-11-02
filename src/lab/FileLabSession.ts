import { FileSystemEngine } from '../engine'
import type {
  EngineError, EngineOperation, EngineResult, EngineSnapshot, FileDescriptor, FileId, FileSnapshot,
  IOBuffer, MutableFileAttributes, OpenMode, ProcessId, ReadResult, SeekOrigin, WriteResult,
} from '../engine'
import { DEFAULT_LAB_SCENARIO_ID, getLabScenario, type LabFolder, type LabScenario } from './scenarios'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type LabEventKind = 'interface' | 'engine' | 'system'
export type LabEventStatus = 'info' | 'success' | 'error'

export interface LabEvent {
  id: number
  kind: LabEventKind
  status: LabEventStatus
  operation: string
  message: string
  errorCode?: string
  details?: string
}

export interface BufferObservation {
  operation: 'read' | 'write' | 'append'
  buffer: IOBuffer
  requested: number
  transferred: number
  positionBefore: number
  positionAfter: number
}

export interface EditorDocument {
  fileId: FileId
  descriptor: FileDescriptor
  name: string
  format: FileSnapshot['format']
  bytes: Uint8Array
  text: string
  readOnly: boolean
}

export interface ConsoleReply {
  ok: boolean
  message: string
  clear?: boolean
}

export interface LabSessionSnapshot {
  scenario: LabScenario
  engine: EngineSnapshot
  folders: LabFolder[]
  fileLocations: Record<string, string>
  currentFolderId: string
  events: LabEvent[]
  lastBuffer?: BufferObservation
}

export class FileLabSession {
  private scenario: LabScenario
  private engine: FileSystemEngine
  private fileLocations: Record<string, string>
  private currentFolderId: string
  private events: LabEvent[] = []
  private eventSequence = 0
  private lastBuffer?: BufferObservation

  constructor(scenarioId = DEFAULT_LAB_SCENARIO_ID) {
    this.scenario = getLabScenario(scenarioId)
    this.engine = new FileSystemEngine(this.scenario.engine)
    this.fileLocations = { ...this.scenario.fileLocations }
    this.currentFolderId = this.scenario.defaultFolderId
    this.addEvent('system', 'success', 'inicio', `Escenario “${this.scenario.title}” cargado.`)
  }

  snapshot(): LabSessionSnapshot {
    return {
      scenario: this.scenario,
      engine: this.engine.snapshot(),
      folders: this.scenario.folders.map((folder) => ({ ...folder })),
      fileLocations: { ...this.fileLocations },
      currentFolderId: this.currentFolderId,
      events: this.events.map((event) => ({ ...event })),
      lastBuffer: this.lastBuffer ? cloneObservation(this.lastBuffer) : undefined,
    }
  }

  get primaryProcessId(): ProcessId { return this.scenario.primaryProcessId }

  filesInFolder(folderId = this.currentFolderId): FileSnapshot[] {
    return this.engine.listFiles().filter((file) => this.fileLocations[file.id] === folderId)
  }

  navigate(folderId: string): boolean {
    if (!this.scenario.folders.some((folder) => folder.id === folderId)) return false
    this.currentFolderId = folderId
    this.interfaceAction('navegar', `Abrir carpeta “${this.folderName(folderId)}”.`)
    return true
  }

  interfaceAction(operation: string, message: string): void {
    this.addEvent('interface', 'info', operation, message)
  }

  loadScenario(scenarioId: string): void {
    this.scenario = getLabScenario(scenarioId)
    this.engine = new FileSystemEngine(this.scenario.engine)
    this.fileLocations = { ...this.scenario.fileLocations }
    this.currentFolderId = this.scenario.defaultFolderId
    this.events = []
    this.eventSequence = 0
    this.lastBuffer = undefined
    this.addEvent('system', 'success', 'cargar escenario', `Escenario “${this.scenario.title}” cargado desde su definición inicial.`)
  }

  restoreScenario(): void {
    const result = this.engine.restoreScenario()
    this.fileLocations = { ...this.scenario.fileLocations }
    this.currentFolderId = this.scenario.defaultFolderId
    this.lastBuffer = undefined
    this.logResult(result, 'Restaurar escenario')
  }

  resetLab(): void { this.loadScenario(DEFAULT_LAB_SCENARIO_ID) }

  createFile(name: string, folderId = this.currentFolderId, format: FileSnapshot['format'] = 'ascii') {
    const result = this.engine.create(this.primaryProcessId, name, { format })
    if (result.ok) this.fileLocations[result.value.file.id] = folderId
    return this.logResult(result, `Crear “${name}”`)
  }

  creatFile(name: string, folderId = this.currentFolderId) {
    const existing = this.resolveFile(name)
    const result = this.engine.creat(this.primaryProcessId, name)
    if (result.ok && !existing) this.fileLocations[result.value.file.id] = folderId
    return this.logResult(result, `creat “${name}”`)
  }

  deleteFile(fileId: FileId) {
    const result = this.engine.delete(this.primaryProcessId, fileId)
    if (result.ok) delete this.fileLocations[fileId]
    return this.logResult(result, 'Eliminar archivo')
  }

  renameFile(fileId: FileId, newName: string) {
    return this.logResult(this.engine.rename(this.primaryProcessId, fileId, newName), `Renombrar como “${newName}”`)
  }

  open(fileId: FileId, mode: OpenMode, processId = this.primaryProcessId) {
    return this.logResult(this.engine.open(processId, fileId, mode), `Abrir en modo ${mode}`)
  }

  close(descriptor: FileDescriptor, processId = this.primaryProcessId) {
    return this.logResult(this.engine.close(processId, descriptor), `Cerrar descriptor ${descriptor}`)
  }

  read(descriptor: FileDescriptor, count: number, processId = this.primaryProcessId) {
    const result = this.engine.read(processId, descriptor, count)
    if (result.ok) this.observeRead(result.value)
    return this.logResult(result, `Leer ${count} byte(s) desde descriptor ${descriptor}`)
  }

  write(descriptor: FileDescriptor, bytes: Uint8Array, count = bytes.length, processId = this.primaryProcessId) {
    const result = this.engine.write(processId, descriptor, bytes, count)
    if (result.ok) this.observeWrite('write', bytes, count, result.value)
    return this.logResult(result, `Escribir ${count} byte(s) en descriptor ${descriptor}`)
  }

  append(descriptor: FileDescriptor, bytes: Uint8Array, count = bytes.length, processId = this.primaryProcessId) {
    const result = this.engine.append(processId, descriptor, bytes, count)
    if (result.ok) this.observeWrite('append', bytes, count, result.value)
    return this.logResult(result, `Agregar ${count} byte(s) con descriptor ${descriptor}`)
  }

  seek(descriptor: FileDescriptor, offset: number, origin: SeekOrigin = 'start', processId = this.primaryProcessId) {
    return this.logResult(this.engine.seek(processId, descriptor, offset, origin), `Reposicionar descriptor ${descriptor}`)
  }

  getAttributes(fileId: FileId, processId = this.primaryProcessId) {
    return this.logResult(this.engine.getAttributes(processId, fileId), 'Consultar atributos')
  }

  setAttributes(fileId: FileId, patch: MutableFileAttributes, processId = this.primaryProcessId) {
    return this.logResult(this.engine.setAttributes(processId, fileId, patch), 'Modificar atributos')
  }

  async openEditor(fileId: FileId): Promise<EngineResult<EditorDocument>> {
    let opened = this.open(fileId, 'read-write')
    let readOnly = false
    if (!opened.ok) {
      opened = this.open(fileId, 'read')
      readOnly = true
    }
    if (!opened.ok) return opened

    const descriptor = opened.value.descriptor
    const file = this.engine.getFile(fileId)!
    const bytesResult = this.readAll(descriptor, file.size)
    if (!bytesResult.ok) {
      this.close(descriptor)
      return bytesResult
    }
    this.seek(descriptor, 0)
    return {
      ok: true,
      operation: 'open',
      value: {
        fileId, descriptor, name: file.name, format: file.format,
        bytes: bytesResult.value, text: decoder.decode(bytesResult.value), readOnly,
      },
    }
  }

  saveEditor(document: EditorDocument, text: string): EngineResult<EditorDocument> {
    const file = this.engine.getFile(document.fileId)
    if (!file) return this.localFailure('write', 'FILE_NOT_FOUND', 'El archivo ya no existe.')
    const bytes = encoder.encode(text)
    const created = this.logResult(this.engine.creat(this.primaryProcessId, file.name, { format: file.format }), 'Truncar y abrir para guardar')
    if (!created.ok) return created

    this.close(document.descriptor)
    const writeDescriptor = created.value.descriptor
    let offset = 0
    while (offset < bytes.length) {
      const chunk = bytes.slice(offset)
      const written = this.write(writeDescriptor, chunk)
      if (!written.ok) {
        this.close(writeDescriptor)
        return written
      }
      if (written.value.bytesTransferred === 0) {
        this.close(writeDescriptor)
        return this.localFailure('write', 'INVALID_COUNT', 'La escritura no progresó; se detuvo para evitar un ciclo infinito.')
      }
      offset += written.value.bytesTransferred
    }
    this.close(writeDescriptor)
    const reopened = this.open(document.fileId, 'read-write')
    if (!reopened.ok) return reopened
    return {
      ok: true,
      operation: 'write',
      value: { ...document, descriptor: reopened.value.descriptor, bytes, text, readOnly: false },
    }
  }

  closeEditor(document: EditorDocument) { return this.close(document.descriptor) }

  executeConsole(input: string): ConsoleReply {
    const tokens = tokenize(input)
    const command = tokens.shift()?.toLowerCase()
    if (!command) return { ok: false, message: 'Escribí un comando. Usá help para ver ejemplos.' }
    if (command === 'clear') return { ok: true, message: 'Historial visual limpiado.', clear: true }
    if (command === 'help') return { ok: true, message: 'help · ls · create <nombre> · creat <nombre> · delete <archivo> · rename <archivo> <nombre> · open <archivo> <modo> · close <fd> · read <fd> <bytes> · write <fd> <texto> · append <fd> <texto> · seek <fd> <posición> [start|current|end] · attrs <archivo> · set <archivo> <bandera> <true|false>' }
    if (command === 'ls') return { ok: true, message: this.filesInFolder().map((file) => `${file.name} (${file.size} B)`).join(' · ') || 'Carpeta vacía.' }

    const file = tokens[0] ? this.resolveFile(tokens[0]) : undefined
    if (command === 'create') {
      const result = this.createFile(tokens[0] ?? '')
      return reply(result, result.ok ? `Creado ${result.value.file.name}.` : undefined)
    }
    if (command === 'creat') return reply(this.creatFile(tokens[0] ?? ''))
    if (command === 'delete') return reply(file ? this.deleteFile(file.id) : this.missingFile(tokens[0]))
    if (command === 'rename') return reply(file ? this.renameFile(file.id, tokens[1] ?? '') : this.missingFile(tokens[0]))
    if (command === 'open') {
      const mode = tokens[1] ?? 'read'
      if (!isOpenMode(mode)) return { ok: false, message: `Modo inválido: ${mode}. Usá read, write, read-write o append.` }
      return reply(file ? this.open(file.id, mode) : this.missingFile(tokens[0]))
    }
    if (command === 'attrs') return reply(file ? this.getAttributes(file.id) : this.missingFile(tokens[0]))
    if (command === 'set') {
      if (!file) return reply(this.missingFile(tokens[0]))
      const flag = tokens[1]
      const value = parseBoolean(tokens[2])
      if (!isEditableFlag(flag) || value === undefined) return { ok: false, message: 'Uso: set <archivo> <readOnly|hidden|system|archive|temporary|locked> <true|false>.' }
      return reply(this.setAttributes(file.id, { [flag]: value }))
    }

    const descriptor = Number(tokens[0])
    if (command === 'close') return reply(this.close(descriptor))
    if (command === 'read') return reply(this.read(descriptor, Number(tokens[1])))
    if (command === 'write') return reply(this.write(descriptor, encoder.encode(tokens.slice(1).join(' '))))
    if (command === 'append') return reply(this.append(descriptor, encoder.encode(tokens.slice(1).join(' '))))
    if (command === 'seek') {
      const origin = tokens[2] ?? 'start'
      if (!isSeekOrigin(origin)) return { ok: false, message: `Origen inválido: ${origin}. Usá start, current o end.` }
      return reply(this.seek(descriptor, Number(tokens[1]), origin))
    }
    return { ok: false, message: `Comando desconocido: ${command}. Usá help.` }
  }

  clearEvents(): void { this.events = [] }

  private readAll(descriptor: number, size: number): EngineResult<Uint8Array> {
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < size) {
      const result = this.read(descriptor, Math.max(1, size - total))
      if (!result.ok) return result
      if (result.value.outcome === 'eof') break
      const valid = result.value.buffer.data.slice(0, result.value.buffer.validLength)
      chunks.push(valid)
      total += valid.length
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return { ok: true, operation: 'read', value: bytes }
  }

  private observeRead(result: ReadResult): void {
    this.lastBuffer = {
      operation: 'read', buffer: cloneBuffer(result.buffer), requested: result.bytesRequested,
      transferred: result.bytesTransferred, positionBefore: result.positionBefore, positionAfter: result.positionAfter,
    }
  }

  private observeWrite(operation: 'write' | 'append', bytes: Uint8Array, requested: number, result: WriteResult): void {
    const bufferBytes = bytes.slice(0, requested)
    this.lastBuffer = {
      operation, buffer: { capacity: bufferBytes.length, data: bufferBytes, validLength: result.bytesTransferred },
      requested, transferred: result.bytesTransferred, positionBefore: result.positionBefore, positionAfter: result.positionAfter,
    }
  }

  private logResult<T>(result: EngineResult<T>, label: string): EngineResult<T> {
    if (result.ok) this.addEvent('engine', 'success', result.operation, `${label}: operación completada.`, undefined, summarize(result.value))
    else this.addEvent('engine', 'error', result.operation, `${label} falló: ${result.error.message}`, result.error.code, summarize(result.error.details))
    return result
  }

  private addEvent(kind: LabEventKind, status: LabEventStatus, operation: string, message: string, errorCode?: string, details?: string): void {
    this.events.push({ id: ++this.eventSequence, kind, status, operation, message, errorCode, details })
    if (this.events.length > 120) this.events.shift()
  }

  private resolveFile(reference: string): FileSnapshot | undefined {
    return this.engine.listFiles().find((file) => file.id === reference || file.name === reference)
  }

  private folderName(folderId: string): string {
    return this.scenario.folders.find((folder) => folder.id === folderId)?.name ?? folderId
  }

  private missingFile(reference?: string): EngineResult<never> {
    return this.localFailure('open', 'FILE_NOT_FOUND', `No se encontró el archivo “${reference ?? ''}”.`)
  }

  private localFailure(operation: EngineOperation, code: EngineError['code'], message: string): EngineResult<never> {
    const result: EngineResult<never> = { ok: false, operation, error: { code, message } }
    return this.logResult(result, operation)
  }
}

const cloneBuffer = (buffer: IOBuffer): IOBuffer => ({ capacity: buffer.capacity, data: buffer.data.slice(), validLength: buffer.validLength })
const cloneObservation = (observation: BufferObservation): BufferObservation => ({ ...observation, buffer: cloneBuffer(observation.buffer) })

function tokenize(input: string): string[] {
  return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3])
}

function summarize(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return JSON.stringify(value, (_key, item) => item instanceof Uint8Array ? [...item] : item)
}

function reply(result: EngineResult<unknown>, success?: string): ConsoleReply {
  return result.ok ? { ok: true, message: success ?? `OK · ${result.operation}: ${summarize(result.value)}` } : { ok: false, message: `${result.error.code} · ${result.error.message}` }
}

const openModes: OpenMode[] = ['read', 'write', 'read-write', 'append']
const seekOrigins: SeekOrigin[] = ['start', 'current', 'end']
const editableFlags = ['readOnly', 'hidden', 'system', 'archive', 'temporary', 'locked'] as const
const isOpenMode = (value: string): value is OpenMode => openModes.includes(value as OpenMode)
const isSeekOrigin = (value: string): value is SeekOrigin => seekOrigins.includes(value as SeekOrigin)
const isEditableFlag = (value: string | undefined): value is typeof editableFlags[number] => editableFlags.includes(value as typeof editableFlags[number])
const parseBoolean = (value: string | undefined) => value === 'true' ? true : value === 'false' ? false : undefined
