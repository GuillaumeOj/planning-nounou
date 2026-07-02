import { AxiosError } from 'axios'

// Turn an API failure into a list of human-readable messages. DRF returns either
// {detail: "..."} or a map of field -> [messages]; both are flattened here so the
// UI can show one message inline or several as a bulleted list.
export function extractErrorMessages(
  error: unknown,
  fallback = 'Something went wrong',
): string[] {
  if (error instanceof AxiosError && error.response) {
    const data = error.response.data
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
