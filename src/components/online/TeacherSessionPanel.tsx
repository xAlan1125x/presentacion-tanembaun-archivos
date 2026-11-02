import { useEffect, useState } from 'react'
import {
  closeTeacherSession,
  createTeacherSession,
  getCurrentUser,
  isSupabaseConfigured,
  listTeacherSessions,
  loadSessionParticipantSummary,
  loadSessionRanking,
  signInTeacher,
  signOutTeacher,
  type OnlineSession,
} from '../../supabase'
import type { RankingEntry, SessionParticipantSummary } from '../../supabase'

export function TeacherSessionPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sessionName, setSessionName] = useState('Operación Rescate')
  const [sessions, setSessions] = useState<OnlineSession[]>([])
  const [signedIn, setSignedIn] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [participants, setParticipants] = useState<SessionParticipantSummary[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void getCurrentUser().then((result) => {
      if (result.user && !result.user.is_anonymous) {
        setSignedIn(true)
        void refreshSessions()
      }
    })
  }, [])

  const refreshSessions = async () => {
    const result = await listTeacherSessions()
    if (!result.error) setSessions(result.sessions)
    else setMessage(result.error.message)
  }

  const refreshResults = async (session: OnlineSession) => {
    const [summary, results] = await Promise.all([loadSessionParticipantSummary(session.id), loadSessionRanking(session.id)])
    if (summary.error || results.error) {
      setMessage(summary.error?.message ?? results.error?.message ?? 'No se pudieron cargar los resultados.')
      return
    }
    setSelectedSession(session.id)
    setParticipants(summary.participants)
    setRanking(results.ranking)
  }

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await signInTeacher(email, password)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setSignedIn(true)
    setMessage('Sesión de expositor iniciada.')
    await refreshSessions()
  }

  const create = async () => {
    const result = await createTeacherSession(sessionName)
    if (result.error || !result.session) {
      setMessage(result.error?.message ?? 'No se pudo crear la partida.')
      return
    }
    setSessions((current) => [result.session!, ...current])
    setMessage(`Partida creada. Código: ${result.session.joinCode}`)
  }

  const close = async (session: OnlineSession) => {
    const result = await closeTeacherSession(session.id)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setSessions((current) => current.map((item) => item.id === session.id ? { ...item, status: 'closed', closedAt: new Date().toISOString() } : item))
    setMessage(`Partida ${session.joinCode} cerrada.`)
  }

  const signOut = async () => {
    const result = await signOutTeacher()
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setSignedIn(false)
    setSessions([])
    setMessage('Sesión de expositor cerrada.')
  }

  if (!isSupabaseConfigured) {
    return <aside className="online-session-panel online-session-panel--disabled"><span className="eyebrow">Modo online opcional</span><strong>Supabase no está configurado</strong><p>El modo local funciona normalmente. Para habilitar partidas, definí <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> y aplicá la migración documentada.</p></aside>
  }

  if (!signedIn) {
    return <aside className="online-session-panel"><header><span className="eyebrow">Expositor</span><strong>Administrar partidas online</strong></header><form onSubmit={signIn}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo del expositor" autoComplete="email" required /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña" autoComplete="current-password" required /><button type="submit">Iniciar sesión</button></form>{message && <p role="status">{message}</p>}</aside>
  }

  return <aside className="online-session-panel"><header><span className="eyebrow">Expositor conectado</span><button type="button" className="filelab-secondary-button" onClick={signOut}>Cerrar sesión</button></header><div className="online-session-create"><input value={sessionName} onChange={(event) => setSessionName(event.target.value)} maxLength={80} aria-label="Nombre de la partida" /><button type="button" onClick={create}>Crear partida</button></div>{message && <p role="status">{message}</p>}<div className="online-session-list">{sessions.map((session) => <article key={session.id}><div><strong>{session.name}</strong><small>Código: <code>{session.joinCode}</code> · {session.status === 'active' ? 'activa' : 'cerrada'}</small>{typeof window !== 'undefined' && session.status === 'active' && <small>{`${window.location.origin}${window.location.pathname}?partida=${session.joinCode}`}</small>}</div><div>{session.status === 'active' && <button type="button" onClick={() => close(session)}>Cerrar partida</button>}<button type="button" onClick={() => refreshResults(session)}>Actualizar clasificación</button></div></article>)}</div>{selectedSession && <section className="online-session-results"><p>{participants.length} participantes registrados · {participants.filter((participant) => participant.finishedAt).length} finalizados</p>{ranking.length ? <table><thead><tr><th>Posición</th><th>Apodo</th><th>Puntaje</th></tr></thead><tbody>{ranking.map((entry) => <tr key={`${entry.position}-${entry.nickname}`}><td>{entry.position}</td><td>{entry.nickname}</td><td>{entry.totalScore}/1.000</td></tr>)}</tbody></table> : <p>Aún no hay participantes finalizados.</p>}</section>}</aside>
}
