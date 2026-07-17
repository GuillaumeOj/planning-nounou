// Filtering the planning records to the month the page is showing. Dates are the
// ISO "YYYY-MM-DD" strings the API sends, so lexicographic comparison is date
// comparison — no Date parsing, no timezone to get wrong.

import { format } from 'date-fns'

// A Date to the "YYYY-MM" the declaration and planning APIs scope by. The one
// spelling of the month param, shared by every page that navigates by month.
export function toMonthParam(month: Date): string {
  return format(month, 'yyyy-MM')
}

// The first and last ISO dates of a "YYYY-MM" month.
export function monthBounds(month: string): { first: string; last: string } {
  const [year, m] = month.split('-').map(Number)
  // Day 0 of the next month is the last day of this one; m is 1-based, and a JS
  // Date month is 0-based, so `new Date(year, m, 0)` lands on this month's last.
  const lastDay = new Date(year, m, 0).getDate()
  return {
    first: `${month}-01`,
    last: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

// Does the [start, end] range (ISO dates) touch the given "YYYY-MM" month? Used
// for a leave, which can run across a month boundary.
export function overlapsMonth(
  start: string,
  end: string,
  month: string,
): boolean {
  const { first, last } = monthBounds(month)
  return start <= last && end >= first
}

// Is a single ISO date inside the "YYYY-MM" month?
export function inMonth(date: string, month: string): boolean {
  return date.slice(0, 7) === month
}
