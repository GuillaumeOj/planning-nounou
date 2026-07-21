// A post-auth redirect target read from a `?next=` query param. Only same-origin
// root-relative paths are honoured, so a crafted `?next=https://evil.com` (or the
// protocol-relative `//evil.com`) can never turn the login/register flow into an open
// redirect — it falls back to the given default instead.
export function resolveNext(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}
