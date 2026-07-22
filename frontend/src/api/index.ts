import { generatedApi } from '@/src/api/generated'

// The app-facing API slice. Codegen (openapi-config.ts -> generated.ts) derives
// providesTags/invalidatesTags from the OpenAPI operation tags — one tag per top-level
// path segment ("families", "invitations", "contract-invitations", …). Because every
// family-scoped resource (contracts, terms, schedules, children, leaves, declarations…)
// lives under /families/, they all share the "families" tag: any family-scoped mutation
// refetches every family-scoped query. Coarser than the old per-key TanStack invalidation
// but strictly safe — it never leaves a family-scoped view stale.
//
// The only gaps are the two accept flows, whose URLs sit under a *different* top-level
// segment than the data they change: accepting a family/contract invitation joins a
// family, so it must also refetch the "families" tag. Enhance those here.
export const api = generatedApi.enhanceEndpoints({
  endpoints: {
    invitationsAcceptCreate: {
      invalidatesTags: ['invitations', 'families'],
    },
    contractInvitationsAcceptCreate: {
      invalidatesTags: ['contract-invitations', 'families'],
    },
  },
})

// Re-export every generated hook so consumers import from a single stable module
// (`@/src/api`) rather than the generated file directly.
export * from '@/src/api/generated'
