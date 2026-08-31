/**
 * Payout months.
 *
 * A pool belongs to the month its videos' 30-day windows CLOSED in, not the month they were
 * posted. That is where the carry-over comes from: a video posted on 20 January finishes
 * counting on 19 February and is paid in the February run.
 *
 * Everything here is UTC. A payout month that shifts with the reader's timezone would put
 * the same video in two different months depending on who asked.
 */

/** "2026-02" -> midnight UTC on 1 February 2026. */
export function monthStart(month: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (match === null) return null
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) return null
  return new Date(Date.UTC(year, monthIndex, 1))
}

/** The first instant of the following month, for a half-open [start, end) range. */
export function monthEnd(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
}

/** "2026-02" for a date, or for the month a pool row is keyed by. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function currentMonthKey(now = new Date()): string {
  return monthKey(now)
}

/** The month whose payouts are due now -- we pay at the end of the month for that month. */
export function previousMonthKey(now = new Date()): string {
  return monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
}

/**
 * The value to store in a `date` column for a payout month.
 *
 * A string, never a Date. node-postgres serialises a Date into a `date` column using the
 * server process's LOCAL timezone, so a Date at UTC midnight on the 1st is written as the
 * 31st of the previous month anywhere west of Greenwich -- silently filing every pool under
 * the wrong month. A plain "YYYY-MM-DD" has no timezone to get wrong.
 */
export function monthDateString(month: string): string {
  return `${month}-01`
}

/**
 * "YYYY-MM-DD" for a value read back out of a `date` column.
 *
 * The mirror of the problem above: node-postgres parses a `date` into a Date at LOCAL
 * midnight, so the UTC getters would read the previous day. Local getters recover exactly
 * the date Postgres holds.
 */
export function fromPgDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** "2026-08" from a stored month date, for display and for keying a payout run. */
export function monthKeyFromPgDate(value: Date | string): string {
  return fromPgDate(value).slice(0, 7)
}
