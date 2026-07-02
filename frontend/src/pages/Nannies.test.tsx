import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNanny,
  deleteNanny,
  getNannies,
  updateNanny,
} from '../api/nannies'
import { I18nProvider } from '../i18n/I18nContext'
import Nannies from './Nannies'

vi.mock('../api/nannies', () => ({
  getNannies: vi.fn(),
  createNanny: vi.fn(),
  updateNanny: vi.fn(),
  deleteNanny: vi.fn(),
}))

const mockGetNannies = vi.mocked(getNannies)
const mockCreateNanny = vi.mocked(createNanny)
const mockUpdateNanny = vi.mocked(updateNanny)
const mockDeleteNanny = vi.mocked(deleteNanny)

const marie = {
  id: 1,
  first_name: 'Marie',
  last_name: 'Dupont',
  starting_date: '2026-01-05',
  ending_date: null,
}
const paul = {
  id: 2,
  first_name: 'Paul',
  last_name: 'Martin',
  starting_date: '2025-03-01',
  ending_date: '2026-06-30',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Nannies />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Nannies', () => {
  it('shows a loading state', () => {
    mockGetNannies.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('reports a load error', async () => {
    mockGetNannies.mockRejectedValue(new Error('boom'))
    renderPage()

    expect(
      await screen.findByText('Could not load your nannies.'),
    ).toBeInTheDocument()
  })

  it('shows an empty state when there are no nannies', async () => {
    mockGetNannies.mockResolvedValue([])
    renderPage()

    expect(
      await screen.findByText('No nannies yet. Add your first one below.'),
    ).toBeInTheDocument()
  })

  it('lists nannies with ongoing and ended periods (en: mm/dd/yyyy)', async () => {
    mockGetNannies.mockResolvedValue([marie, paul])
    renderPage()

    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('01/05/2026 → ongoing')).toBeInTheDocument()
    expect(screen.getByText('Paul Martin')).toBeInTheDocument()
    expect(screen.getByText('03/01/2025 → 06/30/2026')).toBeInTheDocument()
  })

  it('formats dates for French (dd/mm/yyyy)', async () => {
    localStorage.setItem('nounou.lang', 'fr')
    mockGetNannies.mockResolvedValue([paul])
    renderPage()

    expect(
      await screen.findByText('01/03/2025 → 30/06/2026'),
    ).toBeInTheDocument()
  })

  it('adds a nanny, mapping an empty end date to null', async () => {
    mockGetNannies.mockResolvedValue([])
    mockCreateNanny.mockResolvedValue(marie)
    renderPage()
    await screen.findByText('No nannies yet. Add your first one below.')

    await userEvent.type(screen.getByLabelText('First name'), 'Marie')
    await userEvent.type(screen.getByLabelText('Last name'), 'Dupont')
    // English entry is mm/dd/yyyy; it is parsed back to ISO before submit.
    fireEvent.change(screen.getByLabelText('Starting date'), {
      target: { value: '01/05/2026' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add nanny' }))

    await waitFor(() =>
      expect(mockCreateNanny).toHaveBeenCalledWith({
        first_name: 'Marie',
        last_name: 'Dupont',
        starting_date: '2026-01-05',
        ending_date: null,
      }),
    )
  })

  it('parses French date entry (dd/mm/yyyy) to ISO', async () => {
    localStorage.setItem('nounou.lang', 'fr')
    mockGetNannies.mockResolvedValue([])
    mockCreateNanny.mockResolvedValue(marie)
    renderPage()
    await screen.findByText(
      'Aucune nounou pour le moment. Ajoutez la première ci-dessous.',
    )

    await userEvent.type(screen.getByLabelText('Prénom'), 'Marie')
    await userEvent.type(screen.getByLabelText('Nom'), 'Dupont')
    fireEvent.change(screen.getByLabelText('Date de début'), {
      target: { value: '05/01/2026' },
    })
    await userEvent.click(
      screen.getByRole('button', { name: 'Ajouter la nounou' }),
    )

    await waitFor(() =>
      expect(mockCreateNanny).toHaveBeenCalledWith({
        first_name: 'Marie',
        last_name: 'Dupont',
        starting_date: '2026-01-05',
        ending_date: null,
      }),
    )
  })

  it('rejects an invalid date without calling the API', async () => {
    mockGetNannies.mockResolvedValue([])
    renderPage()
    await screen.findByText('No nannies yet. Add your first one below.')

    await userEvent.type(screen.getByLabelText('First name'), 'Marie')
    await userEvent.type(screen.getByLabelText('Last name'), 'Dupont')
    fireEvent.change(screen.getByLabelText('Starting date'), {
      target: { value: '13/45/2026' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add nanny' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid date.',
    )
    expect(mockCreateNanny).not.toHaveBeenCalled()
  })

  it('shows a server error when adding fails', async () => {
    mockGetNannies.mockResolvedValue([])
    mockCreateNanny.mockRejectedValue(new Error('nope'))
    renderPage()
    await screen.findByText('No nannies yet. Add your first one below.')

    await userEvent.type(screen.getByLabelText('First name'), 'Marie')
    await userEvent.type(screen.getByLabelText('Last name'), 'Dupont')
    fireEvent.change(screen.getByLabelText('Starting date'), {
      target: { value: '01/05/2026' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add nanny' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it('edits an existing nanny with the prefilled form', async () => {
    mockGetNannies.mockResolvedValue([marie])
    mockUpdateNanny.mockResolvedValue({ ...marie, ending_date: '2026-12-31' })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByText('Edit nanny')).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Marie')
    // The starting date is prefilled in the localized (en) format.
    expect(screen.getByLabelText('Starting date')).toHaveValue('01/05/2026')
    fireEvent.change(screen.getByLabelText('Ending date (optional)'), {
      target: { value: '12/31/2026' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdateNanny).toHaveBeenCalledWith(1, {
        first_name: 'Marie',
        last_name: 'Dupont',
        starting_date: '2026-01-05',
        ending_date: '2026-12-31',
      }),
    )
  })

  it('cancels editing and returns to the add form', async () => {
    mockGetNannies.mockResolvedValue([marie])
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByText('Edit nanny')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Add a nanny')).toBeInTheDocument()
  })

  it('deletes a nanny when confirmed', async () => {
    mockGetNannies.mockResolvedValue([marie])
    mockDeleteNanny.mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockDeleteNanny).toHaveBeenCalledWith(1))
  })

  it('does not delete when the confirmation is dismissed', async () => {
    mockGetNannies.mockResolvedValue([marie])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(mockDeleteNanny).not.toHaveBeenCalled()
  })
})
