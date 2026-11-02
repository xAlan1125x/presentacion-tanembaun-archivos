import { createBuffer } from './buffer'
import { DEFAULT_ENGINE_CONFIG, createDefaultAttributes } from './defaults'
import type {
  CloseResult,
  CreatResult,
  CreateResult,
  DidacticProtection,
  EngineConfig,
  EngineErrorCode,
  EngineFailure,
  EngineOperation,
  EngineResult,
  EngineSnapshot,
  FileAttributes,
  FileDescriptor,
  FileFormat,
  FileId,
  FileSnapshot,
  FileType,
  IOBuffer,
  MutableFileAttributes,
  OpenFileSnapshot,
  OpenMode,
  OpenResult,
  PrincipalId,
  ProcessId,
  ProcessSnapshot,
  ReadResult,
  ScenarioDefinition,
  SeekOrigin,
  SeekResult,
  WriteResult,
} from './types'

interface StoredFile {
  id: FileId
  name: string
  type: FileType
  format: FileFormat
  content: Uint8Array
  attributes: FileAttributes
}

interface OpenFileHandle {
  descriptor: FileDescriptor
  fileId: FileId
  mode: OpenMode
  position: number
}

interface StoredProcess {
  id: ProcessId
  principalId: PrincipalId
  openFiles: Map<FileDescriptor, OpenFileHandle>
  nextDescriptor: number
}

interface CreateOptions {
  type?: FileType
  format?: FileFormat
  attributes?: MutableFileAttributes
}

interface CreatOptions {
  format?: FileFormat
  protection?: DidacticProtection
}

const isReadMode = (mode: OpenMode) => mode === 'read' || mode === 'read-write'
const isWriteMode = (mode: OpenMode) => mode === 'write' || mode === 'read-write' || mode === 'append'

export class FileSystemEngine {
  private scenario: ScenarioDefinition
  private config: EngineConfig
  private files = new Map<FileId, StoredFile>()
  private processes = new Map<ProcessId, StoredProcess>()
  private clock = 0
  private nextFileNumber = 1
  private nextProcessNumber = 1

  constructor(scenario: ScenarioDefinition) {
    this.scenario = cloneScenario(scenario)
    this.config = mergeConfig(scenario)
    this.loadScenarioState(this.scenario)
  }

  getConfig(): EngineConfig {
    return structuredClone(this.config)
  }

  snapshot(): EngineSnapshot {
    return {
      scenarioId: this.scenario.id,
      scenarioTitle: this.scenario.title,
      clock: this.clock,
      files: this.listFiles(),
      processes: [...this.processes.values()].map(cloneProcess),
    }
  }

  listFiles(): FileSnapshot[] {
    return [...this.files.values()].map(cloneFile)
  }

  getFile(fileId: FileId): FileSnapshot | undefined {
    const file = this.files.get(fileId)
    return file ? cloneFile(file) : undefined
  }

  getProcess(processId: ProcessId): ProcessSnapshot | undefined {
    const process = this.processes.get(processId)
    return process ? cloneProcess(process) : undefined
  }

  restoreScenario(): EngineResult<EngineSnapshot> {
    this.config = mergeConfig(this.scenario)
    this.loadScenarioState(this.scenario)
    return this.success('restore-scenario', this.snapshot())
  }

  loadScenario(scenario: ScenarioDefinition): EngineResult<EngineSnapshot> {
    this.scenario = cloneScenario(scenario)
    this.config = mergeConfig(this.scenario)
    this.loadScenarioState(this.scenario)
    return this.success('restore-scenario', this.snapshot())
  }

  spawnProcess(principalId: PrincipalId, requestedId?: ProcessId): EngineResult<ProcessSnapshot> {
    const id = requestedId ?? this.nextAvailableProcessId()
    if (this.processes.has(id)) {
      return this.failure('spawn-process', 'NAME_EXISTS', `Ya existe un proceso con el identificador “${id}”.`)
    }

    const process: StoredProcess = { id, principalId, openFiles: new Map(), nextDescriptor: 3 }
    this.processes.set(id, process)
    return this.success('spawn-process', cloneProcess(process))
  }

