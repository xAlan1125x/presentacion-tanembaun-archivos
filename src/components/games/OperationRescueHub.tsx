import { useEffect, useState } from 'react'
import {
  createInitialState,
  createLocalGameStore,
  GAME_IDS,
  notifyPhase5ProgressUpdated,
  PHASE5_PROGRESS_EVENT,
  totalScore,
  progressPercentage,
  validateNickname,
  type GameId,
  type Phase5State,
} from '../../game'
import { TeacherSessionPanel } from '../online/TeacherSessionPanel'
import {
  getOnlineParticipant,
  loadOnlineState,
  clearOnlineParticipant,
  restoreOnlineState,
  retryOnlineSync,
  saveOnlineParticipant,
  signInAnonymousParticipant,
  joinSession,
  finalizeParticipant,
  loadSessionRanking,
  ONLINE_PROGRESS_EVENT,
} from '../../supabase'
import type { RankingEntry } from '../../supabase'

interface OperationRescueHubProps {
  state: Phase5State | null
  onStateChange: (state: Phase5State | null) => void
  onNavigate: (id: string) => void
}

const GAME_DETAILS: Record<GameId, { title: string; section: string; concept: string }> = {
  'classify-files': { title: 'Clasificá los archivos', section: 'clasificar-archivos', concept: 'nombres, tipos, formatos y estructuras' },
  'digital-detective': { title: 'Detective digital', section: 'detective-digital', concept: 'evidencias, atributos y acontecimientos' },
  'repair-system': { title: 'Repará el sistema', section: 'reparar-sistema', concept: 'permisos, descriptores y cursores' },
  'copyfile-challenge': { title: 'Copyfile Challenge', section: 'copyfile-challenge', concept: 'búferes, transferencias y EOF' },
  'escape-room': { title: 'Escape Room', section: 'escape-room', concept: 'integración de 4.1.1–4.1.7' },
}

function loadSavedState(): Phase5State | null {
  if (typeof window === 'undefined') return null
  const loaded = createLocalGameStore(window.localStorage).load()
  if (!loaded.ok || !loaded.value || loaded.value.playerId === 'local-player') return null
  return loaded.value
}

