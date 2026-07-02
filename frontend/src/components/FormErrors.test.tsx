import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormErrors } from './FormErrors'

describe('FormErrors', () => {
  it('renders nothing when there are no messages', () => {
    const { container } = render(<FormErrors messages={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a single message inline, not as a list', () => {
    render(<FormErrors messages={['Invalid password']} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid password')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows multiple messages as a bulleted list', () => {
    render(
      <FormErrors messages={['Email already exists', 'Password too short']} />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Email already exists')
    expect(items[1]).toHaveTextContent('Password too short')
  })
})
