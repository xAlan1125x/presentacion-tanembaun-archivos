import { useEffect, useState } from 'react'
import {
  createInitialState,
  createLocalGameStore,
  fixedGamesScore,
  GAME_IDS,
  isGameUnlocked,
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
  createActiveGameStore,
  getOnlineParticipant,
  loadOnlineState,
  clearOnlineParticipant,
  restoreOnlineState,
  retryOnlineSync,
  saveOnlineParticipant,
  signInAnonymousParticipant,
  joinSession,
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
  'escape-room': { title: 'FileLab Factory', section: 'filelab-factory', concept: 'secuencias de llamadas y gestión de pedidos' },
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
    if (participant.rulesVersion !== 3) {
      setOnlineMessage('La partida guardada usa la escala anterior y no se mezcla con los recorridos nuevos.')
      return
    }
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
    if (joined.rulesVersion !== 3) {
      setOnlineMessage('Esta es una partida de la escala anterior. Sus resultados se conservan, pero no se pueden mezclar con recorridos v3.')
      setOnlineBusy(false)
      return
    }
    const participant = { participantId: joined.participantId, sessionId: joined.sessionId, joinCode: joinCode.trim().toUpperCase(), nickname: joined.nickname, rulesVersion: joined.rulesVersion, ...(joined.finishedAt ? { finishedAt: joined.finishedAt } : {}) }
    const saved = saveOnlineParticipant(participant)
    if (!saved.ok) {
      setOnlineMessage(saved.error)
      setOnlineBusy(false)
      return
    }
    if (joined.state) createActiveGameStore().save(joined.state)
    const restored = await restoreOnlineState(participant)
    setOnlineMessage(restored.error ? `Ingresaste, pero falta sincronizar: ${restored.error.message}` : 'Partida online guardada y lista para jugar.')
    setOnlineBusy(false)
    onStateChange(restored.state)
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
  const firstFourScore = fixedGamesScore(state)
  const factoryScore = state.games['escape-room'].bestScore
  const completed = GAME_IDS.filter((gameId) => state.games[gameId].status === 'completed').length
  const finalized = Boolean(state.finalizedAt || getOnlineParticipant()?.finishedAt)
  return (
    <div className="rescue-hub">
      <div className="rescue-hub__header">
        <div><span className="eyebrow">{getOnlineParticipant() ? 'Partida online de' : 'Partida local de'}</span><h2>{state.playerId}</h2><p>{finalized ? 'Tu participación está finalizada.' : `Recorrido ${state.currentRunNumber}: completá las etapas en orden. Cada una admite un único resultado.`}</p></div>
        <div className="rescue-hub__total" aria-label={`Puntuación total ${score}`}><span>Primeros cuatro</span><strong>{firstFourScore}<small>/400</small></strong><span>Factory: {factoryScore} · Total: {score}</span><div><i style={{ width: `${progressPercentage(state)}%` }} /></div><small>{completed}/5 etapas completadas</small></div>
      </div>
      {onlineMessage && <p className="rescue-hub__privacy" role="status">{onlineMessage}</p>}
      <div className="rescue-hub__stages">{GAME_IDS.map((gameId) => {
        const game = state.games[gameId]
        const details = GAME_DETAILS[gameId]
        const unlocked = isGameUnlocked(state, gameId)
        const status = game.status === 'completed' ? 'Completada' : unlocked ? game.status === 'in-progress' ? 'Iniciada' : 'Disponible' : 'Bloqueada'
        return <article key={gameId} className={`rescue-hub__stage rescue-hub__stage--${game.status}`}><div className="rescue-hub__stage-number">{GAME_IDS.indexOf(gameId) + 1}</div><div className="rescue-hub__stage-content"><span>{status}</span><h3>{details.title}</h3><p>{details.concept}</p><small>{game.attempts ? `Resultado del recorrido: ${game.bestScore}${gameId === 'escape-room' ? ' puntos' : '/100'}` : unlocked ? 'Todavía no hay un resultado evaluado.' : 'Completá la etapa anterior para continuar.'}</small>{game.lastExplanation && <em>{game.lastExplanation}</em>}</div><button type="button" onClick={() => onNavigate(details.section)} disabled={finalized || !unlocked}>{game.status === 'completed' ? 'Ver resultado' : 'Comenzar'} <span aria-hidden="true">→</span></button></article>
      })}</div>
      {completed === 5 && <section className="rescue-hub__final" aria-labelledby="rescue-final-title"><span className="eyebrow">Recorrido completo</span><h3 id="rescue-final-title">Buen trabajo, {state.playerId}</h3><div>{GAME_IDS.map((gameId) => <span key={gameId}>{GAME_DETAILS[gameId].title}: <strong>{state.games[gameId].bestScore}{gameId === 'escape-room' ? '' : '/100'}</strong></span>)}</div><p><strong>Primeros cuatro:</strong> {firstFourScore}/400 · <strong>Factory:</strong> {factoryScore} · <strong>Total:</strong> {score}</p>{state.bestRun && <p><strong>Mejor recorrido histórico:</strong> {state.bestRun.totalScore} puntos.</p>}<button type="button" className="primary-action" onClick={() => onNavigate('filelab-factory')}>Ver cierre del recorrido <span aria-hidden="true">→</span></button>{finalized && <strong>Participación finalizada</strong>}</section>}
      {getOnlineParticipant() && <section className="rescue-ranking" aria-labelledby="rescue-ranking-title"><div><span className="eyebrow">Clasificación final</span><h3 id="rescue-ranking-title">Participantes finalizados</h3></div>{ranking.length ? <table><thead><tr><th>Posición</th><th>Apodo</th><th>Académicos</th><th>Factory</th><th>Total</th></tr></thead><tbody>{ranking.map((entry) => <tr key={`${entry.position}-${entry.nickname}`}><td>{entry.position}</td><td>{entry.nickname}</td><td>{entry.academicScore}/400</td><td>{entry.factoryScore}</td><td>{entry.totalScore}</td></tr>)}</tbody></table> : <p>Aún no hay participantes finalizados.</p>}</section>}
      <div className="rescue-hub__footer"><p><strong>Qué vas a integrar:</strong> distinguir la identidad de un archivo de sus bytes, observar metadatos y protección, usar descriptores y cursores, transferir datos correctamente y justificar cada decisión.</p><small>{getOnlineParticipant() ? 'El recorrido actual y el mejor recorrido completo se sincronizan con la partida.' : 'El recorrido actual y el mejor recorrido completo se guardan en este dispositivo.'}</small>{getOnlineParticipant() && <button type="button" className="filelab-secondary-button" onClick={leaveOnline}>Salir de partida online</button>}</div>
    </div>
  )
}
