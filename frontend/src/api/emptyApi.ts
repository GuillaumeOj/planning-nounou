import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithReauth } from '@/src/api/baseQuery'

// The base API the OpenAPI codegen injects generated endpoints into (see
// openapi-config.ts -> apiImport). Kept endpoint-free; codegen owns the endpoints.
//
// Cache tags are supplied by the codegen, not here: `tag: true` in openapi-config.ts makes
// generated.ts call `.enhanceEndpoints({ addTagTypes })` with one coarse tag per top-level
// path segment ("families", "invitations", "contract-invitations", …). Every family-scoped
// query/mutation therefore shares the "families" tag — coarse but always-safe invalidation.
// api/index.ts refines only the two cross-segment accept flows. So the base declares no
// tagTypes of its own.
export const emptyApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  endpoints: () => ({}),
})
