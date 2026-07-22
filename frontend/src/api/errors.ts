import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return typeof error === 'object' && error !== null && 'status' in error
}

// Turn an API failure into a list of human-readable messages. DRF returns either
// {detail: "..."} or a map of field -> [messages]; both are flattened here so the UI
// can show one message inline or several as a bulleted list. Mirrors the old axios-based
// helper but reads RTK Query's FetchBaseQueryError shape ({ status, data }).
//
// Only a structured HTTP response (numeric status + parsed body) yields specific
// messages. Transport failures (FETCH_ERROR/PARSING_ERROR), thrown JS errors, and
// anything else fall back to the caller's message rather than leaking an internal
// string to the user — the same behaviour the axios version had for a response-less error.
export function extractErrorMessages(
  error: unknown,
  fallback = 'Something went wrong',
): string[] {
  if (isFetchBaseQueryError(error) && typeof error.status === 'number') {
    const data = error.data
    if (typeof data === 'string') {
      return [data]
    }
    if (data && typeof data === 'object') {
      if (typeof (data as { detail?: unknown }).detail === 'string') {
        return [(data as { detail: string }).detail]
      }
      const messages = Object.values(data as Record<string, unknown>)
        .flat()
        .filter((value): value is string => typeof value === 'string')
      if (messages.length > 0) {
        return messages
      }
    }
  }
  return [fallback]
}
