import { useEffect, useMemo, useState } from 'react'
import {
  CLASSIFIABLE_FILES,
  createInitialState,
  notifyPhase5ProgressUpdated,
  evaluateClassifications,
  saveClassificationEvaluation,
  type Classification,
  type ClassificationAnswers,
  type ClassificationEvaluation,
  type ClassifiedFileType,
  type ClassifiedFormat,
  type ClassifiedStructure,
  type Phase5State,
} from '../../game'
import { createActiveGameStore, saveActiveGameState } from '../../supabase'

const typeOptions: { value: ClassifiedFileType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'character-special', label: 'Especial · caracteres' },
  { value: 'block-special', label: 'Especial · bloques' },
]
const formatOptions: { value: ClassifiedFormat; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'binary', label: 'Binario' },
  { value: 'not-applicable', label: 'No aplica' },
]
const structureOptions: { value: ClassifiedStructure; label: string }[] = [
  { value: 'bytes', label: 'Secuencia de bytes' },
  { value: 'records', label: 'Registros' },
  { value: 'tree', label: 'Árbol de registros' },
  { value: 'not-applicable', label: 'No aplica' },
]

function initialGameState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

export function ClassificationGame() {
  const [phaseState, setPhaseState] = useState(initialGameState)
  const [answers, setAnswers] = useState<ClassificationAnswers>({})
  const [selectedId, setSelectedId] = useState(CLASSIFIABLE_FILES[0].id)
  const [evaluation, setEvaluation] = useState<ClassificationEvaluation | null>(null)
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const selectedFile = useMemo(() => CLASSIFIABLE_FILES.find((file) => file.id === selectedId) ?? CLASSIFIABLE_FILES[0], [selectedId])
  const selectedAnswer = answers[selectedFile.id] ?? {}
  useEffect(() => {
    const refresh = () => {
      const loaded = createActiveGameStore().load()
      if (loaded.ok && loaded.value) setPhaseState(loaded.value)
    }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])

  if (phaseState.games['classify-files'].status === 'completed') {
    const result = phaseState.games['classify-files']
    return <div className="rescue-game"><section className="classification-result is-success"><div><span>Resultado definitivo del recorrido</span><strong>{result.bestScore} / 100</strong></div><p>{result.lastExplanation}</p><small>Esta etapa ya fue evaluada. Podrás repetirla al iniciar un recorrido completo nuevo.</small></section></div>
  }

  const updateAnswer = <K extends keyof Classification>(key: K, value: Classification[K]) => {
    setAnswers((current) => ({ ...current, [selectedFile.id]: { ...current[selectedFile.id], [key]: value } }))
    setEvaluation(null)
  }

  const submit = () => {
    const next = evaluateClassifications(answers)
    setEvaluation(next)
    const nextState = saveClassificationEvaluation(phaseState, next)
    setPhaseState(nextState)
    const saved = saveActiveGameState(nextState)
    notifyPhase5ProgressUpdated()
    setPersistenceMessage(saved && !saved.ok ? saved.error : 'Progreso guardado localmente.')
  }

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    const fileId = event.dataTransfer.getData('text/filelab-id')
    if (CLASSIFIABLE_FILES.some((file) => file.id === fileId)) setSelectedId(fileId)
  }

  return (
    <div className="rescue-game">
      <div className="rescue-game__intro">
        <div>
          <span className="eyebrow">Operación Rescate · 5.2</span>
          <h2>Clasificá los archivos</h2>
          <p>La central recibió archivos con etiquetas confusas. Inspeccioná la evidencia y ubicá cada uno sin mezclar <strong>tipo</strong>, <strong>formato</strong> y <strong>estructura</strong>.</p>
        </div>
        <div className="rescue-score" aria-label={`Puntaje máximo 100, mejor puntaje ${phaseState.games['classify-files'].bestScore}`}>
          <span>Mejor resultado</span>
          <strong>{phaseState.games['classify-files'].bestScore}<small>/100</small></strong>
          <small>{phaseState.games['classify-files'].attempts} intento(s)</small>
        </div>
      </div>

      <div className="rescue-game__instructions">
        <span>Cómo jugar</span>
        <p>Seleccioná un archivo, revisá sus pistas y asigná una opción en cada eje. También podés arrastrar una tarjeta hacia otra para inspeccionarla; la selección por botones funciona sin arrastre.</p>
      </div>

      <div className="classification-workspace">
        <section className="classification-files" aria-labelledby="classification-files-title">
          <header><span>Inventario</span><strong id="classification-files-title">{CLASSIFIABLE_FILES.length} archivos rescatados</strong></header>
          <div className="classification-file-list">
            {CLASSIFIABLE_FILES.map((file) => {
              const answer = answers[file.id]
              const complete = answer?.type && answer.format && answer.structure
              return (
                <button
                  type="button"
                  key={file.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/filelab-id', file.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => { setSelectedId(file.id); setEvaluation(null) }}
                  className={selectedId === file.id ? 'is-selected' : ''}
                  aria-pressed={selectedId === file.id}
                >
                  <span className="classification-file-icon">{file.target.type === 'regular' ? 'FILE' : 'DEV'}</span>
                  <span><strong>{file.name}</strong><small>{file.description}</small></span>
                  <b aria-label={complete ? 'Clasificación completa' : 'Pendiente'}>{complete ? '✓' : '·'}</b>
                </button>
              )
            })}
          </div>
        </section>

        <section className="classification-inspector" aria-labelledby="classification-inspector-title">
          <header><span>Evidencia observable</span><strong id="classification-inspector-title">{selectedFile.name}</strong></header>
          <p>{selectedFile.description}</p>
          <div className="classification-evidence">
            <div><span>Bytes / flujo</span><code>{selectedFile.bytes}</code></div>
            <div><span>Cabecera o indicador</span><strong>{selectedFile.header}</strong></div>
            <div><span>Propiedades</span><ul>{selectedFile.properties.map((property) => <li key={property}>{property}</li>)}</ul></div>
          </div>
          <div className="classification-axis">
            <ClassificationAxis label="Tipo de archivo" value={selectedAnswer.type} options={typeOptions} onChange={(value) => updateAnswer('type', value)} />
            <ClassificationAxis label="Formato del contenido" value={selectedAnswer.format} options={formatOptions} onChange={(value) => updateAnswer('format', value)} />
            <ClassificationAxis label="Estructura interna" value={selectedAnswer.structure} options={structureOptions} onChange={(value) => updateAnswer('structure', value)} />
          </div>
        </section>
      </div>

      <div className="classification-actions">
        <button type="button" className="primary-action" onClick={submit}>Evaluar clasificación <span aria-hidden="true">→</span></button>
        <span>{Object.values(answers).reduce((sum, answer) => sum + Object.keys(answer).length, 0)} / {CLASSIFIABLE_FILES.length * 3} decisiones tomadas</span>
      </div>

      {evaluation && <section className={`classification-result ${evaluation.score === 100 ? 'is-success' : ''}`} aria-live="polite">
        <div><span>Resultado</span><strong>{evaluation.score} / 100</strong></div>
        <p>{evaluation.explanation}</p>
        {evaluation.checks.some((check) => !check.correct) && <div className="classification-errors"><strong>Pistas para corregir:</strong>{evaluation.checks.filter((check) => !check.correct).map((check) => <p key={check.fileId}><b>{CLASSIFIABLE_FILES.find((file) => file.id === check.fileId)?.name}</b> · {check.mistakes.join(' ')} {check.explanation}</p>)}</div>}
      </section>}
      {persistenceMessage && <p className="rescue-persistence" role="status">{persistenceMessage}</p>}
    </div>
  )
}

function ClassificationAxis<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <fieldset><legend>{label}</legend><div>{options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'is-active' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></fieldset>
}
