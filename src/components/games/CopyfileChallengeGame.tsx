import { useEffect, useRef, useState } from 'react'
import {
  CopyfileChallenge as CopyfileEngine,
  COPYFILE_HINTS,
  createInitialState,
  notifyPhase5ProgressUpdated,
  saveCopyChallengeEvaluation,
  type CopyChallengeSnapshot,
  type Phase5State,
} from '../../game'
import { createActiveGameStore, saveActiveGameState } from '../../supabase'

function initialState(): Phase5State {
  if (typeof window === 'undefined') return createInitialState('local-player')
  const loaded = createActiveGameStore().load()
  return loaded.ok && loaded.value ? loaded.value : createInitialState('local-player')
}

export function CopyfileChallengeGame() {
  const engineRef = useRef<CopyfileEngine | null>(null)
  if (!engineRef.current) engineRef.current = new CopyfileEngine()
  const [snapshot, setSnapshot] = useState<CopyChallengeSnapshot>(() => engineRef.current!.snapshot())
  const [phaseState, setPhaseState] = useState(initialState)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const refresh = () => { const loaded = createActiveGameStore().load(); if (loaded.ok && loaded.value) setPhaseState(loaded.value) }
    window.addEventListener('filelab:online-progress-updated', refresh)
    return () => window.removeEventListener('filelab:online-progress-updated', refresh)
  }, [])
  if (phaseState.games['copyfile-challenge'].status === 'completed') {
    const result = phaseState.games['copyfile-challenge']
    return <div className="copy-challenge-game"><section className="classification-result is-success"><div><span>Resultado definitivo del recorrido</span><strong>{result.bestScore} / 100</strong></div><p>{result.lastExplanation}</p><small>Esta etapa ya fue evaluada. Podrás repetirla al iniciar un recorrido completo nuevo.</small></section></div>
  }
  const run = (action: (engine: CopyfileEngine) => CopyChallengeSnapshot) => setSnapshot(action(engineRef.current!))
  const submit = () => {
    const evaluation = engineRef.current!.evaluate()
    setPhaseState(saveCopyChallengeEvaluation(phaseState, evaluation))
    const saved = saveActiveGameState(saveCopyChallengeEvaluation(phaseState, evaluation))
    notifyPhase5ProgressUpdated()
    setMessage(saved && !saved.ok ? saved.error : `Resultado guardado: ${evaluation.score}/100.`)
    setSnapshot(engineRef.current!.snapshot())
  }
  const source = snapshot.lab.engine.files.find((file) => file.id === 'source')
  const destination = snapshot.lab.engine.files.find((file) => file.id === 'destination')
  const handles = snapshot.lab.engine.processes.flatMap((process) => process.openFiles.map((handle) => `${handle.descriptor} · ${handle.fileId} · pos ${handle.position}`))

  return (
    <div className="copy-challenge-game">
      <div className="copy-challenge__intro">
        <div><span className="eyebrow">Operación Rescate · 5.5</span><h2>Copyfile Challenge</h2><p>El destino conserva datos viejos. Ejecutá el ciclo de Tanenbaum con operaciones reales: leé, escribí la cantidad válida, repetí hasta EOF y cerrá los descriptores.</p></div>
        <div className="copy-challenge-score"><span>Mejor resultado</span><strong>{phaseState.games['copyfile-challenge'].bestScore}<small>/100</small></strong><small>{phaseState.games['copyfile-challenge'].attempts} intento(s)</small></div>
      </div>
      <div className="copy-challenge-mission"><span>Objetivo</span><p>El destino debe quedar idéntico al origen. Una lectura parcial no es un error y EOF es un resultado exitoso; una escritura parcial exige continuar con los bytes pendientes.</p></div>
      <div className="copy-challenge-files">
        <article><span>Origen</span><strong>{source?.name}</strong><b>{source?.size} B</b><small>fd {snapshot.sourceDescriptor ?? '—'}</small></article>
        <article className={snapshot.pendingBytes.length > 0 ? 'is-active' : ''}><span>Búfer válido</span><strong>{snapshot.pendingBytes.length} B</strong><b>{snapshot.pendingBytes.length ? [...snapshot.pendingBytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ') : 'vacío'}</b><small>bytes pendientes de esta lectura</small></article>
        <article><span>Destino</span><strong>{destination?.name}</strong><b>{destination?.size} B</b><small>fd {snapshot.destinationDescriptor ?? '—'}</small></article>
      </div>
      <div className="copy-challenge-layout">
        <section className="copy-challenge-controls" aria-labelledby="copy-challenge-controls-title">
          <header><span>Llamadas simuladas</span><strong id="copy-challenge-controls-title">Operaciones disponibles</strong></header>
          <div className="copy-challenge-buttons">
            <button type="button" onClick={() => run((engine) => engine.openSource())}>open origen</button>
            <button type="button" onClick={() => run((engine) => engine.prepareDestination())}>creat destino</button>
            <button type="button" onClick={() => run((engine) => engine.read())}>read 4096</button>
            <button type="button" onClick={() => run((engine) => engine.write())}>write bytes válidos</button>
            <button type="button" onClick={() => run((engine) => engine.writeWrongCount())}>probar cantidad incorrecta</button>
            <button type="button" onClick={() => run((engine) => engine.closeSource())}>close origen</button>
            <button type="button" onClick={() => run((engine) => engine.closeDestination())}>close destino</button>
          </div>
          <p className="copy-challenge-status" role="status">{snapshot.message}</p>
        </section>
        <section className="copy-challenge-observer" aria-labelledby="copy-challenge-observer-title">
          <header><span>Estado observable</span><strong id="copy-challenge-observer-title">{snapshot.bytesCopied} B copiados · {snapshot.reads} lecturas · {snapshot.writes} escrituras</strong></header>
          <div><span>Descriptores</span><strong>{handles.length ? handles.join(' · ') : 'ninguno'}</strong></div>
          <div><span>EOF</span><strong>{snapshot.eofReached ? 'alcanzado correctamente' : 'pendiente'}</strong></div>
          <div><span>Escrituras parciales</span><strong>{snapshot.writes > 0 && snapshot.bytesCopied < (source?.size ?? 0) ? 'posibles: observá los bytes pendientes' : '—'}</strong></div>
        </section>
      </div>
      <section className="copy-challenge-history" aria-labelledby="copy-challenge-history-title">
        <header><span>Traza de llamadas</span><strong id="copy-challenge-history-title">{snapshot.actions.length} acción(es)</strong></header>
        <div>{snapshot.actions.slice().reverse().map((action) => <article key={action.id} className={action.ok ? 'is-ok' : 'is-error'}><b>{action.id}</b><code>{action.name}</code><p>{action.message}</p></article>)}</div>
      </section>
      <div className="copy-challenge-hints"><span>Pistas opcionales</span>{COPYFILE_HINTS.map((hint) => <button type="button" key={hint.id} onClick={() => run((engine) => engine.useHint(hint.id))} disabled={snapshot.hintsUsed.includes(hint.id)}>{snapshot.hintsUsed.includes(hint.id) ? hint.text : `Pedir pista (-${hint.penaltyPoints})`}</button>)}</div>
      <div className="copy-challenge-actions"><button type="button" className="primary-action" onClick={submit}>Comprobar copia <span aria-hidden="true">→</span></button><span>{snapshot.completed ? 'Copia completa' : 'Destino todavía no validado'}</span></div>
      {message && <p className="copy-challenge-persistence" role="status">{message}</p>}
    </div>
  )
}