  create(processId: ProcessId, name: string, options: CreateOptions = {}): EngineResult<CreateResult> {
    const operation = 'create'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)

    const nameError = this.validateName(operation, name)
    if (nameError) return nameError
    if (this.findFileByName(name)) {
      return this.failure(operation, 'NAME_EXISTS', `Ya existe un archivo llamado “${name}”.`, { name })
    }

    const patchError = validateAttributePatch(0, options.attributes ?? {})
    if (patchError) return this.failure(operation, patchError.code, patchError.message, patchError.details)

    const timestamp = this.tick()
    const attributes = mergeAttributes(createDefaultAttributes(process.principalId, timestamp), options.attributes)
    const id = this.nextAvailableFileId()
    const file: StoredFile = {
      id,
      name,
      type: options.type ?? 'regular',
      format: options.format ?? 'binary',
      content: new Uint8Array(),
      attributes,
    }
    this.files.set(id, file)
    return this.success(operation, { file: cloneFile(file) })
  }

  /**
   * Adaptador específico para el `creat` del programa C: crea o trunca y deja
   * el archivo abierto para escritura. No es la operación conceptual `create`.
   */
  creat(processId: ProcessId, name: string, options: CreatOptions = {}): EngineResult<CreatResult> {
    const operation = 'creat'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)

    const nameError = this.validateName(operation, name)
    if (nameError) return nameError

    let file = this.findFileByName(name)
    let truncated = false

    if (file) {
      const writable = this.checkWritableFile(operation, process, file)
      if (writable) return writable
      if (file.type !== 'regular') return this.unsupportedType(operation, file)

      file.content = new Uint8Array()
      file.attributes.lastModifiedAt = this.tick()
      file.attributes.archive = true
      this.clampOpenPositions(file.id, 0)
      truncated = true
    } else {
      const created = this.create(processId, name, {
        format: options.format,
        attributes: options.protection ? { protection: options.protection } : undefined,
      })
      if (!created.ok) return { ...created, operation }
      file = this.files.get(created.value.file.id)!
    }

    const descriptor = process.nextDescriptor++
    process.openFiles.set(descriptor, { descriptor, fileId: file.id, mode: 'write', position: 0 })
    return this.success(operation, { file: cloneFile(file), descriptor, truncated })
  }

  delete(processId: ProcessId, fileId: FileId): EngineResult<{ fileId: FileId; name: string }> {
    const operation = 'delete'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const file = this.files.get(fileId)
    if (!file) return this.fileMissing(operation, fileId)

    const writable = this.checkWritePermission(operation, process, file)
    if (writable) return writable
    if (file.attributes.locked) return this.failure(operation, 'LOCKED', 'El archivo está bloqueado.', { fileId })
    if (!this.config.allowDeleteOpenFiles && this.isFileOpen(fileId)) {
      return this.failure(operation, 'FILE_IN_USE', 'FileLab no elimina archivos abiertos en este escenario.', { fileId })
    }

    this.files.delete(fileId)
    if (this.config.allowDeleteOpenFiles) this.removeOpenHandles(fileId)
    this.tick()
    return this.success(operation, { fileId, name: file.name })
  }

  open(processId: ProcessId, fileId: FileId, mode: OpenMode): EngineResult<OpenResult> {
    const operation = 'open'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const file = this.files.get(fileId)
    if (!file) return this.fileMissing(operation, fileId)
    if (file.type !== 'regular') return this.unsupportedType(operation, file)

    if (isReadMode(mode)) {
      const denied = this.checkPermission(operation, process, file, 'read')
      if (denied) return denied
    }
    if (isWriteMode(mode)) {
      const denied = this.checkWritableFile(operation, process, file)
      if (denied) return denied
    }

    const descriptor = process.nextDescriptor++
    const position = mode === 'append' ? file.content.length : 0
    process.openFiles.set(descriptor, { descriptor, fileId, mode, position })
    return this.success(operation, { descriptor, fileId, mode, position })
  }

  close(processId: ProcessId, descriptor: FileDescriptor): EngineResult<CloseResult> {
    const operation = 'close'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const handle = process.openFiles.get(descriptor)
    if (!handle) return this.descriptorMissing(operation, processId, descriptor)

    process.openFiles.delete(descriptor)
    return this.success(operation, { descriptor, fileId: handle.fileId })
  }

  read(processId: ProcessId, descriptor: FileDescriptor, requestedBytes: number): EngineResult<ReadResult> {
    const operation = 'read'
    const resolved = this.resolveHandle(operation, processId, descriptor)
    if (!resolved.ok) return resolved
    const { process, handle, file } = resolved.value

    if (!isValidCount(requestedBytes)) return this.invalidCount(operation, requestedBytes)
    if (!isReadMode(handle.mode)) {
      return this.failure(operation, 'MODE_VIOLATION', `El descriptor ${descriptor} no fue abierto para lectura.`, { descriptor })
    }
    const denied = this.checkPermission(operation, process, file, 'read')
    if (denied) return denied

    const positionBefore = handle.position
    const buffer = createBuffer(requestedBytes)

    if (requestedBytes > 0 && positionBefore >= file.content.length) {
      return this.success(operation, {
        outcome: 'eof',
        buffer,
        bytesRequested: requestedBytes,
        bytesTransferred: 0,
        positionBefore,
        positionAfter: positionBefore,
      })
    }

    const available = file.content.length - positionBefore
    const transferLimit = this.config.transfers.maxReadBytesPerCall ?? requestedBytes
    const bytesTransferred = Math.min(requestedBytes, available, transferLimit)
    buffer.data.set(file.content.slice(positionBefore, positionBefore + bytesTransferred))
    buffer.validLength = bytesTransferred
    handle.position += bytesTransferred
    if (bytesTransferred > 0) file.attributes.lastAccessedAt = this.tick()

    return this.success(operation, {
      outcome: 'data',
      buffer,
      bytesRequested: requestedBytes,
      bytesTransferred,
      positionBefore,
      positionAfter: handle.position,
    })
  }

  write(
    processId: ProcessId,
    descriptor: FileDescriptor,
    source: IOBuffer | Uint8Array,
    requestedBytes?: number,
  ): EngineResult<WriteResult> {
    return this.performWrite('write', processId, descriptor, source, requestedBytes, false)
  }

  append(
    processId: ProcessId,
    descriptor: FileDescriptor,
    source: IOBuffer | Uint8Array,
    requestedBytes?: number,
  ): EngineResult<WriteResult> {
    return this.performWrite('append', processId, descriptor, source, requestedBytes, true)
  }

  seek(
    processId: ProcessId,
    descriptor: FileDescriptor,
    offset: number,
    origin: SeekOrigin = 'start',
  ): EngineResult<SeekResult> {
    const operation = 'seek'
    const resolved = this.resolveHandle(operation, processId, descriptor)
    if (!resolved.ok) return resolved
    const { handle, file } = resolved.value
    if (!Number.isSafeInteger(offset)) {
      return this.failure(operation, 'INVALID_POSITION', 'El desplazamiento debe ser un entero seguro.', { offset })
    }

    const base = origin === 'start' ? 0 : origin === 'current' ? handle.position : file.content.length
    const positionAfter = base + offset
    if (positionAfter < 0 || positionAfter > file.content.length) {
      return this.failure(
        operation,
        'INVALID_POSITION',
        'FileLab limita el cursor al intervalo comprendido entre 0 y el tamaño actual del archivo.',
        { offset, position: positionAfter, size: file.content.length },
      )
    }

    const positionBefore = handle.position
    handle.position = positionAfter
    return this.success(operation, { positionBefore, positionAfter })
  }

  getAttributes(processId: ProcessId, fileId: FileId): EngineResult<{ attributes: FileAttributes; size: number }> {
    const operation = 'get-attributes'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const file = this.files.get(fileId)
    if (!file) return this.fileMissing(operation, fileId)
    const denied = this.checkPermission(operation, process, file, 'read')
    if (denied) return denied
    return this.success(operation, { attributes: cloneAttributes(file.attributes), size: file.content.length })
  }

  setAttributes(
    processId: ProcessId,
    fileId: FileId,
    patch: MutableFileAttributes,
  ): EngineResult<{ attributes: FileAttributes; size: number }> {
    const operation = 'set-attributes'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const file = this.files.get(fileId)
    if (!file) return this.fileMissing(operation, fileId)
    if (process.principalId !== file.attributes.ownerId) {
      return this.failure(operation, 'PERMISSION_DENIED', 'Sólo el propietario puede modificar los atributos en el modelo didáctico de FileLab.', { fileId })
    }
    const patchError = validateAttributePatch(file.content.length, patch)
    if (patchError) return this.failure(operation, patchError.code, patchError.message, patchError.details)

    file.attributes = mergeAttributes(file.attributes, patch)
    this.tick()
    return this.success(operation, { attributes: cloneAttributes(file.attributes), size: file.content.length })
  }

  rename(processId: ProcessId, fileId: FileId, newName: string): EngineResult<{ file: FileSnapshot; previousName: string }> {
    const operation = 'rename'
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const file = this.files.get(fileId)
    if (!file) return this.fileMissing(operation, fileId)
    const nameError = this.validateName(operation, newName)
    if (nameError) return nameError
    const collision = this.findFileByName(newName)
    if (collision && collision.id !== fileId) {
      return this.failure(operation, 'NAME_EXISTS', `Ya existe un archivo llamado “${newName}”.`, { name: newName })
    }
    const denied = this.checkWritePermission(operation, process, file)
    if (denied) return denied
    if (file.attributes.locked) return this.failure(operation, 'LOCKED', 'El archivo está bloqueado.', { fileId })

    const previousName = file.name
    file.name = newName
    this.tick()
    return this.success(operation, { file: cloneFile(file), previousName })
  }

  private performWrite(
    operation: 'write' | 'append',
    processId: ProcessId,
    descriptor: FileDescriptor,
    source: IOBuffer | Uint8Array,
    requestedBytes: number | undefined,
    forceAppend: boolean,
  ): EngineResult<WriteResult> {
    const resolved = this.resolveHandle(operation, processId, descriptor)
    if (!resolved.ok) return resolved
    const { process, handle, file } = resolved.value
    if (!isWriteMode(handle.mode)) {
      return this.failure(operation, 'MODE_VIOLATION', `El descriptor ${descriptor} no fue abierto para escritura.`, { descriptor })
    }
    const denied = this.checkWritableFile(operation, process, file)
    if (denied) return denied

    const sourceBytes = source instanceof Uint8Array ? source : source.data
    const availableBytes = source instanceof Uint8Array ? source.length : source.validLength
    if (!(source instanceof Uint8Array) && !isValidBuffer(source)) {
      return this.failure(operation, 'INVALID_COUNT', 'El búfer tiene una capacidad o longitud válida inconsistente.')
    }

    const count = requestedBytes ?? availableBytes
    if (!isValidCount(count) || count > availableBytes) return this.invalidCount(operation, count)

    const positionBefore = forceAppend || handle.mode === 'append' ? file.content.length : handle.position
    const sizeBefore = file.content.length
    const transferLimit = this.config.transfers.maxWriteBytesPerCall ?? count
    const sizeLimit = file.attributes.maxSize
    const remainingCapacity = sizeLimit === undefined ? count : Math.max(0, sizeLimit - positionBefore)
    const bytesTransferred = Math.min(count, transferLimit, remainingCapacity)

    if (count > 0 && bytesTransferred === 0 && sizeLimit !== undefined) {
      return this.failure(operation, 'FILE_SIZE_LIMIT', 'El archivo alcanzó su tamaño máximo configurado.', { fileId: file.id, maxSize: sizeLimit })
    }

    if (bytesTransferred > 0) {
      const newLength = Math.max(file.content.length, positionBefore + bytesTransferred)
      const nextContent = new Uint8Array(newLength)
      nextContent.set(file.content)
      nextContent.set(sourceBytes.slice(0, bytesTransferred), positionBefore)
      file.content = nextContent
      handle.position = positionBefore + bytesTransferred
      file.attributes.lastModifiedAt = this.tick()
      file.attributes.archive = true
    } else {
      handle.position = positionBefore
    }

    return this.success(operation, {
      bytesRequested: count,
      bytesTransferred,
      partial: bytesTransferred < count,
      positionBefore,
      positionAfter: handle.position,
      sizeBefore,
      sizeAfter: file.content.length,
    })
  }

  private resolveHandle(operation: EngineOperation, processId: ProcessId, descriptor: FileDescriptor): EngineResult<{
    process: StoredProcess
    handle: OpenFileHandle
    file: StoredFile
  }> {
    const process = this.processes.get(processId)
    if (!process) return this.processMissing(operation, processId)
    const handle = process.openFiles.get(descriptor)
    if (!handle) return this.descriptorMissing(operation, processId, descriptor)
    const file = this.files.get(handle.fileId)
    if (!file) return this.fileMissing(operation, handle.fileId)
    return this.success(operation, { process, handle, file })
  }

  private checkWritableFile(operation: EngineOperation, process: StoredProcess, file: StoredFile): EngineFailure | undefined {
    const denied = this.checkWritePermission(operation, process, file)
    if (denied) return denied
    if (file.attributes.readOnly) return this.failure(operation, 'READ_ONLY', 'El archivo está marcado como sólo lectura.', { fileId: file.id })
    if (file.attributes.locked) return this.failure(operation, 'LOCKED', 'El archivo está bloqueado.', { fileId: file.id })
    return undefined
  }

  private checkWritePermission(operation: EngineOperation, process: StoredProcess, file: StoredFile): EngineFailure | undefined {
    return this.checkPermission(operation, process, file, 'write')
  }

  private checkPermission(
    operation: EngineOperation,
    process: StoredProcess,
    file: StoredFile,
    permission: 'read' | 'write',
  ): EngineFailure | undefined {
    const group = process.principalId === file.attributes.ownerId ? file.attributes.protection.owner : file.attributes.protection.others
    if (!group[permission]) {
      return this.failure(
        operation,
        'PERMISSION_DENIED',
        `El modelo didáctico de FileLab no concede permiso de ${permission === 'read' ? 'lectura' : 'escritura'} a este proceso.`,
        { fileId: file.id, principalId: process.principalId },
      )
    }
    return undefined
  }

  private validateName(operation: EngineOperation, name: string): EngineFailure | undefined {
    const rules = this.config.naming
    if (name.length === 0 || (!rules.allowWhitespaceOnly && name.trim().length === 0)) {
      return this.failure(operation, 'INVALID_NAME', 'El nombre no puede estar vacío.')
    }
    if (name.length > rules.maxLength) {
      return this.failure(operation, 'INVALID_NAME', `El nombre supera el máximo de ${rules.maxLength} caracteres.`, { maxLength: rules.maxLength })
    }
    if (rules.forbiddenCharacters.some((character) => name.includes(character))) {
      return this.failure(operation, 'INVALID_NAME', 'El nombre contiene un carácter prohibido por el escenario.', { name })
    }
    if (rules.reservedNames.some((reserved) => this.normalizeName(reserved) === this.normalizeName(name))) {
      return this.failure(operation, 'INVALID_NAME', 'El nombre está reservado por el escenario.', { name })
    }
    return undefined
  }

  private normalizeName(name: string): string {
    return this.config.naming.caseSensitive ? name : name.toLocaleLowerCase('es')
  }

  private findFileByName(name: string): StoredFile | undefined {
    const normalized = this.normalizeName(name)
    return [...this.files.values()].find((file) => this.normalizeName(file.name) === normalized)
  }

  private isFileOpen(fileId: FileId): boolean {
    return [...this.processes.values()].some((process) => [...process.openFiles.values()].some((handle) => handle.fileId === fileId))
  }

  private removeOpenHandles(fileId: FileId): void {
    for (const process of this.processes.values()) {
      for (const [descriptor, handle] of process.openFiles) {
        if (handle.fileId === fileId) process.openFiles.delete(descriptor)
      }
    }
  }

  private clampOpenPositions(fileId: FileId, maximum: number): void {
    for (const process of this.processes.values()) {
      for (const handle of process.openFiles.values()) {
        if (handle.fileId === fileId) handle.position = Math.min(handle.position, maximum)
      }
    }
  }

  private loadScenarioState(scenario: ScenarioDefinition): void {
    this.files.clear()
    this.processes.clear()
    this.clock = this.config.clockStart
    this.nextFileNumber = 1
    this.nextProcessNumber = 1

    for (const scenarioProcess of scenario.processes) {
      const id = scenarioProcess.id ?? this.nextAvailableProcessId()
      if (this.processes.has(id)) throw new Error(`Escenario inválido: proceso duplicado “${id}”.`)
      this.processes.set(id, { id, principalId: scenarioProcess.principalId, openFiles: new Map(), nextDescriptor: 3 })
    }

    const defaultPrincipal = scenario.processes[0]?.principalId ?? 'system'
    for (const scenarioFile of scenario.files) {
      const nameError = this.validateName('restore-scenario', scenarioFile.name)
      if (nameError) throw new Error(`Escenario inválido: ${nameError.error.message}`)
      if (this.findFileByName(scenarioFile.name)) throw new Error(`Escenario inválido: nombre duplicado “${scenarioFile.name}”.`)

      const id = scenarioFile.id ?? this.nextAvailableFileId()
      if (this.files.has(id)) throw new Error(`Escenario inválido: archivo duplicado “${id}”.`)
      const owner = scenarioFile.attributes?.ownerId ?? defaultPrincipal
      const attributes = mergeAttributes(createDefaultAttributes(owner, this.config.clockStart), scenarioFile.attributes)
      const content = scenarioFile.content?.slice() ?? new Uint8Array()
      const patchError = validateAttributePatch(content.length, scenarioFile.attributes ?? {})
      if (patchError) throw new Error(`Escenario inválido en “${scenarioFile.name}”: ${patchError.message}`)

      this.files.set(id, {
        id,
        name: scenarioFile.name,
        content,
        type: scenarioFile.type ?? 'regular',
        format: scenarioFile.format ?? 'binary',
        attributes,
      })
    }
  }

  private tick(): number {
    this.clock += this.config.clockStep
    return this.clock
  }

  private nextAvailableFileId(): FileId {
    let id = `file-${this.nextFileNumber++}`
    while (this.files.has(id)) id = `file-${this.nextFileNumber++}`
    return id
  }

  private nextAvailableProcessId(): ProcessId {
    let id = `process-${this.nextProcessNumber++}`
    while (this.processes.has(id)) id = `process-${this.nextProcessNumber++}`
    return id
  }

  private processMissing(operation: EngineOperation, processId: ProcessId): EngineFailure {
    return this.failure(operation, 'PROCESS_NOT_FOUND', `No existe el proceso “${processId}”.`, { processId })
  }

  private fileMissing(operation: EngineOperation, fileId: FileId): EngineFailure {
    return this.failure(operation, 'FILE_NOT_FOUND', `No existe el archivo “${fileId}”.`, { fileId })
  }

  private descriptorMissing(operation: EngineOperation, processId: ProcessId, descriptor: number): EngineFailure {
    return this.failure(operation, 'INVALID_DESCRIPTOR', `El descriptor ${descriptor} no está abierto en el proceso “${processId}”.`, { processId, descriptor })
  }

  private invalidCount(operation: EngineOperation, count: number): EngineFailure {
    return this.failure(operation, 'INVALID_COUNT', 'La cantidad de bytes debe ser un entero no negativo y no superar los bytes válidos.', { count })
  }

  private unsupportedType(operation: EngineOperation, file: StoredFile): EngineFailure {
    return this.failure(operation, 'UNSUPPORTED_FILE_TYPE', `La fase 2 no define E/S para archivos de tipo “${file.type}”.`, { fileId: file.id, type: file.type })
  }

  private success<T>(operation: EngineOperation, value: T): EngineResult<T> {
    return { ok: true, operation, value }
  }

  private failure(
    operation: EngineOperation,
    code: EngineErrorCode,
    message: string,
    details?: Readonly<Record<string, string | number | boolean>>,
  ): EngineFailure {
    return { ok: false, operation, error: { code, message, details } }
  }
}

