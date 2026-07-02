import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/utils'
import { SettingsBar } from './SettingsBar'

function renderBar() {
  return renderWithProviders(<SettingsBar />)
}

describe('SettingsBar', () => {
  it('renders a language and a theme dropdown defaulting to system', () => {
    renderBar()
    expect(screen.getByLabelText('Language')).toHaveValue('system')
    expect(screen.getByLabelText('Theme')).toHaveValue('system')
  })

  it('switches the UI language and its own labels', async () => {
    renderBar()

    await userEvent.selectOptions(screen.getByLabelText('Language'), 'fr')

    expect(document.documentElement.lang).toBe('fr')
    // The control labels are themselves translated after the switch.
    expect(screen.getByLabelText('Langue')).toHaveValue('fr')
    expect(screen.getByLabelText('Thème')).toBeInTheDocument()
  })

  it('switches the theme and applies it to <html>', async () => {
    renderBar()

    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark')

    expect(screen.getByLabelText('Theme')).toHaveValue('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
