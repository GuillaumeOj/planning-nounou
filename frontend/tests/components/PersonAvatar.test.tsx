import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PersonAvatar, personInitials } from '@/src/components/PersonAvatar'

describe('personInitials', () => {
  it('takes the first and last word initials', () => {
    expect(personInitials('Camille Martin')).toBe('CM')
    expect(personInitials('Marie De La Tour')).toBe('MT')
  })

  it('takes a single letter for a lone word (first name or email)', () => {
    expect(personInitials('Léa')).toBe('L')
    expect(personInitials('me@example.com')).toBe('M')
  })

  it('falls back to a placeholder for an empty name', () => {
    expect(personInitials('   ')).toBe('?')
  })
})

describe('PersonAvatar', () => {
  it('renders the initials and stays hidden from assistive tech', () => {
    render(<PersonAvatar name="Camille Martin" />)
    const initials = screen.getByText('CM')
    expect(initials).toBeInTheDocument()
    // The name is always spelled out beside it, so the avatar is decorative.
    expect(initials.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
