export type FileId = string
export type ProcessId = string
export type PrincipalId = string
export type FileDescriptor = number

export type FileType = 'regular' | 'directory' | 'character-special' | 'block-special'
export type FileFormat = 'ascii' | 'binary'
export type OpenMode = 'read' | 'write' | 'read-write' | 'append'
export type SeekOrigin = 'start' | 'current' | 'end'

export interface DidacticPermission {
  read: boolean
  write: boolean
}

/**
 * Modelo deliberadamente pequeño de FileLab. No representa ACL, permisos POSIX
 * ni el modelo de seguridad de un sistema operativo concreto.
 */
export interface DidacticProtection {
  model: 'filelab-didactic-v1'
  owner: DidacticPermission
  others: DidacticPermission
}

export interface FileAttributes {
  creatorId: PrincipalId
  ownerId: PrincipalId
  protection: DidacticProtection
  readOnly: boolean
  hidden: boolean
  system: boolean
  archive: boolean
  temporary: boolean
  locked: boolean
  createdAt: number
  lastAccessedAt: number
  lastModifiedAt: number
  maxSize?: number
  recordLength?: number
  keyOffset?: number
  keyLength?: number
}

export type MutableFileAttributes = Partial<
  Pick<
    FileAttributes,
    | 'readOnly'
    | 'hidden'
    | 'system'
    | 'archive'
    | 'temporary'
    | 'locked'
    | 'maxSize'
    | 'recordLength'
    | 'keyOffset'
    | 'keyLength'
  >
> & {
  protection?: Partial<{
    owner: Partial<DidacticPermission>
    others: Partial<DidacticPermission>
  }>
}

export interface FileSnapshot {
  id: FileId
  name: string
  type: FileType
  format: FileFormat
  content: Uint8Array
  size: number
  attributes: FileAttributes
}

export interface OpenFileSnapshot {
  descriptor: FileDescriptor
  fileId: FileId
  mode: OpenMode
  position: number
}

export interface ProcessSnapshot {
  id: ProcessId
  principalId: PrincipalId
  openFiles: OpenFileSnapshot[]
}

export interface IOBuffer {
  /** Capacidad total reservada para la transferencia. */
  capacity: number
  /** Almacenamiento completo del búfer; puede contener espacio no válido al final. */
  data: Uint8Array
  /** Cantidad de bytes válidos producidos o disponibles. */
  validLength: number
}

export interface NamingRules {
  caseSensitive: boolean
  maxLength: number
  forbiddenCharacters: string[]
  reservedNames: string[]
  allowWhitespaceOnly: boolean
}

export interface TransferRules {
  /** Ausente significa que una lectura puede completar todo lo solicitado. */
  maxReadBytesPerCall?: number
  /** Ausente significa que una escritura puede completar todo lo solicitado. */
  maxWriteBytesPerCall?: number
}

export interface EngineConfig {
  naming: NamingRules
  transfers: TransferRules
  clockStart: number
  clockStep: number
  /** Regla explícita de FileLab; no pretende ser universal. */
  allowDeleteOpenFiles: boolean
}

export interface ScenarioFile {
  id?: FileId
  name: string
  content?: Uint8Array
  type?: FileType
  format?: FileFormat
  attributes?: MutableFileAttributes & Partial<Pick<FileAttributes, 'creatorId' | 'ownerId' | 'createdAt' | 'lastAccessedAt' | 'lastModifiedAt'>>
}

export interface ScenarioProcess {
  id?: ProcessId
  principalId: PrincipalId
}

export interface ScenarioDefinition {
  id: string
  title: string
  config?: Partial<{
    naming: Partial<NamingRules>
    transfers: TransferRules
    clockStart: number
    clockStep: number
    allowDeleteOpenFiles: boolean
  }>
  files: ScenarioFile[]
  processes: ScenarioProcess[]
}

export interface EngineSnapshot {
  scenarioId: string
  scenarioTitle: string
  clock: number
  files: FileSnapshot[]
  processes: ProcessSnapshot[]
}

export type EngineOperation =
  | 'create'
  | 'creat'
  | 'delete'
  | 'open'
  | 'close'
  | 'read'
  | 'write'
  | 'append'
  | 'seek'
  | 'get-attributes'
  | 'set-attributes'
  | 'rename'
  | 'spawn-process'
  | 'restore-scenario'

export type EngineErrorCode =
  | 'PROCESS_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'INVALID_DESCRIPTOR'
  | 'INVALID_NAME'
  | 'NAME_EXISTS'
  | 'INVALID_COUNT'
  | 'INVALID_POSITION'
  | 'MODE_VIOLATION'
  | 'PERMISSION_DENIED'
  | 'READ_ONLY'
  | 'LOCKED'
  | 'FILE_IN_USE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_SIZE_LIMIT'

export interface EngineError {
  code: EngineErrorCode
  message: string
  details?: Readonly<Record<string, string | number | boolean>>
}

export interface EngineSuccess<T> {
  ok: true
  operation: EngineOperation
  value: T
}

export interface EngineFailure {
  ok: false
  operation: EngineOperation
  error: EngineError
}

export type EngineResult<T> = EngineSuccess<T> | EngineFailure

export interface CreateResult {
  file: FileSnapshot
}

export interface CreatResult {
  file: FileSnapshot
  descriptor: FileDescriptor
  truncated: boolean
}

export interface OpenResult {
  descriptor: FileDescriptor
  fileId: FileId
  mode: OpenMode
  position: number
}

export interface CloseResult {
  descriptor: FileDescriptor
  fileId: FileId
}

export interface ReadResult {
  outcome: 'data' | 'eof'
  buffer: IOBuffer
  bytesRequested: number
  bytesTransferred: number
  positionBefore: number
  positionAfter: number
}

export interface WriteResult {
  bytesRequested: number
  bytesTransferred: number
  partial: boolean
  positionBefore: number
  positionAfter: number
  sizeBefore: number
  sizeAfter: number
}

export interface SeekResult {
  positionBefore: number
  positionAfter: number
}
