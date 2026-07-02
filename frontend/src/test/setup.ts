import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// jsdom does not implement matchMedia; provide a light-system default that
// individual tests can override.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

// Keep persisted state and the applied theme from leaking between tests.
afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
