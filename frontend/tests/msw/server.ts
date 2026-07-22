import { setupServer } from 'msw/node'

// The shared MSW server. Tests register per-case handlers with `server.use(...)`;
// tests/setup.ts starts it, resets handlers after each test, and closes it at the end.
// Unhandled /api requests error (see setup.ts) so a missing handler is a loud failure,
// not a silent hang.
export const server = setupServer()
