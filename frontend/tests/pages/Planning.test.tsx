import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BankHolidayRead,
  ContractRead,
  ContractScheduleRead,
  ExceptionalHoursRead,
  ExceptionalPresenceRead,
  FamilyRead,
  PlanningContractRead,
} from '@/src/api'
import { MOBILE_QUERY } from '@/src/hooks/useMediaQuery'
import Planning from '@/src/pages/Planning'
import { server } from '@/tests/msw/server'
import { renderWithProviders, selectOption } from '@/tests/utils'

const family: FamilyRead = {
  id: '1',
  name: 'Home',
  role: 'owner',
  is_claimed: true,
  created_at: '',
}

function makeSchedule(
  o: Partial<ContractScheduleRead> = {},
): ContractScheduleRead {
  return {
    id: '1',
    effective_from: '2026-06-01',
    effective_to: null,
    weekly_hours: 9,
    edited: false,
    created_by_name: null,
    blocks: [
      { id: 'b1', weekday: 2, start_time: '08:00:00', end_time: '17:00:00' },
    ],
    ...o,
  } as ContractScheduleRead
}
function makeContract(o: Partial<ContractRead> = {}): ContractRead {
  return {
    id: '10',
    nanny: { id: '5', first_name: 'Marie', last_name: 'Dupont' },
    starting_date: '2026-06-01',
    ending_date: null,
    split_method: 'equal',
    paid_leave_days: 25,
    notes: '',
    families: [{ id: '1', name: 'Home', is_originator: true }],
    current_terms: null,
    current_schedule: null,
    ...o,
  }
}

// One planning contract carries its own schedule history, leaves, exceptional
// hours/presences and children — the calendar reads all of it from the single
// planning payload rather than fanning out per-contract queries.
function makePlanningContract(
  o: Partial<PlanningContractRead> = {},
): PlanningContractRead {
  return {
    ...makeContract(),
    schedule_history: [makeSchedule()],
    leaves: [],
    exceptional_hours: [],
    exceptional_presences: [],
    children: [],
    ...o,
  }
}

const FAMILIES = '*/api/families/'
const PLANNING = '*/api/families/:familyPk/planning/'
// The record-tab sections fetch their own lists once a tab mounts.
const LEAVES = '*/api/families/:familyPk/contracts/:contractPk/leaves/'
const HOURS =
  '*/api/families/:familyPk/contracts/:contractPk/exceptional-hours/'
const PRESENCES =
  '*/api/families/:familyPk/contracts/:contractPk/exceptional-presences/'
const CCHILDREN = '*/api/families/:familyPk/contracts/:contractPk/children/'

interface Ref {
  familyPk: string
  contractPk: string
}
interface Calls {
  planningFamilies: string[]
  planningMonths: (string | null)[]
  leavesFor: Ref[]
  hoursFor: Ref[]
  presencesFor: Ref[]
}

function setup(
  opts: {
    families?: FamilyRead[]
    contracts?: PlanningContractRead[]
    holidays?: BankHolidayRead[]
  } = {},
): Calls {
  const { families = [family], contracts = [], holidays = [] } = opts
  const calls: Calls = {
    planningFamilies: [],
    planningMonths: [],
    leavesFor: [],
    hoursFor: [],
    presencesFor: [],
  }
  server.use(
    http.get(FAMILIES, () => HttpResponse.json(families)),
    http.get(PLANNING, ({ params, request }) => {
      calls.planningFamilies.push(params.familyPk as string)
      calls.planningMonths.push(new URL(request.url).searchParams.get('month'))
      return HttpResponse.json({ contracts, holidays })
    }),
    http.get(LEAVES, ({ params }) => {
      calls.leavesFor.push({
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
      })
      return HttpResponse.json([])
    }),
    http.get(HOURS, ({ params }) => {
      calls.hoursFor.push({
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
      })
      return HttpResponse.json([])
    }),
    http.get(PRESENCES, ({ params }) => {
      calls.presencesFor.push({
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
      })
      return HttpResponse.json([])
    }),
    http.get(CCHILDREN, () => HttpResponse.json([])),
  )
  return calls
}

// A user-event bound to the fake clock so its internal delays still resolve.
const setupUser = () =>
  userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

const realMatchMedia = window.matchMedia

