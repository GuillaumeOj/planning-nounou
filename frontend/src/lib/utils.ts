import { type ClassValue, clsx } from 'clsx'
import { enUS, fr } from 'date-fns/locale'
import { twMerge } from 'tailwind-merge'
import type { Language } from '../i18n/translations'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// The date-fns locale for the app language, for format()/parse() calls.
export function localeFor(lang: Language) {
  return lang === 'fr' ? fr : enUS
}
