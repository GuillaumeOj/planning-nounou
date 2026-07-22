import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractRead, FamilyRead } from '@/src/api'
import Declarations from '@/src/pages/Declarations'
import { server } from '@/tests/msw/server'
import { renderWithProviders, selectOption } from '@/tests/utils'

const family: FamilyRead = {
  id: 'fam-1',
  name: 'Home',
  role: 'owner',
  is_claimed: true,
  created_at: '',
}

const contract = {
  id: 'contract-1',
  nanny: { id: 'n1', first_name: 'Marie', last_name: 'Dupont' },
} as ContractRead

// The three requests the page (and the DeclarationSection it renders) fire: the
// family list, the acting family's contracts, then per contract the month's
// declarations. The handlers record what was asked for so a test can assert the
// scope — the MSW equivalent of the old `expect(getDeclarations).toHaveBeenCalledWith`.
function setup({
  families = [family],
  contracts = [contract],
  contractsError = false,
}: {
  families?: FamilyRead[]
  contracts?: ContractRead[]
  contractsError?: boolean
} = {}) {
  const calls = {
    contracts: [] as string[],
    declarations: [] as {
      familyPk: string
      contractPk: string
      month: string | null
    }[],
  }
  server.use(
    http.get('*/api/families/', () => HttpResponse.json(families)),
    http.get('*/api/families/:familyPk/contracts/', ({ params }) => {
      calls.contracts.push(params.familyPk as string)
      if (contractsError) return new HttpResponse(null, { status: 500 })
      return HttpResponse.json(contracts)
    }),
    http.get(
      '*/api/families/:familyPk/contracts/:contractPk/declarations/',
      ({ params, request }) => {
        calls.declarations.push({
          familyPk: params.familyPk as string,
          contractPk: params.contractPk as string,
          month: new URL(request.url).searchParams.get('month'),
        })
        return HttpResponse.json([])
      },
    ),
  )
  return calls
}

beforeEach(() => {
  // The month a parent lands on is derived from today, so pin today.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-17T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Declarations', () => {
  // You declare a month once it is over, so the month just gone is what a parent
  // almost always came here for.
  it('lands on last month', async () => {
    const calls = setup()
    renderWithProviders(<Declarations />)

    expect(await screen.findByText('June 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(calls.declarations).toContainEqual({
        familyPk: 'fam-1',
        contractPk: 'contract-1',
        month: '2026-06',
      }),
    )
  })

  it('asks for the month it moved to', async () => {
    const calls = setup()
    renderWithProviders(<Declarations />)
    await screen.findByText('June 2026')

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous month' }),
    )

    expect(await screen.findByText('May 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(calls.declarations).toContainEqual({
        familyPk: 'fam-1',
        contractPk: 'contract-1',
        month: '2026-05',
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('June 2026')).toBeInTheDocument()
  })

  it('jumps back to the current month', async () => {
    const calls = setup()
    renderWithProviders(<Declarations />)
    await screen.findByText('June 2026')

    await userEvent.click(screen.getByRole('button', { name: 'Today' }))

    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(calls.declarations).toContainEqual({
        familyPk: 'fam-1',
        contractPk: 'contract-1',
        month: '2026-07',
      }),
    )
  })

  it('renders a section per contract', async () => {
    setup({
      contracts: [
        contract,
        {
          id: 'contract-2',
          nanny: { id: 'n2', first_name: 'Jeanne', last_name: 'Martin' },
        } as ContractRead,
      ],
    })
    renderWithProviders(<Declarations />)

    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('Jeanne Martin')).toBeInTheDocument()
  })

  // The acting family is the one whose declaration can be written, so switching
  // it has to re-scope the request rather than just relabel the page.
  it('reads as the family that was picked', async () => {
    const calls = setup({
      families: [family, { ...family, id: 'fam-2', name: 'Grandparents' }],
    })
    renderWithProviders(<Declarations />)
    await screen.findByText('Marie Dupont')

    await selectOption('Acting as family', 'Grandparents')

    await waitFor(() => expect(calls.contracts).toContain('fam-2'))
    await waitFor(() =>
      expect(calls.declarations).toContainEqual({
        familyPk: 'fam-2',
        contractPk: 'contract-1',
        month: '2026-06',
      }),
    )
  })

  it('says so when there are no contracts to declare for', async () => {
    setup({ contracts: [] })
    renderWithProviders(<Declarations />)

    expect(
      await screen.findByText(
        'No nannies yet. Add one to declare their hours.',
      ),
    ).toBeInTheDocument()
  })

  it('asks for a family before anything else when there is none', async () => {
    const calls = setup({ families: [] })
    renderWithProviders(<Declarations />)

    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
    expect(calls.declarations).toHaveLength(0)
  })

  it('reports a failure to load the contracts', async () => {
    setup({ contractsError: true })
    renderWithProviders(<Declarations />)

    expect(
      await screen.findByText('Could not load the declarations.'),
    ).toBeInTheDocument()
  })
})
