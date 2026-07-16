import { useCallback, useSyncExternalStore } from 'react'

// Tailwind's `md` breakpoint. Anything below it is treated as a phone-sized
// screen; keep this in step with the `md:` variants in the layout.
export const MOBILE_QUERY = '(max-width: 767px)'

// Subscribe to a CSS media query from JS.
//
// Layout should be done in CSS (`md:` variants) wherever the markup is the same
// at both sizes — `md:hidden` drops content from the tab order and the
// accessibility tree, so hiding is not the problem. Reach for this only when the
// two sizes need genuinely different *elements*, which no media query can turn
// into one another, and rendering both would leave a duplicate set in the DOM.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  // Read live rather than caching in state, so the first paint is already
  // correct and a resize can't leave a stale value behind. Stable identity keeps
  // useSyncExternalStore from re-checking the store after every render.
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  )
  // Server snapshot is unused (this is a client-only SPA) but required by the API.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
