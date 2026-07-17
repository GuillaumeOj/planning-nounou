import { describe, expect, it } from 'vitest'
import type {
  Contract,
  ContractSchedule,
  ScheduleBlock,
} from '@/src/api/contracts'
import {
  nannyColorMap,
  pyWeekday,
  scheduleInForce,
  toISODate,
  workedEntriesForDay,
} from '@/src/pages/planningSchedule'

// In July 2026: the 6th is a Monday, the 8th a Wednesday, the 5th a Sunday.
const MONDAY = new Date(2026, 6, 6)
const WEDNESDAY = new Date(2026, 6, 8)
const SUNDAY = new Date(2026, 6, 5)

function block(
  weekday: number,
  start = '08:00:00',
  end = '17:00:00',
): ScheduleBlock {
  return { weekday, start_time: start, end_time: end }
}

function schedule(
  effectiveFrom: string,
  blocks: ScheduleBlock[],
  effectiveTo: string | null = null,
): ContractSchedule {
  return {
    id: `sched-${effectiveFrom}`,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    weekly_hours: 0,
    edited: false,
    blocks,
  }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c1',
    nanny: { id: 'n1', first_name: 'Marie', last_name: 'Curie' },
    starting_date: '2026-06-01',
    ending_date: null,
    split_method: 'equal',
    paid_leave_days: 0,
    notes: '',
    families: [],
    current_terms: null,
    current_schedule: null,
    ...overrides,
  }
}

describe('pyWeekday', () => {
  it('maps JS Sunday-first days to Python Monday=0..Sunday=6', () => {
    expect(pyWeekday(MONDAY)).toBe(0)
    expect(pyWeekday(WEDNESDAY)).toBe(2)
    expect(pyWeekday(SUNDAY)).toBe(6)
  })
})

describe('toISODate', () => {
  it('formats a local date without UTC drift', () => {
    expect(toISODate(WEDNESDAY)).toBe('2026-07-08')
  })
})

describe('scheduleInForce', () => {
  it('picks the version with the latest effective_from on or before the day', () => {
    const v1 = schedule('2026-06-01', [block(2)])
    const v2 = schedule('2026-07-07', [block(2)])
    expect(scheduleInForce([v1, v2], '2026-07-08')).toBe(v2)
    expect(scheduleInForce([v1, v2], '2026-06-15')).toBe(v1)
  })

  it('returns undefined when no version has started yet', () => {
    expect(scheduleInForce([schedule('2026-07-07', [])], '2026-07-01')).toBe(
      undefined,
    )
  })
})

