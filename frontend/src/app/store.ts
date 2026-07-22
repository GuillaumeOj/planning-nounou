import { configureStore } from '@reduxjs/toolkit'
import { emptyApi } from '@/src/api/emptyApi'

// RTK Query owns all server state (the old TanStack Query cache), so the only
// reducer/middleware is the generated API slice. A factory so tests can spin up an
// isolated store (and thus an isolated cache) per render.
export function makeStore() {
  return configureStore({
    reducer: {
      [emptyApi.reducerPath]: emptyApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(emptyApi.middleware),
  })
}

// The app-wide singleton store.
export const store = makeStore()

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
