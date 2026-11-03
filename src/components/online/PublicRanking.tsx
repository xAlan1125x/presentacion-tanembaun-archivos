import { useState } from 'react'
import { isSupabaseConfigured, loadPublicSessionRanking, type PublicRankingEntry } from '../../supabase'
import { RankingTable } from './RankingTable'

const initialCode = () => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('partida')?.toUpperCase() ?? ''

export function PublicRanking() {
  const [joinCode, setJoinCode] = useState(initialCode)
  const [ranking, setRanking] = useState<PublicRankingEntry[]>([])
  const [queriedCode, setQueriedCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async (event: React.FormEvent) => {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!/^[A-F0-9]{8}$/.test(code)) {
      setRanking([])
      setQueriedCode('')
      setMessage('Ingresá un código válido de 8 caracteres.')
      return
    }
    setBusy(true)
    setMessage('Consultando clasificación…')
    const result = await loadPublicSessionRanking(code)
    setBusy(false)
    if (result.error) {
      setRanking([])
      setQueriedCode(code)
      setMessage(`No se pudo consultar la clasificación: ${result.error.message}`)
      return
    }
    setRanking(result.ranking)
    setQueriedCode(code)
    setMessage(result.ranking.length ? `Clasificación de la partida ${code} actualizada.` : `La partida ${code} todavía no tiene recorridos completos.`)
  }

  if (!isSupabaseConfigured) return <div className="public-ranking public-ranking--disabled"><strong>Clasificación online no disponible</strong><p>El modo local sigue funcionando, pero esta instalación no tiene Supabase configurado.</p></div>

  return <div className="public-ranking">
    <div className="public-ranking__intro"><div><h3>Consultá una partida</h3><p>No necesitás unirte ni iniciar sesión. Los resultados provisionales pueden mejorar hasta que cada participante finalice.</p></div><form onSubmit={refresh}><label htmlFor="public-ranking-code">Código de partida</label><div><input id="public-ranking-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} placeholder="Ej.: A1B2C3D4" autoComplete="off" disabled={busy}/><button type="submit" disabled={busy}>{busy ? 'Actualizando…' : 'Actualizar clasificación'}</button></div></form></div>
    {message && <p className="public-ranking__message" role="status">{message}</p>}
    {queriedCode && ranking.length > 0 && <RankingTable entries={ranking} showStatus />}
  </div>
}
