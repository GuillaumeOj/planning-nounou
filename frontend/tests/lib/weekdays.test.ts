import { describe, expect, it } from 'vitest'
import { duplicateDayBlocks, sortByDay, WEEKDAY_KEYS } from '@/src/lib/weekdays'

describe('duplicateDayBlocks', () => {
  it('copies a day onto target days, replacing them', () => {
    const blocks = [
      { weekday: 0, start_time: '09:00', end_time: '12:00' },
      { weekday: 2, start_time: '08:00', end_time: '10:00' },
    ]
    const result = duplicateDayBlocks(blocks, 0, [1, 2])
    expect(result).toContainEqual({
      weekday: 1,
      start_time: '09:00',
      end_time: '12:00',
    })
    expect(result).toContainEqual({
      weekday: 2,
      start_time: '09:00',
      end_time: '12:00',
    })
    // The original Wednesday block was replaced.
    expect(result.filter((b) => b.weekday === 2)).toHaveLength(1)
  })

  // A day can carry more than one block — a morning and an afternoon — and the
  // copy has to take the whole day, not the first one it finds.
  it('copies every block of the source day', () => {
    const blocks = [
      { weekday: 0, start_time: '09:00', end_time: '12:00' },
      { weekday: 0, start_time: '14:00', end_time: '18:00' },
    ]
    expect(
      duplicateDayBlocks(blocks, 0, [4]).filter((b) => b.weekday === 4),
    ).toHaveLength(2)
  })

  it('copying nowhere leaves the blocks alone', () => {
    const blocks = [{ weekday: 0, start_time: '09:00', end_time: '12:00' }]
    expect(duplicateDayBlocks(blocks, 0, [])).toEqual(blocks)
  })

  // The source day is only ever read, so copying it onto itself is a no-op
  // rather than a way to lose it.
  it('copying a day onto itself keeps it', () => {
    const blocks = [{ weekday: 3, start_time: '09:00', end_time: '12:00' }]
    expect(duplicateDayBlocks(blocks, 3, [3])).toEqual(blocks)
  })

  it('keeps whatever extra fields a caller’s rows carry', () => {
    const blocks = [
      { weekday: 0, start_time: '09:00', end_time: '12:00', id: 'x' },
    ]
    expect(duplicateDayBlocks(blocks, 0, [1])).toContainEqual({
      weekday: 1,
      start_time: '09:00',
      end_time: '12:00',
      id: 'x',
    })
  })
})

describe('sortByDay', () => {
  it('reads Monday→Sunday whatever order it was given', () => {
    const windows = [
      { weekday: 4, start_time: '09:00', end_time: '17:00' },
      { weekday: 0, start_time: '09:00', end_time: '17:00' },
      { weekday: 2, start_time: '09:00', end_time: '17:00' },
    ]
    expect(sortByDay(windows).map((w) => w.weekday)).toEqual([0, 2, 4])
  })

  it('does not mutate its argument', () => {
    const windows = [
      { weekday: 4, start_time: '09:00', end_time: '17:00' },
      { weekday: 0, start_time: '09:00', end_time: '17:00' },
    ]
    sortByDay(windows)
    expect(windows.map((w) => w.weekday)).toEqual([4, 0])
  })
})

describe('WEEKDAY_KEYS', () => {
  // The index IS the weekday — the backend numbers Monday 0 (date.weekday()) and
  // every caller looks a day up positionally.
  it('is Monday-first and seven long', () => {
    expect(WEEKDAY_KEYS).toHaveLength(7)
    expect(WEEKDAY_KEYS[0]).toBe('weekday.mon')
    expect(WEEKDAY_KEYS[6]).toBe('weekday.sun')
  })
})
