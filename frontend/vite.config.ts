/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Set when the dev server runs inside the Docker stack, where Django is a compose service
// rather than localhost, and the page is served through OrbStack's TLS proxy on 443.
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Anchored at the frontend root so both src/ and tests/ are reachable
      // from a single alias.
      '@': path.resolve(__dirname, './'),
    },
  },
  server: {
    // Vite rejects requests whose Host it doesn't recognise; these are the domains
    // OrbStack serves the container on.
    allowedHosts: ['nanny-dev.local', '.orb.local'],
    // Proxy API calls to the local Django backend so dev needs no CORS handling and mirrors
    // production: the root vercel.json rewrites /api(/.*)? to the backend service and
    // everything else to this SPA, on one origin. Keep the two in step.
    proxy: {
      '/api': {
        target: apiProxyTarget,
        // Keep the browser's Host header. Vite's shorthand would rewrite it to the target,
        // and Django both checks that header against ALLOWED_HOSTS and builds redirect URLs
        // from it — so admin would bounce the browser to the internal host. Vercel likewise
        // forwards the real host to the backend.
        changeOrigin: false,
      },
    },
    // Default (ws on the dev-server port) is right when serving over plain http; behind
    // OrbStack's HTTPS the browser would block that as mixed content.
    hmr: hmrClientPort
      ? { protocol: 'wss', clientPort: Number(hmrClientPort) }
      : undefined,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // The default 5s is wall-clock, and these tests spend most of it waiting for
    // a core rather than working: a userEvent-driven test that takes under a
    // second on its own can blow 5s when the suite runs in parallel on a busy
    // machine — CI, or a laptop with something heavy running beside it. The
    // failure moved to a different test on every run, which is the tell that it
    // was contention and not the code. Raising this costs nothing on a green run
    // (a passing test still returns as fast as it ever did) and only bounds how
    // long a genuine hang is allowed to sit there.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Bootstrap/entry, vendored shadcn primitives, and pure type files carry no
      // first-party testable logic. src/lib is NOT excluded: it used to be nothing
      // but `cn` and a class string, but it now holds real logic (day-window
      // copying, money/hours formatting) that was gated while it lived in a page
      // and would silently stop being gated by the move alone.
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/components/ui/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