export function OperationRescueHub({ state, onStateChange, onNavigate }: OperationRescueHubProps) {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [joinCode, setJoinCode] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('partida')?.toUpperCase() ?? '')
  const [onlineMessage, setOnlineMessage] = useState('')
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [hasInvitation] = useState(() => typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('partida')))
  const [entryMode, setEntryMode] = useState<'local' | 'online' | null>(() => hasInvitation ? 'online' : null)

  useEffect(() => {
    const refresh = (event: Event) => {
      const participant = getOnlineParticipant()
      onStateChange(participant ? loadOnlineState(participant) : loadSavedState())
      const detail = (event as CustomEvent<{ message?: string; error?: string }>).detail
      if (detail?.message) setOnlineMessage(detail.message)
      if (detail?.error) setOnlineMessage(`Sin sincronización: ${detail.error}`)
    }
    window.addEventListener(PHASE5_PROGRESS_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(PHASE5_PROGRESS_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [onStateChange])

  useEffect(() => {
    const participant = getOnlineParticipant()
    if (!participant) return
    void loadSessionRanking(participant.sessionId).then((result) => {
      if (!result.error) setRanking(result.ranking)
    })
  }, [state?.updatedAt])

  useEffect(() => {
    const participant = getOnlineParticipant()
    if (!participant || (joinCode && participant.joinCode !== joinCode)) return
    void restoreOnlineState(participant).then((result) => {
      onStateChange(result.state)
      setOnlineMessage(result.error ? `Sin conexión: ${result.error.message}` : `Partida online recuperada como ${participant.nickname}.`)
    })
    const refresh = () => {
      const current = getOnlineParticipant()
      if (!current) return
      void retryOnlineSync().then((sync) => {
        if (sync.error) {
          setOnlineMessage(`Sin conexión: ${sync.error.message}`)
          return
        }
        return restoreOnlineState(current).then((result) => {
          onStateChange(result.state)
          setOnlineMessage(result.error ? `Sin conexión: ${result.error.message}` : 'Progreso pendiente sincronizado con Supabase.')
        })
      })
    }
    window.addEventListener(ONLINE_PROGRESS_EVENT, refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.removeEventListener(ONLINE_PROGRESS_EVENT, refresh)
      window.removeEventListener('online', refresh)
    }
  }, [onStateChange])

  const start = () => {
    const validation = validateNickname(nickname)
    if (!validation.valid) {
      setError(validation.error ?? 'El apodo no es válido.')
      return
    }
    const next = createInitialState(validation.value)
    const saved = typeof window === 'undefined' ? null : createLocalGameStore(window.localStorage).save(next)
    if (saved && !saved.ok) {
      setError(saved.error)
      return
    }
    setError('')
    onStateChange(next)
    notifyPhase5ProgressUpdated()
  }

  const joinOnline = async (event: React.FormEvent) => {
    event.preventDefault()
    const nicknameValidation = validateNickname(nickname)
    if (!nicknameValidation.valid) {
      setOnlineMessage(nicknameValidation.error ?? 'El apodo no es válido.')
      return
    }
    if (!/^[A-F0-9]{8}$/i.test(joinCode.trim())) {
      setOnlineMessage('El código debe tener 8 caracteres hexadecimales.')
      return
    }
    setOnlineBusy(true)
    setOnlineMessage('Conectando con Supabase…')
    const auth = await signInAnonymousParticipant()
    if (auth.error) {
      setOnlineMessage(`No se pudo iniciar la sesión anónima: ${auth.error.message}`)
      setOnlineBusy(false)
      return
    }
    const joined = await joinSession(joinCode, nicknameValidation.value)
    if (joined.error || !joined.participantId || !joined.sessionId || !joined.nickname) {
      setOnlineMessage(joined.error?.message ?? 'No se pudo ingresar a la partida.')
      setOnlineBusy(false)
      return
    }
    const participant = { participantId: joined.participantId, sessionId: joined.sessionId, joinCode: joinCode.trim().toUpperCase(), nickname: joined.nickname, ...(joined.finishedAt ? { finishedAt: joined.finishedAt } : {}) }
    const saved = saveOnlineParticipant(participant)
    if (!saved.ok) {
      setOnlineMessage(saved.error)
      setOnlineBusy(false)
      return
    }
    const restored = await restoreOnlineState(participant)
    setOnlineMessage(restored.error ? `Ingresaste, pero falta sincronizar: ${restored.error.message}` : 'Partida online guardada y lista para jugar.')
    setOnlineBusy(false)
    onStateChange(restored.state)
  }

  const reset = () => {
    if (!window.confirm('¿Reiniciar toda la partida de Operación Rescate? Se borrarán sus cinco resultados, pero no el explorador ni las demostraciones.')) return
    const cleared = getOnlineParticipant()
      ? clearOnlineParticipant()
      : createLocalGameStore(window.localStorage).clear()
    if (!cleared.ok) {
      setError(cleared.error)
      return
    }

    setError('')
    onStateChange(null)
    notifyPhase5ProgressUpdated()
  }

  const leaveOnline = () => {
    if (!window.confirm('¿Salir de esta partida online en este dispositivo? El progreso remoto no se borrará.')) return
    const result = clearOnlineParticipant()
    if (!result.ok) {
      setError(result.error)
      return
    }

    setOnlineMessage('Partida online desconectada. El modo local vuelve a estar disponible.')
    onStateChange(null)
  }

  const finishOnlineParticipation = async () => {
    const participant = getOnlineParticipant()
    if (!participant || !state || GAME_IDS.some((gameId) => state.games[gameId].status !== 'completed')) return
    if (!window.confirm('¿Finalizar tu participación? Después no podrás modificar tus resultados en esta partida.')) return
    setOnlineBusy(true)
    const result = await finalizeParticipant(participant.participantId)
    if (result.error) {
      setOnlineMessage(result.error.message)
      setOnlineBusy(false)
      return
    }
    const saved = saveOnlineParticipant({ ...participant, finishedAt: result.finishedAt ?? new Date().toISOString() })
    setOnlineMessage(saved.ok ? 'Participación finalizada. Tus resultados ya están en la clasificación.' : saved.error)
    const refreshed = await loadSessionRanking(participant.sessionId)
    if (!refreshed.error) setRanking(refreshed.ranking)
    setOnlineBusy(false)
  }

  if (!state) {
    return (
      <div className="rescue-hub rescue-hub--welcome">
        <div className="rescue-hub__welcome-copy">
          <span className="eyebrow">{hasInvitation ? 'Invitación a partida online' : 'Misión local · cinco etapas'}</span>
          <h2>Operación Rescate</h2>
          <p>{hasInvitation ? 'Elegí un apodo e ingresá a la partida. Tu progreso se conservará en este dispositivo y se sincronizará con la clasificación.' : <>Recuperá la información resolviendo desafíos sobre nombres, estructuras, atributos, operaciones y el programa <em>copyfile</em>. Avanzás a tu ritmo y tu mejor resultado queda guardado sólo en este dispositivo.</>}</p>
        </div>
        {!entryMode && <div className="rescue-hub__identity">
          <label>¿Cómo querés jugar?</label>
          <div className="rescue-hub__entry-options">
            <button type="button" className="primary-action" onClick={() => setEntryMode('local')}>Jugar individualmente</button>
            <button type="button" className="filelab-secondary-button" onClick={() => setEntryMode('online')}>Unirse a una partida</button>
          </div>
        </div>}
        {entryMode === 'local' && <form className="rescue-hub__identity" onSubmit={(event) => { event.preventDefault(); start() }}>
          <label htmlFor="rescue-nickname">Elegí un apodo</label>
          <input id="rescue-nickname" value={nickname} onChange={(event) => { setNickname(event.target.value); setError('') }} maxLength={32} placeholder="Ej.: Ada-42" autoComplete="nickname" />
          <small>2–24 caracteres: letras, números, espacios, guiones o guiones bajos.</small>
          {error && <p className="rescue-hub__error" role="alert">{error}</p>}
          <button type="submit" className="primary-action">Comenzar misión <span aria-hidden="true">→</span></button>
        </form>}
        {entryMode === 'online' && <form className="rescue-hub__identity" onSubmit={joinOnline}>
          <label htmlFor="rescue-join-code">Código de partida</label>
          <input id="rescue-join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} placeholder="8 caracteres" disabled={onlineBusy} readOnly={hasInvitation} />
          <label htmlFor="rescue-online-nickname">Elegí un apodo</label>
          <input id="rescue-online-nickname" value={nickname} onChange={(event) => { setNickname(event.target.value); setOnlineMessage('') }} maxLength={32} placeholder="Ej.: Ada-42" autoComplete="nickname" disabled={onlineBusy} />
          <small>2–24 caracteres: letras, números, espacios, guiones o guiones bajos.</small>
          <button type="submit" className="primary-action" disabled={onlineBusy}>{onlineBusy ? 'Conectando…' : 'Entrar a partida online →'}</button>
          {onlineMessage && <p className="rescue-hub__privacy" role="status">{onlineMessage}</p>}
        </form>}
        <p className="rescue-hub__privacy">El modo local y el modo online usan progresos separados. Las puntuaciones online se calculan en el navegador y no son una medida segura contra manipulaciones.</p>
        {!hasInvitation && <TeacherSessionPanel />}
      </div>
    )
  }

  const score = totalScore(state)
  const completed = GAME_IDS.filter((gameId) => state.games[gameId].status === 'completed').length
  return (
    <div className="rescue-hub">
      <div className="rescue-hub__header">
        <div><span className="eyebrow">{getOnlineParticipant() ? 'Partida online de' : 'Partida local de'}</span><h2>{state.playerId}</h2><p>{getOnlineParticipant()?.finishedAt ? 'Tu participación está finalizada.' : 'Elegí cualquier etapa disponible. Podés repetirla: el panel conserva sólo el mejor resultado de cada una.'}</p></div>
        <div className="rescue-hub__total" aria-label={`Puntuación total ${score} de 1000`}><span>Puntuación total</span><strong>{score}<small>/1.000</small></strong><div><i style={{ width: `${progressPercentage(state)}%` }} /></div><small>{completed}/5 etapas completadas</small></div>
      </div>
      {onlineMessage && <p className="rescue-hub__privacy" role="status">{onlineMessage}</p>}
      <div className="rescue-hub__stages">{GAME_IDS.map((gameId) => {
        const game = state.games[gameId]
        const details = GAME_DETAILS[gameId]
        const status = game.status === 'completed' ? 'Completada' : game.status === 'in-progress' ? 'Iniciada' : 'Pendiente'
        return <article key={gameId} className={`rescue-hub__stage rescue-hub__stage--${game.status}`}><div className="rescue-hub__stage-number">{GAME_IDS.indexOf(gameId) + 1}</div><div className="rescue-hub__stage-content"><span>{status}</span><h3>{details.title}</h3><p>{details.concept}</p><small>{game.attempts ? `${game.attempts} intento(s) · mejor ${game.bestScore}/200` : 'Todavía no hay resultados evaluados.'}</small>{game.lastExplanation && <em>{game.lastExplanation}</em>}</div><button type="button" onClick={() => onNavigate(details.section)} disabled={Boolean(getOnlineParticipant()?.finishedAt)}>{game.status === 'not-started' ? 'Comenzar' : 'Abrir etapa'} <span aria-hidden="true">→</span></button></article>
      })}</div>
      {completed === 5 && <section className="rescue-hub__final" aria-labelledby="rescue-final-title"><span className="eyebrow">Misión completa</span><h3 id="rescue-final-title">Buen trabajo, {state.playerId}</h3><p>Integraste que un archivo se identifica por más que su nombre: sus tipos, formatos, estructuras, atributos y bytes determinan cómo puede interpretarse y operarse. También verificaste que los descriptores, los cursores, EOF y las transferencias deben observarse en el estado real del sistema.</p><div>{GAME_IDS.map((gameId) => <span key={gameId}>{GAME_DETAILS[gameId].title}: <strong>{state.games[gameId].bestScore}/200</strong></span>)}</div>{getOnlineParticipant() && !getOnlineParticipant()?.finishedAt && <button type="button" className="primary-action" onClick={finishOnlineParticipation} disabled={onlineBusy}>Finalizar participación</button>}{getOnlineParticipant()?.finishedAt && <strong>Participación finalizada</strong>}</section>}
      {getOnlineParticipant() && <section className="rescue-ranking" aria-labelledby="rescue-ranking-title"><div><span className="eyebrow">Clasificación final</span><h3 id="rescue-ranking-title">Participantes finalizados</h3></div>{ranking.length ? <table><thead><tr><th>Posición</th><th>Apodo</th><th>Puntaje</th></tr></thead><tbody>{ranking.map((entry) => <tr key={`${entry.position}-${entry.nickname}`}><td>{entry.position}</td><td>{entry.nickname}</td><td>{entry.totalScore}/1.000</td></tr>)}</tbody></table> : <p>Aún no hay participantes finalizados.</p>}</section>}
      <div className="rescue-hub__footer"><p><strong>Qué vas a integrar:</strong> distinguir la identidad de un archivo de sus bytes, observar metadatos y protección, usar descriptores y cursores, transferir datos correctamente y justificar cada decisión.</p><small>{getOnlineParticipant() ? 'Partida online: los cambios se guardan localmente y se sincronizan cuando hay conexión.' : 'Partida local de práctica.'}</small>{getOnlineParticipant() && <button type="button" className="filelab-secondary-button" onClick={leaveOnline}>Salir de partida online</button>}<button type="button" className="filelab-secondary-button" onClick={reset}>Reiniciar partida completa</button></div>
    </div>
  )
}
