import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsBar } from '@/src/components/SettingsBar'
import { renderWithProviders, selectOption } from '@/tests/utils'

function renderBar() {
  return renderWithProviders(<SettingsBar />)
}

describe('SettingsBar', () => {
  it('renders a language and a theme dropdown defaulting to system', () => {
    renderBar()
    // The Select trigger shows the current choice's label rather than carrying a
    // form value, so assert on its text.
    expect(screen.getByLabelText('Language')).toHaveTextContent('System')
    expect(screen.getByLabelText('Theme')).toHaveTextContent('System')
  })

  it('switches the UI language and its own labels', async () => {
    renderBar()

    await selectOption('Language', 'Français')

    expect(document.documentElement.lang).toBe('fr')
    // The control labels are themselves translated after the switch.
    expect(screen.getByLabelText('Langue')).toHaveTextContent('Français')
    expect(screen.getByLabelText('Thème')).toBeInTheDocument()
  })

  it('switches the theme and applies it to <html>', async () => {
    renderBar()

    await selectOption('Theme', 'Dark')

    expect(screen.getByLabelText('Theme')).toHaveTextContent('Dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