// Report a phone-sized viewport to useMediaQuery. Everything else — notably the
// theme's prefers-color-scheme probe — keeps answering "no".
function useMobileViewport() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === MOBILE_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

beforeEach(() => {
  // Pin "today" to a Wednesday in July 2026 so the calendar is deterministic.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0))
  setup()
})
afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
})

describe('Planning page', () => {
  it('prompts to create a family when there are none', async () => {
    setup({ families: [] })
    renderWithProviders(<Planning />)
    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
  })

  it('shows the current month and an empty message when no day is worked', async () => {
    setup()
    renderWithProviders(<Planning />)
    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    expect(
      await screen.findByText('No worked days this month.'),
    ).toBeInTheDocument()
  })

  it('marks worked days with the nanny name and hours', async () => {
    setup({ contracts: [makePlanningContract()] })
    renderWithProviders(<Planning />)
    // July 2026 has five Wednesdays; the scheduled block lands on each.
    expect((await screen.findAllByText('Marie Dupont')).length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText(/08:00.*17:00/).length).toBeGreaterThan(0)
  })

  it('shows the holiday name on the planning', async () => {
    setup({
      holidays: [
        {
          id: 'h1',
          name: 'Fête Nationale',
          date: '2026-07-14',
          is_workable: false,
        },
      ],
    })
    renderWithProviders(<Planning />)
    expect(await screen.findByText('Fête Nationale')).toBeInTheDocument()
  })

  it('removes the worked block on a non-workable holiday', async () => {
    // 2026-07-08 is one of July's five worked Wednesdays.
    setup({
      contracts: [makePlanningContract()],
      holidays: [
        {
          id: 'h1',
          name: 'Jour férié',
          date: '2026-07-08',
          is_workable: false,
        },
      ],
    })
    renderWithProviders(<Planning />)
    await screen.findByText('Jour férié')
    // Five Wednesdays minus the neutralized one leaves four worked days.
    await waitFor(() =>
      expect(screen.getAllByText('Marie Dupont')).toHaveLength(4),
    )
  })

  it('keeps the worked block on a workable holiday', async () => {
    setup({
      contracts: [makePlanningContract()],
      holidays: [
        { id: 'h1', name: 'Solidarité', date: '2026-07-08', is_workable: true },
      ],
    })
    renderWithProviders(<Planning />)
    await screen.findByText('Solidarité')
    await waitFor(() =>
      expect(screen.getAllByText('Marie Dupont')).toHaveLength(5),
    )
  })

  it('navigates months and returns to today', async () => {
    const user = setupUser()
    setup()
    renderWithProviders(<Planning />)
    expect(await screen.findByText('July 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('August 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('June 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByText('July 2026')).toBeInTheDocument()
  })

  it('refetches the planning when the acting family changes', async () => {
    const family2 = { ...family, id: '2', name: 'Grandparents' }
    const calls = setup({ families: [family, family2] })
    const user = setupUser()
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')

    await selectOption('Acting as family', 'Grandparents', user)
    await waitFor(() => expect(calls.planningFamilies).toContain('2'))
  })

  it('shows a loading state while the planning loads', async () => {
    setup()
    server.use(http.get(PLANNING, () => new Promise(() => {})))
    renderWithProviders(<Planning />)
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    setup()
    server.use(
      http.get(PLANNING, () => new HttpResponse(null, { status: 500 })),
    )
    renderWithProviders(<Planning />)
    expect(
      await screen.findByText('Could not load the planning.'),
    ).toBeInTheDocument()
  })
})

describe('Planning tabs', () => {
  const openTab = async (name: string) => {
    const user = setupUser()
    setup({ contracts: [makePlanningContract()] })
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')
    await user.click(screen.getByRole('tab', { name }))
    return user
  }

  it('starts on the calendar', async () => {
    setup({ contracts: [makePlanningContract()] })
    renderWithProviders(<Planning />)
    // The calendar reads the records from the single planning payload, so it is
    // selected by default without fanning out any per-record query.
    expect(
      await screen.findByRole('tab', { name: 'Calendar' }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the days off of each nanny, and drops the calendar', async () => {
    await openTab('Days off')
    expect(
      await screen.findByText('No days off this month.'),
    ).toBeInTheDocument()
    // The name is the card's title now — the five worked cells are unmounted.
    expect(screen.getAllByText('Marie Dupont')).toHaveLength(1)
    expect(screen.queryByText('July 2026')).toBeInTheDocument()
  })

  it('shows the exceptional hours of each nanny', async () => {
    await openTab('Exceptional hours')
    expect(
      await screen.findByText('No exceptional hours this month.'),
    ).toBeInTheDocument()
  })

  it('shows the exceptional presence of each nanny', async () => {
    await openTab('Exceptional presence')
    expect(
      await screen.findByText('No exceptional presence this month.'),
    ).toBeInTheDocument()
  })

  it('keeps a single family selector, above the tabs', async () => {
    await openTab('Days off')
    await screen.findByText('No days off this month.')
    // Two would mean two elements sharing id="acting-family".
    expect(screen.getAllByLabelText('Acting as family')).toHaveLength(1)
  })

  it('scopes a record tab to the family selected above it', async () => {
    const family2 = { ...family, id: '2', name: 'Grandparents' }
    const calls = setup({
      families: [family, family2],
      contracts: [makePlanningContract()],
    })
    const user = setupUser()
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')
    await user.click(screen.getByRole('tab', { name: 'Exceptional hours' }))
    await screen.findByText('No exceptional hours this month.')

    await selectOption('Acting as family', 'Grandparents', user)
    await waitFor(() => expect(calls.planningFamilies).toContain('2'))
  })

  it('says a record tab is empty when the family has no nanny', async () => {
    const user = setupUser()
    setup()
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')
    await user.click(screen.getByRole('tab', { name: 'Days off' }))
    expect(
      await screen.findByText('No nannies yet. Add your first one below.'),
    ).toBeInTheDocument()
  })

  it('shows a loading state on a record tab while the planning loads', async () => {
    setup()
    server.use(http.get(PLANNING, () => new Promise(() => {})))
    const user = setupUser()
    renderWithProviders(<Planning />)
    // The tabs only exist once the families are in: until then the page is the
    // "create a family first" prompt.
    await user.click(await screen.findByRole('tab', { name: 'Days off' }))
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })

  it('surfaces a load error on a record tab', async () => {
    setup()
    server.use(
      http.get(PLANNING, () => new HttpResponse(null, { status: 500 })),
    )
    const user = setupUser()
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')
    await user.click(screen.getByRole('tab', { name: 'Days off' }))
    expect(
      await screen.findByText('Could not load the planning.'),
    ).toBeInTheDocument()
  })
})

describe('Planning page on a phone', () => {
  beforeEach(() => {
    useMobileViewport()
  })

  it('describes the selected day instead of filling the cells', async () => {
    setup({ contracts: [makePlanningContract()] })
    renderWithProviders(<Planning />)

    // Today (Wed 15 July) is worked and selected by default. The name appears
    // once — in the day panel — rather than in each of the five worked cells.
    await waitFor(() =>
      expect(screen.getAllByText('Marie Dupont')).toHaveLength(1),
    )
    expect(screen.getByText(/08:00.*17:00/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /July 15th/, pressed: true }),
    ).toBeInTheDocument()
  })

  it('switches the panel to the day that was tapped', async () => {
    const user = setupUser()
    setup({ contracts: [makePlanningContract()] })
    renderWithProviders(<Planning />)
    await screen.findByText('Marie Dupont')

    // 14 July 2026 is a Tuesday, so nothing is scheduled on it.
    await user.click(screen.getByRole('button', { name: /July 14th/ }))
    expect(
      await screen.findByText('Nothing scheduled on this day.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Marie Dupont')).not.toBeInTheDocument()
  })

  it('names the holiday of the selected day', async () => {
    const user = setupUser()
    setup({
      holidays: [
        {
          id: 'h1',
          name: 'Fête Nationale',
          date: '2026-07-14',
          is_workable: false,
        },
      ],
    })
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')

    // The name is only in the panel now, so it takes a tap to reach it.
    expect(screen.queryByText('Fête Nationale')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /July 14th/ }))
    expect(await screen.findByText('Fête Nationale')).toBeInTheDocument()
  })

  it('falls back to the 1st when the month changes under the selection', async () => {
    const user = setupUser()
    // 1 August 2026 is a Saturday: schedule the nanny then, so the day the
    // selection falls back to is a worked one and the panel has to say so.
    setup({
      contracts: [
        makePlanningContract({
          schedule_history: [
            makeSchedule({
              blocks: [
                {
                  id: 'b1',
                  weekday: 5,
                  start_time: '08:00:00',
                  end_time: '17:00:00',
                },
              ],
            }),
          ],
        }),
      ],
    })
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(
      await screen.findByRole('button', { name: /August 1st/, pressed: true }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
  })

  // A day off is the nanny's own — both families see it — but exceptional hours
  // are private and an exceptional presence belongs to whichever family's child
  // it is. On a shared contract the acting family ('1') must not see the
  // co-employer's ('2') on the calendar. Today, Wed 15 July, is selected, so the
  // phone panel lists that day's events inline.
  it("hides the co-employer's exceptional presence", async () => {
    // Both children windowed to Monday only, so neither rides the Wednesday
    // block — only their presence *event* can put them on the selected day.
    const mondayOnly = [
      { id: 'w1', weekday: 0 as const, start_time: '08:00', end_time: '12:00' },
    ]
    setup({
      contracts: [
        makePlanningContract({
          children: [
            {
              id: 'cc1',
              child: 'c1',
              first_name: 'Léa',
              family_id: '1',
              windows: mondayOnly,
            },
            {
              id: 'cc2',
              child: 'c2',
              first_name: 'Tom',
              family_id: '2',
              windows: mondayOnly,
            },
          ],
          exceptional_presences: [
            {
              id: 'p1',
              child: 'c1',
              first_name: 'Léa',
              date: '2026-07-15',
              start_time: '15:00',
              end_time: '17:00',
              notes: '',
            },
            {
              id: 'p2',
              child: 'c2',
              first_name: 'Tom',
              date: '2026-07-15',
              start_time: '15:00',
              end_time: '17:00',
              notes: '',
            },
          ] as ExceptionalPresenceRead[],
        }),
      ],
    })
    renderWithProviders(<Planning />)

    expect(await screen.findByText(/Léa/)).toBeInTheDocument()
    expect(screen.queryByText(/Tom/)).not.toBeInTheDocument()
  })

  it("hides the co-employer's exceptional hours", async () => {
    setup({
      contracts: [
        makePlanningContract({
          exceptional_hours: [
            {
              id: 'h1',
              family: '1',
              kind: 'effective',
              is_shared: false,
              start_date: '2026-07-15',
              start_time: '18:30',
              end_date: '2026-07-15',
              end_time: '20:00',
              interventions: 0,
              notes: '',
            },
            {
              id: 'h2',
              family: '2',
              kind: 'effective',
              is_shared: true,
              start_date: '2026-07-15',
              start_time: '21:45',
              end_date: '2026-07-15',
              end_time: '22:30',
              interventions: 0,
              notes: '',
            },
          ] as ExceptionalHoursRead[],
        }),
      ],
    })
    renderWithProviders(<Planning />)

    // The acting family's own entry (18:30 → 6:30 PM) shows; the shared entry the
    // co-employer filed (21:45 → 9:45 PM) does not.
    expect(await screen.findByText(/6:30/)).toBeInTheDocument()
    expect(screen.queryByText(/9:45/)).not.toBeInTheDocument()
  })

  // The reported case: a shared window is filed once per family (each declares
  // its own share), so the endpoint hands back both copies of the *same* window.
  // The acting family ('1') must see one mark, not one per family.
  it('marks a shared window once, not once per family', async () => {
    setup({
      contracts: [
        makePlanningContract({
          exceptional_hours: [
            {
              id: 'h1',
              family: '2',
              kind: 'effective',
              is_shared: true,
              start_date: '2026-07-15',
              start_time: '17:30',
              end_date: '2026-07-15',
              end_time: '18:00',
              interventions: 0,
              notes: 'Extra hours of work',
            },
            {
              id: 'h2',
              family: '1',
              kind: 'effective',
              is_shared: true,
              start_date: '2026-07-15',
              start_time: '17:30',
              end_date: '2026-07-15',
              end_time: '18:00',
              interventions: 0,
              notes: '',
            },
          ] as ExceptionalHoursRead[],
        }),
      ],
    })
    renderWithProviders(<Planning />)

    // 17:30 → 5:30 PM. Both copies read identically, so a missing filter would
    // surface two nodes; keeping the acting family's own leaves exactly one.
    await screen.findByText(/5:30/)
    expect(screen.getAllByText(/5:30/)).toHaveLength(1)
  })
})
