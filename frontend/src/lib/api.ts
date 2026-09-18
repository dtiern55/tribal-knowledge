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

// A GET already in the air is shared rather than sent again. Every page reads
// through the query cache now (#816), which holds answers and dedupes by key
// on its own — what is left here is the reads outside it (the profile, the
// admin proposals, a lazily-expanded breakdown) and the seam below, which the
// query cache can't provide: dropping a request a write has overtaken.
// Sharers get the same parsed body, so callers must treat a response as
// read-only.
const inFlight = new Map<string, Promise<unknown>>()

function sharedGet<T>(path: string): Promise<T> {
  const existing = inFlight.get(path)
  if (existing) return existing as Promise<T>
  const request = apiFetch<T>(path).finally(() => {
    // Only if this request is still the current one: a write between the ask
    // and the answer drops it, and the entry it dropped must stay dropped.
    if (inFlight.get(path) === request) inFlight.delete(path)
  })
  inFlight.set(path, request)
  return request
}

/** Forget anything still in the air. Called on every write and when the
 *  session changes — one player's reads must never survive into another's,
 *  and a refetch triggered by a write would otherwise be handed the answer to
 *  a question asked before it.
 *
 *  `notify` is false for a write that invalidates its own reads (#816): the
 *  query layer is left to the caller. */
export function clearApiCache(notify = true): void {
  inFlight.clear()
  if (notify) for (const listener of mutationListeners) listener()
}

const mutationListeners = new Set<() => void>()

/** Run something whenever this client writes, or the session changes. The
 *  query cache registers here rather than this file importing it (#816). */
export function onApiMutation(listener: () => void): void {
  mutationListeners.add(listener)
}

// A write marks every read stale rather than reasoning about which paths a
// swap or a ballot touches. One write site forgetting is a wrong roster on
// screen; `api.quiet.*` below is how a write that does name its paths opts
// out (#816).
function mutate<T>(path: string, options: RequestInit, notify = true): Promise<T> {
  return apiFetch<T>(path, options).finally(() => clearApiCache(notify))
}

function writes(notify: boolean) {
  return {
    post: <T>(path: string, body: unknown) =>
      mutate<T>(path, { method: 'POST', body: JSON.stringify(body) }, notify),
    put: <T>(path: string, body: unknown) =>
      mutate<T>(path, { method: 'PUT', body: JSON.stringify(body) }, notify),
    patch: <T>(path: string, body: unknown) =>
      mutate<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, notify),
    delete: <T>(path: string) => mutate<T>(path, { method: 'DELETE' }, notify),
  }
}

export const api = {
  get: <T>(path: string) => sharedGet<T>(path),
  ...writes(true),
  /** Writes that invalidate their own reads (#816): same call, same cache
   *  clear, without the "everything is stale" broadcast. Quietness belongs to
   *  the call rather than to a flag something else could be standing in. */
  quiet: writes(false),
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
 * still exists, else the active one, else the most recent. Pure, so a page
 * holding the list from a query picks the same season the fetch below does. */
export function activeSeason(seasons: Season[]): Season | null {
  const pinned = localStorage.getItem(SEASON_KEY)
  return seasons.find((s) => s.id === pinned) ?? defaultSeason(seasons)
}

export async function getActiveSeason(): Promise<Season | null> {
  return activeSeason(await api.get<Season[]>('/league-seasons'))
}
