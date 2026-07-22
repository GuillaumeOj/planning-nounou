import type { ConfigFile } from '@rtk-query/codegen-openapi'

// Generates the RTK Query API slice + TypeScript types from the backend's OpenAPI
// schema, so the frontend can never drift from the API. Regenerate with `bun run codegen`
// after re-emitting backend/schema.yml (see backend: `manage.py spectacular`).
const config: ConfigFile = {
  // Committed schema file (backend/schema.yml) — reproducible without a running server.
  schemaFile: '../backend/schema.yml',
  // Inject endpoints into our base api (custom auth-refresh baseQuery + tagTypes).
  apiFile: './src/api/emptyApi.ts',
  apiImport: 'emptyApi',
  outputFile: './src/api/generated.ts',
  exportName: 'generatedApi',
  hooks: true,
  // Derive per-tag providesTags/invalidatesTags from the OpenAPI operation tags as a
  // baseline; api/index.ts refines these to resource-level tags where needed.
  tag: true,
}

export default config
