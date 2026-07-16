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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Bootstrap/entry, vendored shadcn primitives, and pure type files carry no
      // first-party testable logic.
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/components/ui/**',
        'src/lib/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
