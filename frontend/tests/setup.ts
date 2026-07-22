import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from '@/tests/msw/server'

// RTK Query calls the real network (fetchBaseQuery), so tests mock at the HTTP layer
// with MSW. Each test registers the handlers its component needs via `server.use(...)`;
// an /api request with no handler is a test failure, not a silent hang.
beforeAll(() =>
  server.listen({
    onUnhandledRequest: (request, print) => {
      if (new URL(request.url).pathname.startsWith('/api')) {
        print.error()
      }
    },
  }),
)
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

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
