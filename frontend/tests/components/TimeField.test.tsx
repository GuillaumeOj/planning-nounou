import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TimeField, toDisplayTime, toStoredTime } from '@/components/TimeField'
import type { Language } from '@/i18n/translations'

// A controlled harness: real usage feeds the emitted value back as `value`.
function Harness({
  lang,
  onChange,
}: {
  lang: Language
  onChange: (s: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <TimeField
      id="t"
      label="From"
      value={value}
      lang={lang}
      onChange={(stored) => {
        onChange(stored)
        setValue(stored)
      }}
    />
  )
}

describe('time formatting helpers', () => {
  it('parses English AM/PM into 24h storage', () => {
    expect(toStoredTime('2:30 PM', 'en')).toBe('14:30')
    expect(toStoredTime('9:00 AM', 'en')).toBe('09:00')
  })

  it('parses French 24h into storage', () => {
    expect(toStoredTime('14:30', 'fr')).toBe('14:30')
  })

  it('returns empty for blank or invalid input', () => {
    expect(toStoredTime('', 'en')).toBe('')
    expect(toStoredTime('nope', 'fr')).toBe('')
  })

  it('displays storage in the language convention', () => {
    expect(toDisplayTime('14:30', 'en')).toBe('2:30 PM')
    expect(toDisplayTime('14:30', 'fr')).toBe('14:30')
    expect(toDisplayTime('', 'en')).toBe('')
  })
})

describe('TimeField', () => {
  it('emits 24h storage as the user types a localized time', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness lang="en" onChange={onChange} />)
    await user.type(screen.getByLabelText('From'), '9:00 AM')
    expect(onChange).toHaveBeenLastCalledWith('09:00')
  })

  it('shows the stored value in the language convention', () => {
    render(
      <TimeField
        id="t"
        label="From"
        value="14:30"
        onChange={vi.fn()}
        lang="fr"
      />,
    )
    expect(screen.getByLabelText('From')).toHaveValue('14:30')
  })
})
