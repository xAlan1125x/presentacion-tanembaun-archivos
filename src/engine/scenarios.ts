import type { ScenarioDefinition } from './types'

const encoder = new TextEncoder()

export const BASIC_SCENARIO: ScenarioDefinition = {
  id: 'basic-file-operations',
  title: 'Operaciones básicas de archivos',
  config: {
    clockStart: 1_700_000_000_000,
    clockStep: 1_000,
    naming: { caseSensitive: true },
  },
  processes: [
    { id: 'editor', principalId: 'ana' },
    { id: 'guest', principalId: 'visitante' },
  ],
  files: [
    {
      id: 'notes',
      name: 'notas.txt',
      format: 'ascii',
      content: encoder.encode('ABC'),
      attributes: {
        ownerId: 'ana',
        creatorId: 'ana',
        protection: { owner: { read: true, write: true }, others: { read: true, write: false } },
      },
    },
  ],
}

export const CASE_INSENSITIVE_SCENARIO: ScenarioDefinition = {
  id: 'case-insensitive-names',
  title: 'Nombres sin distinción entre mayúsculas y minúsculas',
  config: { naming: { caseSensitive: false } },
  processes: [{ id: 'shell', principalId: 'estudiante' }],
  files: [{ id: 'maria', name: 'maria', format: 'ascii', content: new Uint8Array() }],
}

export function cloneScenarioDefinition(scenario: ScenarioDefinition): ScenarioDefinition {
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
