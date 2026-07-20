import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Contract, getContracts } from '@/src/api/contracts'
import { getDeclarations } from '@/src/api/declarations'
import { getFamilies } from '@/src/api/family'
import Declarations from '@/src/pages/Declarations'
import { renderWithProviders, selectOption } from '@/tests/utils'

vi.mock('@/src/api/family', () => ({ getFamilies: vi.fn() }))
vi.mock('@/src/api/contracts', () => ({ getContracts: vi.fn() }))
vi.mock('@/src/api/declarations', () => ({
  getDeclarations: vi.fn(),
  updateDeclaration: vi.fn(),
  fileDeclaration: vi.fn(),
}))

const m = {
  families: vi.mocked(getFamilies),
  contracts: vi.mocked(getContracts),
  declarations: vi.mocked(getDeclarations),
}

const family = {
  id: 'fam-1',
  name: 'Home',
  role: 'owner' as const,
  is_claimed: true,
  created_at: '',
}

const contract = {
  id: 'contract-1',
  nanny: { id: 'n1', first_name: 'Marie', last_name: 'Dupont' },
} as Contract

beforeEach(() => {
  vi.clearAllMocks()
  // The month a parent lands on is derived from today, so pin today.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-17T09:00:00Z'))
  m.families.mockResolvedValue([family])
  m.contracts.mockResolvedValue([contract])
  m.declarations.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Declarations', () => {
  // You declare a month once it is over, so the month just gone is what a parent
  // almost always came here for.
  it('lands on last month', async () => {
    renderWithProviders(<Declarations />)

    expect(await screen.findByText('June 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(m.declarations).toHaveBeenCalledWith(
        'fam-1',
        'contract-1',
        '2026-06',
      ),
    )
  })

  it('asks for the month it moved to', async () => {
    renderWithProviders(<Declarations />)
    await screen.findByText('June 2026')

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous month' }),
    )

    expect(await screen.findByText('May 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(m.declarations).toHaveBeenCalledWith(
        'fam-1',
        'contract-1',
        '2026-05',
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('June 2026')).toBeInTheDocument()
  })

  it('jumps back to the current month', async () => {
    renderWithProviders(<Declarations />)
    await screen.findByText('June 2026')

    await userEvent.click(screen.getByRole('button', { name: 'Today' }))

    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(m.declarations).toHaveBeenCalledWith(
        'fam-1',
        'contract-1',
        '2026-07',
      ),
    )
  })

  it('renders a section per contract', async () => {
    m.contracts.mockResolvedValue([
      contract,
      {
        id: 'contract-2',
        nanny: { id: 'n2', first_name: 'Jeanne', last_name: 'Martin' },
      } as Contract,
    ])
    renderWithProviders(<Declarations />)

    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('Jeanne Martin')).toBeInTheDocument()
  })

  // The acting family is the one whose declaration can be written, so switching
  // it has to re-scope the request rather than just relabel the page.
  it('reads as the family that was picked', async () => {
    m.families.mockResolvedValue([
      family,
      { ...family, id: 'fam-2', name: 'Grandparents' },
    ])
    renderWithProviders(<Declarations />)
    await screen.findByText('Marie Dupont')

    await selectOption('Acting as family', 'Grandparents')

    await waitFor(() => expect(m.contracts).toHaveBeenCalledWith('fam-2'))
    await waitFor(() =>
      expect(m.declarations).toHaveBeenCalledWith(
        'fam-2',
        'contract-1',
        '2026-06',
      ),
    )
  })

  it('says so when there are no contracts to declare for', async () => {
    m.contracts.mockResolvedValue([])
    renderWithProviders(<Declarations />)

    expect(
      await screen.findByText(
        'No nannies yet. Add one to declare their hours.',
      ),
    ).toBeInTheDocument()
  })

  it('asks for a family before anything else when there is none', async () => {
    m.families.mockResolvedValue([])
    renderWithProviders(<Declarations />)

    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
    expect(m.declarations).not.toHaveBeenCalled()
  })

  it('reports a failure to load the contracts', async () => {
    m.contracts.mockRejectedValue(new Error('boom'))
    renderWithProviders(<Declarations />)

    expect(
      await screen.findByText('Could not load the declarations.'),
    ).toBeInTheDocument()
  })
})
