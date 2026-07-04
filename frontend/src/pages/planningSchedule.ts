import type { Contract, ContractSchedule } from '../api/contracts'

// One nanny working a single time block on a given day.
export interface WorkedEntry {
  contractId: string
  nannyId: string
  nannyName: string
  start: string // "HH:mm"
  end: string // "HH:mm"
}

// Deterministic 32-bit string hash. A nanny's color is anchored to their id, so
// the same id prefers the same palette slot no matter which other nannies are
// present or when the planning is reopened.
function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

// Assign every nanny in the shown set a palette slot in [0, paletteSize). Each
// nanny prefers its hash slot, but when two collide the later one (in sorted-id
// order) probes to the next free slot — so as long as the nannies fit the
// palette, everyone gets a distinct slot. Sorting the ids keeps the result
// deterministic regardless of contract order. Returns indices, not classes, so
// the palette itself stays a view concern.
export function nannyColorMap(
  nannyIds: string[],
  paletteSize: number,
): Record<string, number> {
  const uniqueIds = [...new Set(nannyIds)].sort()
  const used = new Set<number>()
  const slots: Record<string, number> = {}
  for (const id of uniqueIds) {
    let index = hashString(id) % paletteSize
    // Probe to the next free slot on collision; give up (allow reuse) only once
    // every slot is taken, i.e. more nannies than palette entries.
    for (let probes = 0; used.has(index) && probes < paletteSize; probes++) {
      index = (index + 1) % paletteSize
    }
    used.add(index)
    slots[id] = index
  }
  return slots
}

// "08:00:00" -> "08:00". API serializes times with seconds.
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

// Backend ScheduleBlock.weekday is Monday=0 … Sunday=6 (Python date.weekday()).
// JS Date.getDay() is Sunday=0 … Saturday=6, so shift by one week.
export function pyWeekday(date: Date): number {
  return (date.getDay() + 6) % 7
}

// Local calendar date as "yyyy-MM-dd" so it compares against API date strings.
// Built from local getters (not toISOString, which is UTC) to avoid off-by-one
// around midnight in non-UTC timezones.
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function contractActiveOn(contract: Contract, iso: string): boolean {
  return (
    contract.starting_date <= iso &&
    (contract.ending_date == null || iso <= contract.ending_date)
  )
}

// The versioned schedule in force on `iso`: the one with the latest
// effective_from that is still on or before the day. Because snapshots are
// contiguous, this is automatically the version whose effective range covers
// the day — no need to consult effective_to.
export function scheduleInForce(
  schedules: ContractSchedule[],
  iso: string,
): ContractSchedule | undefined {
  let best: ContractSchedule | undefined
  for (const schedule of schedules) {
    if (
      schedule.effective_from <= iso &&
      (!best || schedule.effective_from > best.effective_from)
    ) {
      best = schedule
    }
  }
  return best
}

// Every nanny time block worked on `date`: for each contract active that day,
// the schedule version in force places blocks on matching weekdays.
export function workedEntriesForDay(
  date: Date,
  contracts: Contract[],
  schedulesByContract: Record<string, ContractSchedule[]>,
): WorkedEntry[] {
  const iso = toISODate(date)
  const weekday = pyWeekday(date)
  const entries: WorkedEntry[] = []
  for (const contract of contracts) {
    if (!contractActiveOn(contract, iso)) continue
    const schedule = scheduleInForce(
      schedulesByContract[contract.id] ?? [],
      iso,
    )
    if (!schedule) continue
    for (const block of schedule.blocks) {
      if (block.weekday !== weekday) continue
      entries.push({
        contractId: contract.id,
        nannyId: contract.nanny.id,
        nannyName:
          `${contract.nanny.first_name} ${contract.nanny.last_name}`.trim(),
        start: hhmm(block.start_time),
        end: hhmm(block.end_time),
      })
    }
  }
  return entries
}
