import { describe, expect, it } from 'vitest'
import { formatHours, formatMoney } from '@/src/lib/utils'

describe('formatMoney', () => {
  it('formats a decimal string as euros in the reader’s locale', () => {
    expect(formatMoney('1234.56', 'en')).toBe('€1,234.56')
    // French puts the symbol last and groups with a non-breaking space.
    expect(formatMoney('1234.56', 'fr')).toMatch(/1\s?234,56\s?€/)
  })

  it('keeps the cents a parent is about to file', () => {
    expect(formatMoney('12.00', 'en')).toBe('€12.00')
    expect(formatMoney('0.15', 'en')).toBe('€0.15')
  })

  // Rounding a figure into existence would be worse than showing it raw: these
  // numbers get typed into pajemploi.
  it('shows an unparseable amount verbatim rather than NaN', () => {
    expect(formatMoney('', 'en')).toBe('€0.00')
    expect(formatMoney('not-a-number', 'en')).toBe('not-a-number')
  })
})

describe('formatHours', () => {
  it('keeps two decimals, because a quarter hour is 0.25', () => {
    expect(formatHours('120.00', 'en')).toBe('120.00')
    expect(formatHours('4.25', 'en')).toBe('4.25')
    expect(formatHours('0', 'en')).toBe('0.00')
  })

  it('formats in the reader’s locale', () => {
    expect(formatHours('1234.5', 'en')).toBe('1,234.50')
    expect(formatHours('4.25', 'fr')).toBe('4,25')
  })

  it('shows unparseable hours verbatim rather than NaN', () => {
    expect(formatHours('not-a-number', 'en')).toBe('not-a-number')
  })
})