function mergeConfig(scenario: ScenarioDefinition): EngineConfig {
  const config: EngineConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    ...scenario.config,
    naming: { ...DEFAULT_ENGINE_CONFIG.naming, ...scenario.config?.naming },
    transfers: { ...DEFAULT_ENGINE_CONFIG.transfers, ...scenario.config?.transfers },
  }

  if (!Number.isFinite(config.clockStart) || !Number.isFinite(config.clockStep) || config.clockStep <= 0) {
    throw new Error('Escenario inválido: la configuración del reloj no es válida.')
  }
  for (const limit of [config.transfers.maxReadBytesPerCall, config.transfers.maxWriteBytesPerCall]) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
      throw new Error('Escenario inválido: los límites de transferencia deben ser enteros positivos.')
    }
  }
  return config
}

function mergeAttributes(base: FileAttributes, patch: ScenarioDefinition['files'][number]['attributes'] | MutableFileAttributes | undefined): FileAttributes {
  if (!patch) return cloneAttributes(base)
  return {
    ...base,
    ...patch,
    protection: {
      model: 'filelab-didactic-v1',
      owner: { ...base.protection.owner, ...patch.protection?.owner },
      others: { ...base.protection.others, ...patch.protection?.others },
    },
  }
}

function cloneAttributes(attributes: FileAttributes): FileAttributes {
  return {
    ...attributes,
    protection: {
      model: 'filelab-didactic-v1',
      owner: { ...attributes.protection.owner },
      others: { ...attributes.protection.others },
    },
  }
}

