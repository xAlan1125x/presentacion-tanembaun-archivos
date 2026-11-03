import { useEffect, useMemo, useState } from 'react'
import {
  DIGITAL_DETECTIVE_CASE,
  createInitialState,
  notifyPhase5ProgressUpdated,
  evaluateInvestigation,
  saveDetectiveEvaluation,
  type DetectiveAnswers,
  type DetectiveEvaluation,
  type Phase5State,
} from '../../game'
import { createActiveGameStore, saveActiveGameState } from '../../supabase'

function initialGameState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

export function DigitalDetectiveGame() {
  const [phaseState, setPhaseState] = useState(initialGameState)
  const [answers, setAnswers] = useState<DetectiveAnswers>({ selectedEvidenceIds: [] })
  const [inspectedId, setInspectedId] = useState(DIGITAL_DETECTIVE_CASE.evidence[0].id)
  const [evaluation, setEvaluation] = useState<DetectiveEvaluation | null>(null)
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const inspected = useMemo(
    () => DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === inspectedId) ?? DIGITAL_DETECTIVE_CASE.evidence[0],
    [inspectedId],
  )
  const selectedIds = new Set(answers.selectedEvidenceIds)
  useEffect(() => {
    const refresh = () => { const loaded = createActiveGameStore().load(); if (loaded.ok && loaded.value) setPhaseState(loaded.value) }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])

  if (phaseState.games['digital-detective'].status === 'completed') {
    const result = phaseState.games['digital-detective']
    return <div className="detective-game"><section className="detective-result is-success"><div><span>Resultado definitivo del recorrido</span><strong>{result.bestScore} / 100</strong></div><p>{result.lastExplanation}</p><small>Esta etapa ya fue evaluada. Podrás repetirla al iniciar un recorrido completo nuevo.</small></section></div>
  }

  const toggleEvidence = (id: string) => {
    setAnswers((current) => ({
      ...current,
      selectedEvidenceIds: current.selectedEvidenceIds.includes(id)
        ? current.selectedEvidenceIds.filter((item) => item !== id)
        : [...current.selectedEvidenceIds, id],
    }))
    setEvaluation(null)
  }

  const revealHint = (id: string) => {
    setAnswers((current) => ({
      ...current,
      revealedHintIds: current.revealedHintIds?.includes(id)
        ? current.revealedHintIds
        : [...(current.revealedHintIds ?? []), id],
    }))
    setEvaluation(null)
  }

  const submit = () => {
    const next = evaluateInvestigation(answers)
    setEvaluation(next)
    const nextState = saveDetectiveEvaluation(phaseState, next)
    setPhaseState(nextState)
    const saved = saveActiveGameState(nextState)
    notifyPhase5ProgressUpdated()
    setPersistenceMessage(saved && !saved.ok ? saved.error : 'Expediente guardado localmente.')
  }

  return (
    <div className="detective-game">
      <div className="detective-game__intro">
        <div>
          <span className="eyebrow">Operación Rescate · 5.3</span>
          <h2>Detective digital</h2>
          <p>La central recibió un archivo incompleto. Explorá el expediente, distinguí hechos de interpretaciones y reconstruí la secuencia que produjo el incidente.</p>
        </div>
        <div className="detective-score" aria-label={`Mejor resultado ${phaseState.games['digital-detective'].bestScore} de 100`}>
          <span>Mejor resultado</span>
          <strong>{phaseState.games['digital-detective'].bestScore}<small>/100</small></strong>
          <small>{phaseState.games['digital-detective'].attempts} intento(s)</small>
        </div>
      </div>

      <div className="detective-incident">
        <span>Incidente abierto</span>
        <p>{DIGITAL_DETECTIVE_CASE.incident}</p>
      </div>

      <div className="detective-workspace">
        <section className="detective-evidence-panel" aria-labelledby="detective-evidence-title">
          <header><span>Explorador de evidencias</span><strong id="detective-evidence-title">{DIGITAL_DETECTIVE_CASE.evidence.length} piezas del expediente</strong></header>
          <p className="detective-helper">Abrí una pieza para inspeccionarla y marcala si querés usarla para sostener tu diagnóstico.</p>
          <div className="detective-evidence-list">
            {DIGITAL_DETECTIVE_CASE.evidence.map((item) => (
              <article key={item.id} className={`detective-evidence-card ${inspected.id === item.id ? 'is-inspected' : ''} ${selectedIds.has(item.id) ? 'is-selected' : ''}`}>
                <button type="button" onClick={() => setInspectedId(item.id)} aria-pressed={inspected.id === item.id}>
                  <span className={`detective-kind is-${item.kind}`}>{item.kind === 'file' ? 'FILE' : 'LOG'}</span>
                  <span><strong>{item.title}</strong><small>{item.timestamp} · {item.summary}</small></span>
                </button>
                <button type="button" className="detective-evidence-toggle" onClick={() => toggleEvidence(item.id)} aria-pressed={selectedIds.has(item.id)}>
                  {selectedIds.has(item.id) ? 'Usada ✓' : 'Usar evidencia'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="detective-inspector" aria-labelledby="detective-inspector-title">
          <header><span>Inspector objetivo</span><strong id="detective-inspector-title">{inspected.title}</strong></header>
          <p className="detective-objective">{inspected.objective}</p>
          <dl className="detective-facts">
            <div><dt>Momento</dt><dd>{inspected.timestamp}</dd></div>
            <div><dt>Tipo de evidencia</dt><dd>{inspected.kind === 'file' ? 'Archivo' : 'Acontecimiento del registro'}</dd></div>
            <div><dt>Contenido</dt><dd><code>{inspected.content}</code></dd></div>
            <div><dt>Bytes / transferencia</dt><dd><code>{inspected.bytes}</code></dd></div>
            <div><dt>Propiedades</dt><dd>{inspected.properties.join(' · ')}</dd></div>
            <div><dt>Atributos</dt><dd>{inspected.attributes.join(' · ')}</dd></div>
          </dl>
          <p className="detective-boundary"><strong>Hecho observable:</strong> estos datos pertenecen al simulador. La conclusión sobre la causa la construís al final.</p>
        </section>
      </div>

      <section className="detective-timeline" aria-labelledby="detective-timeline-title">
        <header><span>Registro de acontecimientos</span><strong id="detective-timeline-title">Secuencia temporal</strong></header>
        <div>{['source', 'creat', 'report'].map((id) => {
          const item = DIGITAL_DETECTIVE_CASE.evidence.find((evidence) => evidence.id === id)
          return item ? <button type="button" key={item.id} onClick={() => setInspectedId(item.id)} className={inspected.id === item.id ? 'is-active' : ''}><time>{item.timestamp}</time><strong>{item.title}</strong><small>{item.summary}</small></button> : null
        })}</div>
      </section>

      <section className="detective-conclusion" aria-labelledby="detective-conclusion-title">
        <div className="detective-conclusion__header">
          <span>Reconstrucción</span>
          <h3 id="detective-conclusion-title">Cerrá el caso con una hipótesis sustentada</h3>
          <p>Elegí una explicación y marcá las piezas que realmente la demuestran. No alcanza con que una pista tenga un nombre parecido.</p>
        </div>
        <fieldset className="detective-hypotheses">
          <legend>Hipótesis del incidente</legend>
          {DIGITAL_DETECTIVE_CASE.hypotheses.map((hypothesis) => <label key={hypothesis.id}><input type="radio" name="detective-hypothesis" checked={answers.hypothesisId === hypothesis.id} onChange={() => { setAnswers((current) => ({ ...current, hypothesisId: hypothesis.id })); setEvaluation(null) }} /><span><strong>{hypothesis.label}</strong><small>{hypothesis.id === 'truncated-copy' ? 'Relacioná creat, write, tamaño y bytes.' : 'Comprobá si esta interpretación explica todos los hechos.'}</small></span></label>)}
        </fieldset>
        <div className="detective-hints">
          <span>Pistas progresivas</span>
          {DIGITAL_DETECTIVE_CASE.hints.map((hint) => <button key={hint.id} type="button" onClick={() => revealHint(hint.id)} disabled={answers.revealedHintIds?.includes(hint.id)}>{answers.revealedHintIds?.includes(hint.id) ? hint.text : `Pedir pista (-${hint.penaltyPoints} puntos)`}</button>)}
        </div>
        <div className="detective-actions">
          <button type="button" className="primary-action" onClick={submit}>Presentar diagnóstico <span aria-hidden="true">→</span></button>
          <span>{answers.selectedEvidenceIds.length} evidencia(s) marcada(s) · {answers.revealedHintIds?.length ?? 0} pista(s)</span>
        </div>
      </section>

      {evaluation && <section className={`detective-result ${evaluation.score === 100 ? 'is-success' : ''}`} aria-live="polite">
        <div><span>Resultado del expediente</span><strong>{evaluation.score} / 100</strong></div>
        <p>{evaluation.explanation}</p>
        <div className="detective-result-details">
          <span>Evidencias relevantes: {evaluation.relevantEvidenceIds.length}/{DIGITAL_DETECTIVE_CASE.hypotheses[0].requiredEvidenceIds.length}</span>
          {evaluation.missingEvidenceIds.length > 0 && <span>Faltan: {evaluation.missingEvidenceIds.join(', ')}</span>}
          {evaluation.contextualEvidenceIds.length > 0 && <span>Contextuales, no necesarias: {evaluation.contextualEvidenceIds.join(', ')}</span>}
          {evaluation.misleadingEvidenceIds.length > 0 && <span>Pistas engañosas marcadas: {evaluation.misleadingEvidenceIds.join(', ')}</span>}
        </div>
        <div className="detective-evidence-explanations">
          {evaluation.evidenceExplanations.map((evidence) => <p key={evidence.evidenceId}><strong>{evidence.title}</strong> · {evidence.explanation}</p>)}
        </div>
      </section>}
      {persistenceMessage && <p className="detective-persistence" role="status">{persistenceMessage}</p>}
    </div>
  )
}
