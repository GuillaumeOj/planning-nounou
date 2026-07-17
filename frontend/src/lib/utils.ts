import { type ClassValue, clsx } from 'clsx'
import { enUS, fr } from 'date-fns/locale'
import { twMerge } from 'tailwind-merge'
import type { Language } from '@/src/i18n/translations'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// The date-fns locale for the app language, for format()/parse() calls.
export function localeFor(lang: Language) {
  return lang === 'fr' ? fr : enUS
}

// Money and hours arrive from DRF as exact decimal strings. Number() here is for
// display only — the figure is never computed with on this side, so the rounding
// a float would introduce cannot reach what a parent files. Anything unparseable
// is shown verbatim rather than as "NaN €".
export function formatMoney(amount: string, lang: Language) {
  const value = Number(amount)
  if (Number.isNaN(value)) return amount
  return new Intl.NumberFormat(lang, {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

// Hours keep two decimals: a quarter of an hour is 0.25, and pajemploi's own
// fields are decimal hours rather than h/min.
export function formatHours(hours: string, lang: Language) {
  const value = Number(hours)
  if (Number.isNaN(value)) return hours
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Leave is counted in half-days, so a balance reads best with at most one
// decimal: "12.5", not "12.50". Like the others, this is display-only — the exact
// figure is the backend's. A negative remaining (leave booked ahead of accrual)
// formats with its sign, which is the point of showing it.
export function formatDays(days: string, lang: Language) {
  const value = Number(days)
  if (Number.isNaN(value)) return days
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value)
}

// Shared styling for the app's native <select>s, matching the Input primitive.
// The 16px base font size is deliberate: iOS Safari zooms the viewport when a
// focused control's text is smaller, so only desktop drops to text-sm.
export const selectClass =
  'h-9 min-w-0 rounded-md border border-input bg-background px-2 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm'
