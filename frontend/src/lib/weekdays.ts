import type { TranslationKey } from '@/src/i18n/translations'

// Monday-first, matching the backend's weekday numbering (0 = Monday) and the
// planning grid. The index *is* the weekday, so these are ordered, not a set.
export const WEEKDAY_KEYS: TranslationKey[] = [
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
  'weekday.sun',
]

// A span on one weekday. The nanny's schedule blocks and a child's presence
// windows are the same shape — one says when she works, the other when a child
// is there for it — so the day-copying below serves both.
export interface DayWindow {
  weekday: number
  start_time: string
  end_time: string
}

// Monday→Sunday. The editors read in day order however the rows were added, and
// a summary built from them says the week in the order a parent thinks it.
export function sortByDay<T extends DayWindow>(windows: T[]): T[] {
  return [...windows].sort((a, b) => a.weekday - b.weekday)
}

// Copy every block of `from` onto each `toDays`, replacing those days. Generic
// so a caller keeps whatever extra fields its own rows carry.
export function duplicateDayBlocks<T extends DayWindow>(
  blocks: T[],
  from: number,
  toDays: number[],
): T[] {
  const source = blocks.filter((b) => b.weekday === from)
  const kept = blocks.filter((b) => !toDays.includes(b.weekday))
  const added = toDays.flatMap((day) =>
    source.map((b) => ({ ...b, weekday: day })),
  )
  return [...kept, ...added]
}
