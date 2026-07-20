import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { type SeoMeta, useSeoMeta } from '@/src/hooks/useSeoMeta'
import { APP_NAME, SITE_URL } from '@/src/lib/brand'

function Probe(meta: SeoMeta) {
  useSeoMeta(meta)
  return null
}

// The hook mutates the shared <head>, so clear the tags it manages before each
// case to keep them isolated.
beforeEach(() => {
  for (const node of document.head.querySelectorAll(
    'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]',
  )) {
    node.remove()
  }
})

describe('useSeoMeta', () => {
  it('sets the title suffixed with the app name and the description', () => {
    render(<Probe title="A page" description="A short summary." />)

    expect(document.title).toBe(`A page · ${APP_NAME}`)
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe('A short summary.')
  })

  it('does not double up the app name when the title already contains it', () => {
    render(<Probe title={APP_NAME} description="Home." />)
    expect(document.title).toBe(APP_NAME)

    render(<Probe title={`${APP_NAME} — sub`} description="x" />)
    expect(document.title).toBe(`${APP_NAME} — sub`)
  })

  it('sets an absolute canonical and og:url only when a canonical is given', () => {
    const { rerender } = render(<Probe title="No canonical" description="x" />)
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).not.toBeInTheDocument()

    rerender(
      <Probe title="With canonical" description="x" canonical="/features" />,
    )
    const absolute = `${SITE_URL}/features`
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute('href'),
    ).toBe(absolute)
    expect(
      document.head
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content'),
    ).toBe(absolute)
  })

  it('removes a stale canonical when a later route omits it', () => {
    const { rerender } = render(
      <Probe title="Has one" description="x" canonical="/pricing" />,
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toBeInTheDocument()

    rerender(<Probe title="No canonical now" description="x" />)
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).not.toBeInTheDocument()
    expect(
      document.head.querySelector('meta[property="og:url"]'),
    ).not.toBeInTheDocument()
  })

  it('updates the existing tags rather than duplicating them', () => {
    const { rerender } = render(<Probe title="First" description="one" />)
    rerender(<Probe title="Second" description="two" />)

    const descriptions = document.head.querySelectorAll(
      'meta[name="description"]',
    )
    expect(descriptions).toHaveLength(1)
    expect(descriptions[0].getAttribute('content')).toBe('two')
  })
})
