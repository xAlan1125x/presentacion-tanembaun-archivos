import { describe, expect, it } from 'vitest'
import { validateNickname } from '..'

describe('validateNickname', () => {
  it('accepts a normalized local nickname', () => {
    expect(validateNickname('  Ada   42 ')).toEqual({ valid: true, value: 'Ada 42' })
    expect(validateNickname('Árbol-7').valid).toBe(true)
  })

  it('rejects empty, long and problematic nicknames', () => {
    expect(validateNickname(' ').valid).toBe(false)
    expect(validateNickname('a').error).toContain('al menos')
    expect(validateNickname('a'.repeat(25)).error).toContain('24')
    expect(validateNickname('Ada<script>').error).toContain('letras')
  })
})
