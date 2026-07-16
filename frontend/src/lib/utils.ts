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

// Shared styling for the app's native <select>s, matching the Input primitive.
// The 16px base font size is deliberate: iOS Safari zooms the viewport when a
// focused control's text is smaller, so only desktop drops to text-sm.
export const selectClass =
  'h-9 min-w-0 rounded-md border border-input bg-background px-2 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm'
