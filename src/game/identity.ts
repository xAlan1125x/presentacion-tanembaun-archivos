export interface NicknameValidation {
  valid: boolean
  value: string
  error?: string
}

const NICKNAME_PATTERN = /^[\p{L}\p{N} _-]+$/u

export function validateNickname(input: string): NicknameValidation {
  const value = input.trim().replace(/\s+/g, ' ')
  if (value.length < 2) return { valid: false, value, error: 'El apodo debe tener al menos 2 caracteres.' }
  if (value.length > 24) return { valid: false, value, error: 'El apodo no puede superar los 24 caracteres.' }
  if (!NICKNAME_PATTERN.test(value)) return { valid: false, value, error: 'Usá sólo letras, números, espacios, guiones o guiones bajos.' }
  return { valid: true, value }
}
