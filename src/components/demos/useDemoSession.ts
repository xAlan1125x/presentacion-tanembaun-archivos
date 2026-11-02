import { useRef, useState } from 'react'
import { FileLabSession } from '../../lab'

export function useDemoSession(scenarioId: string) {
  const sessionRef = useRef<FileLabSession | null>(null)
  if (!sessionRef.current) sessionRef.current = new FileLabSession(scenarioId)
  const [revision, setRevision] = useState(0)
  const session = sessionRef.current
  const refresh = () => setRevision((value) => value + 1)
  const reset = () => { session.restoreScenario(); refresh() }
  return { session, snapshot: session.snapshot(), refresh, reset, revision }
}
