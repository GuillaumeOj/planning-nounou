import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from '@/src/components/Modal'
import { renderWithProviders } from '@/tests/utils'

describe('Modal', () => {
  it('renders a labelled dialog with its content', () => {
    renderWithProviders(
      <Modal title="Confirm your password" onClose={vi.fn()}>
        <p>body</p>
      </Modal>,
    )

    expect(
      screen.getByRole('dialog', { name: 'Confirm your password' }),
    ).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('closes on a backdrop click', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <Modal title="Title" onClose={onClose}>
        <p>body</p>
      </Modal>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <Modal title="Title" onClose={onClose}>
        <p>body</p>
      </Modal>,
    )

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
