import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'

// Radix primitives (Dialog, Popover, Calendar, AlertDialog) rely on DOM APIs
// jsdom does not implement. Stub them so those components can mount in tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}
Element.prototype.hasPointerCapture = vi.fn(() => false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

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