describe('workedEntriesForDay', () => {
  const schedules = { c1: [schedule('2026-06-01', [block(2)])] }

  it('emits an entry when the contract is active and a block matches the weekday', () => {
    const entries = workedEntriesForDay(WEDNESDAY, [contract()], schedules)
    expect(entries).toEqual([
      {
        contractId: 'c1',
        nannyId: 'n1',
        nannyName: 'Marie Curie',
        start: '08:00',
        end: '17:00',
        // No children passed in, so none are named.
        childNames: [],
      },
    ])
  })

  it('names the children present that weekday', () => {
    const children = {
      c1: [
        // No windows: present whenever the nanny works.
        {
          id: 'cc1',
          child: 'k1',
          first_name: 'Léa',
          family_id: 'f1',
          windows: [],
        },
        // Windowed on Wednesday only: present today.
        {
          id: 'cc2',
          child: 'k2',
          first_name: 'Tom',
          family_id: 'f1',
          windows: [{ weekday: 2, start_time: '08:00', end_time: '12:00' }],
        },
        // Windowed on Monday only: absent on a Wednesday.
        {
          id: 'cc3',
          child: 'k3',
          first_name: 'Zoé',
          family_id: 'f1',
          windows: [{ weekday: 0, start_time: '08:00', end_time: '12:00' }],
        },
      ],
    }
    const [entry] = workedEntriesForDay(
      WEDNESDAY,
      [contract()],
      schedules,
      new Set(),
      children,
    )
    expect(entry.childNames).toEqual(['Léa', 'Tom'])
  })

  it('emits nothing on a weekday with no matching block', () => {
    expect(workedEntriesForDay(MONDAY, [contract()], schedules)).toEqual([])
  })

  it('respects the contract window: no entry before starting_date', () => {
    const late = contract({ starting_date: '2026-07-09' })
    expect(workedEntriesForDay(WEDNESDAY, [late], schedules)).toEqual([])
  })

  it('respects the contract window: no entry after ending_date', () => {
    const ended = contract({ ending_date: '2026-07-01' })
    expect(workedEntriesForDay(WEDNESDAY, [ended], schedules)).toEqual([])
  })

  it('uses the schedule version in force on the given day', () => {
    const versioned = {
      c1: [
        schedule('2026-06-01', [block(2, '08:00:00', '12:00:00')]),
        schedule('2026-07-07', [block(2, '09:00:00', '18:00:00')]),
      ],
    }
    const [entry] = workedEntriesForDay(WEDNESDAY, [contract()], versioned)
    expect(entry).toMatchObject({ start: '09:00', end: '18:00' })

    const earlierWed = new Date(2026, 5, 3) // Wed 2026-06-03, v1 in force
    const [earlier] = workedEntriesForDay(earlierWed, [contract()], versioned)
    expect(earlier).toMatchObject({ start: '08:00', end: '12:00' })
  })

  it('removes the working day on a non-workable holiday', () => {
    const holidays = new Set(['2026-07-08']) // the Wednesday
    expect(
      workedEntriesForDay(WEDNESDAY, [contract()], schedules, holidays),
    ).toEqual([])
  })

  it('keeps the working day on a workable holiday (not in the set)', () => {
    const holidays = new Set(['2026-07-14']) // some other holiday
    expect(
      workedEntriesForDay(WEDNESDAY, [contract()], schedules, holidays),
    ).toHaveLength(1)
  })

  it('lists an entry per nanny working the same day', () => {
    const c2 = contract({
      id: 'c2',
      nanny: { id: 'n2', first_name: 'Ada', last_name: 'Lovelace' },
    })
    const twoSchedules = {
      c1: [schedule('2026-06-01', [block(2)])],
      c2: [schedule('2026-06-01', [block(2, '13:00:00', '18:00:00')])],
    }
    const entries = workedEntriesForDay(
      WEDNESDAY,
      [contract(), c2],
      twoSchedules,
    )
    expect(entries.map((e) => e.nannyName)).toEqual([
      'Marie Curie',
      'Ada Lovelace',
    ])
  })
})

describe('nannyColorMap', () => {
  const PALETTE_SIZE = 10

  it('is deterministic and independent of id order', () => {
    expect(nannyColorMap(['n1', 'n2', 'n3'], PALETTE_SIZE)).toEqual(
      nannyColorMap(['n3', 'n1', 'n2'], PALETTE_SIZE),
    )
  })

  it('gives every nanny a distinct slot when the set fits the palette', () => {
    // Guards the reported bug: collisions must be resolved, not duplicated.
    for (let size = 1; size <= PALETTE_SIZE; size++) {
      const ids = Array.from({ length: size }, (_, i) => `nanny-${i}`)
      const slots = Object.values(nannyColorMap(ids, PALETTE_SIZE))
      expect(new Set(slots).size).toBe(size)
    }
  })

  it('only ever assigns slots within the palette range', () => {
    const slots = Object.values(nannyColorMap(['a', 'b', 'c'], PALETTE_SIZE))
    for (const slot of slots) {
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(PALETTE_SIZE)
    }
  })

  it('maps every nanny even when there are more nannies than slots', () => {
    const ids = Array.from({ length: PALETTE_SIZE + 3 }, (_, i) => `x${i}`)
    expect(Object.keys(nannyColorMap(ids, PALETTE_SIZE))).toHaveLength(
      ids.length,
    )
  })
})
