import { useEffect } from 'react'
import { APP_NAME, SITE_URL } from '@/src/lib/brand'

// Per-route SEO for a client-rendered SPA. This updates document.title and the
// <head> meta tags after React mounts, which Googlebot (it runs JS) will read —
// but most social/link-preview scrapers only parse the initial HTML, so the
// STATIC tags in index.html are what carry link previews for the "/" URL. See
// the landing plan: true per-route social previews would need pre-rendering.

export interface SeoMeta {
  // The page title, shown in the tab and as og:title. Suffixed with the app
  // name unless it already is the app name (the landing).
  title: string
  description: string
  // Absolute or root-relative URL for <link rel="canonical"> / og:url. Optional.
  canonical?: string
}

// Find an existing <meta>/<link> by a matching attribute, or create and append
// one so a later call updates the same node instead of duplicating it.
function upsertHeadTag(
  tag: 'meta' | 'link',
  selectorAttr: string,
  selectorValue: string,
  valueAttr: string,
  value: string,
): void {
  const selector = `${tag}[${selectorAttr}="${selectorValue}"]`
  let node = document.head.querySelector<HTMLElement>(selector)
  if (!node) {
    node = document.createElement(tag)
    node.setAttribute(selectorAttr, selectorValue)
    document.head.appendChild(node)
  }
  node.setAttribute(valueAttr, value)
}

// Drop a tag we previously set, so navigating to a route that omits it doesn't
// leave a stale value pointing at the previous page.
function removeHeadTag(
  tag: 'meta' | 'link',
  selectorAttr: string,
  selectorValue: string,
): void {
  document.head
    .querySelector(`${tag}[${selectorAttr}="${selectorValue}"]`)
    ?.remove()
}

export function useSeoMeta({ title, description, canonical }: SeoMeta): void {
  useEffect(() => {
    // The SEO titles already lead with the brand for some pages; only append it
    // when it isn't there yet, so the tab never reads "… · Ma Garde Sereine ·
    // Ma Garde Sereine".
    const fullTitle = title.includes(APP_NAME)
      ? title
      : `${title} · ${APP_NAME}`
    document.title = fullTitle

    upsertHeadTag('meta', 'name', 'description', 'content', description)
    upsertHeadTag('meta', 'property', 'og:title', 'content', fullTitle)
    upsertHeadTag('meta', 'property', 'og:description', 'content', description)
    upsertHeadTag('meta', 'name', 'twitter:title', 'content', fullTitle)
    upsertHeadTag('meta', 'name', 'twitter:description', 'content', description)

    if (canonical) {
      // Open Graph and canonical want an absolute URL; resolve the route-
      // relative value against the production origin.
      const absolute = new URL(canonical, SITE_URL).toString()
      upsertHeadTag('meta', 'property', 'og:url', 'content', absolute)
      upsertHeadTag('link', 'rel', 'canonical', 'href', absolute)
    } else {
      removeHeadTag('meta', 'property', 'og:url')
      removeHeadTag('link', 'rel', 'canonical')
    }
  }, [title, description, canonical])
}
