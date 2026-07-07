// The league thinks in Central Time (America/Chicago); the API speaks UTC.
// These helpers convert at the edge so admins type CT and players read CT,
// regardless of the browser's own timezone.

const CENTRAL = 'America/Chicago'

function centralParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** UTC ISO string → 'YYYY-MM-DDTHH:mm' Central wall time, for datetime-local inputs. */
export function utcToCentralLocal(iso: string): string {
  const p = centralParts(new Date(iso))
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`
}

/** 'YYYY-MM-DDTHH:mm' Central wall time → UTC ISO string. */
export function centralLocalToUtc(local: string): string {
  // Interpret the wall time as if it were UTC, then correct by however far
  // Chicago's rendering of that instant misses the target. Two passes settle
  // CST/CDT; times inside a DST transition land on the nearest valid instant.
  const target = new Date(`${local}:00Z`).getTime()
  let guess = new Date(target)
  for (let i = 0; i < 2; i++) {
    const seen = new Date(`${utcToCentralLocal(guess.toISOString())}:00Z`).getTime()
    if (seen === target) break
    guess = new Date(guess.getTime() + (target - seen))
  }
  return guess.toISOString()
}

/** UTC ISO string → human display in Central Time, e.g. 'Jul 8, 7:00 PM CT'. */
export function formatCentral(iso: string): string {
  const s = new Date(iso).toLocaleString('en-US', {
    timeZone: CENTRAL,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${s} CT`
}
