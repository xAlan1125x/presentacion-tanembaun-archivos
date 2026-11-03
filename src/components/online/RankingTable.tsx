import type { PublicRankingEntry, RankingEntry } from '../../supabase'

interface RankingTableProps {
  entries: Array<RankingEntry | PublicRankingEntry>
  showStatus?: boolean
}

export function RankingTable({ entries, showStatus = false }: RankingTableProps) {
  return <div className="ranking-table-scroll"><table className="ranking-table"><thead><tr><th>Posición</th><th>Apodo</th><th>Académico</th><th>Factory</th><th>Total</th>{showStatus && <th>Estado</th>}</tr></thead><tbody>{entries.map((entry) => <tr key={`${entry.position}-${entry.nickname}`}><td>{entry.position}</td><td>{entry.nickname}</td><td>{entry.academicScore}/400</td><td>{entry.factoryScore}</td><td><strong>{entry.totalScore}</strong></td>{showStatus && <td><span className={`ranking-status ${'finalized' in entry && entry.finalized ? 'is-final' : 'is-provisional'}`}>{'finalized' in entry && entry.finalized ? 'Definitivo' : 'Provisional'}</span></td>}</tr>)}</tbody></table></div>
}