function cloneFile(file: StoredFile): FileSnapshot {
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    format: file.format,
    content: file.content.slice(),
    size: file.content.length,
    attributes: cloneAttributes(file.attributes),
  }
}

function cloneProcess(process: StoredProcess): ProcessSnapshot {
  return {
    id: process.id,
    principalId: process.principalId,
    openFiles: [...process.openFiles.values()].map((handle): OpenFileSnapshot => ({ ...handle })),
  }
}

function cloneScenario(scenario: ScenarioDefinition): ScenarioDefinition {
  return {
    id: scenario.id,
    title: scenario.title,
    config: scenario.config ? structuredClone(scenario.config) : undefined,
    processes: scenario.processes.map((process) => ({ ...process })),
    files: scenario.files.map((file) => ({
      ...file,
      content: file.content?.slice(),
      attributes: file.attributes ? structuredClone(file.attributes) : undefined,
    })),
  }
}

function isValidCount(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 0
}

function isValidBuffer(buffer: IOBuffer): boolean {
  return (
    Number.isSafeInteger(buffer.capacity) &&
    buffer.capacity >= 0 &&
    buffer.data.length === buffer.capacity &&
    Number.isSafeInteger(buffer.validLength) &&
    buffer.validLength >= 0 &&
    buffer.validLength <= buffer.capacity
  )
}

function validateAttributePatch(
  currentSize: number,
  patch: MutableFileAttributes,
): { code: EngineErrorCode; message: string; details?: Readonly<Record<string, string | number | boolean>> } | undefined {
  if (patch.maxSize !== undefined && (!isValidCount(patch.maxSize) || patch.maxSize < currentSize)) {
    return {
      code: 'FILE_SIZE_LIMIT',
      message: 'El tamaño máximo no puede ser menor que el contenido actual.',
      details: { size: currentSize, maxSize: patch.maxSize },
    }
  }
  for (const [name, value] of [
    ['recordLength', patch.recordLength],
    ['keyOffset', patch.keyOffset],
    ['keyLength', patch.keyLength],
  ] as const) {
    if (value !== undefined && !isValidCount(value)) {
      return { code: 'INVALID_COUNT', message: `El atributo ${name} debe ser un entero no negativo.`, details: { value } }
    }
  }
  return undefined
}
