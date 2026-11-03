import type { GameId } from '../game'

export type SessionStatus = 'active' | 'closed'

export interface OnlineSession {
  id: string
  ownerId: string
  name: string
  joinCode: string
  status: SessionStatus
  rulesVersion: number
  createdAt: string
  closedAt?: string
}

export interface RankingEntry {
  position: number
  nickname: string
  academicScore: number
  factoryScore: number
  totalScore: number
}

export interface PublicRankingEntry extends RankingEntry {
  finalized: boolean
}

export interface SessionParticipantSummary {
  participantId: string
  nickname: string
  finishedAt?: string
  academicScore: number
  factoryScore: number
  totalScore: number
}

export interface ParticipantProgressRow {
  participantId: string
  gameId: GameId
  status: 'not-started' | 'in-progress' | 'completed'
  bestScore: number
  attempts: number
  lastExplanation?: string
  completedAt?: string
  updatedAt: string
}

export interface OnlineJoinResult {
  session: OnlineSession
  participantId: string
  rulesVersion: number
}
