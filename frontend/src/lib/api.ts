import type { Season } from '../types'
import { supabase } from './supabase'

/** A non-2xx response; `status` lets callers tell "not found" from "not reachable". */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const res = await fetch(`${import.meta.env.VITE_API_URL as string}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      detail?: string | { msg?: string }[]
    }
    // FastAPI 422s send detail as an array of validation errors (#117)
    const message = Array.isArray(body.detail)
      ? body.detail.map((d) => d.msg ?? 'Invalid value').join('; ')
      : (body.detail ?? `HTTP ${res.status}`)
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// The shell, the drawer and the page all ask for the same things as they
// mount — /league-seasons went out four times a load, the roster three (#803).
// A GET already in the air is shared rather than sent again. Sharers get the
// same parsed body, so callers must treat a response as read-only.
const inFlight = new Map<string, Promise<unknown>>()

// ...and for a short while after it lands, the answer is kept, so stepping
// between pages doesn't re-ask for the cast, the episodes or a standings table
// that costs the server ~350ms to compute (#814). Short, because the one thing
// this client can't see is the commissioner scoring an episode: anything it
// does itself empties the cache below.
const CACHE_MS = 30_000
const cached = new Map<string, { at: number; body: unknown }>()

function sharedGet<T>(path: string): Promise<T> {
  const hit = cached.get(path)
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.body as T)
  const existing = inFlight.get(path)
  if (existing) return existing as Promise<T>
  const request = apiFetch<T>(path)
    .then((body) => {
      cached.set(path, { at: Date.now(), body })
      return body
    })
    .finally(() => inFlight.delete(path))
  inFlight.set(path, request)
  return request
}

/** Forget everything cached. Called on every write and when the session
 *  changes — one player's reads must never survive into another's. */
export function clearApiCache(): void {
  cached.clear()
}

// Any write empties the whole cache rather than reasoning about which paths a
// swap or a ballot touches. There are ~36 write sites and one of them forgetting
// to invalidate is a wrong roster on screen; a write is rare enough (a few per
// player per week) that over-clearing costs nothing worth keeping.
function mutate<T>(path: string, options: RequestInit): Promise<T> {
  return apiFetch<T>(path, options).finally(clearApiCache)
}

export const api = {
  get: <T>(path: string) => sharedGet<T>(path),
  post: <T>(path: string, body: unknown) =>
    mutate<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    mutate<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    mutate<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => mutate<T>(path, { method: 'DELETE' }),
}

// The Standings season pick sticks app-wide (issue: every page independently
// snapped back to the default season). Pinning the default clears instead, so
// nobody stays stuck on an old season once a new one goes live.
const SEASON_KEY = 'tk-league-season-id'

export function pinSeason(id: string, seasons: Season[]) {
  if (id === defaultSeason(seasons)?.id) localStorage.removeItem(SEASON_KEY)
  else localStorage.setItem(SEASON_KEY, id)
}

export function defaultSeason(seasons: Season[]): Season | null {
  // The first active league-season (/league-seasons is ordered by season
  // number, then league). Falls back to the most recently *created* one, not
  // the highest number: practice seasons are numbered 100+, so `at(-1)` sent
  // everyone to Practice Island V the moment the real season was completed.
  const newest = seasons.reduce<Season | null>(
    (best, s) => (best == null || s.created_at > best.created_at ? s : best),
    null,
  )
  return seasons.find((s) => s.status === 'active') ?? newest
}

/** The league-season every page operates on (#595): the pinned pick if it
 * still exists, else the active one, else the most recent. */
export async function getActiveSeason(): Promise<Season | null> {
  const seasons = await api.get<Season[]>('/league-seasons')
  const pinned = localStorage.getItem(SEASON_KEY)
  return seasons.find((s) => s.id === pinned) ?? defaultSeason(seasons)
}
