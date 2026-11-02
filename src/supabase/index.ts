export { isSupabaseConfigured, supabase } from './client'
export { closeTeacherSession, createTeacherSession, finalizeParticipant, getCurrentUser, joinSession, listTeacherSessions, loadParticipantProgress, loadSessionParticipantSummary, loadSessionRanking, signInAnonymousParticipant, signInTeacher, signOutTeacher } from './service'
export type * from './types'
export * from './participant'
