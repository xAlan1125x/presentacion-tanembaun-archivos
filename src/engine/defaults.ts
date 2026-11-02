import type { DidacticProtection, EngineConfig, FileAttributes, PrincipalId } from './types'

export const DEFAULT_PROTECTION: DidacticProtection = {
  model: 'filelab-didactic-v1',
  owner: { read: true, write: true },
  others: { read: true, write: false },
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  naming: {
    caseSensitive: true,
    maxLength: 255,
    forbiddenCharacters: ['\0', '/', '\\'],
    reservedNames: ['.', '..'],
    allowWhitespaceOnly: false,
  },
  transfers: {},
  clockStart: 1_700_000_000_000,
  clockStep: 1_000,
  allowDeleteOpenFiles: false,
}

export function createDefaultAttributes(principalId: PrincipalId, timestamp: number): FileAttributes {
  return {
    creatorId: principalId,
    ownerId: principalId,
    protection: structuredClone(DEFAULT_PROTECTION),
    readOnly: false,
    hidden: false,
    system: false,
    archive: false,
    temporary: false,
    locked: false,
    createdAt: timestamp,
    lastAccessedAt: timestamp,
    lastModifiedAt: timestamp,
  }
}
