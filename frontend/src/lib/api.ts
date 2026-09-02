import type { Season } from '../types'
import { supabase } from './supabase'

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
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}

// The Standings season pick sticks app-wide (issue: every page independently
// snapped back to the default season). Pinning the default clears instead, so
// nobody stays stuck on an old season once a new one goes live.
const SEASON_KEY = 'tk-season-id'

export function pinSeason(id: string, seasons: Season[]) {
  if (id === defaultSeason(seasons)?.id) localStorage.removeItem(SEASON_KEY)
  else localStorage.setItem(SEASON_KEY, id)
}

export function defaultSeason(seasons: Season[]): Season | null {
  // The live active season wins; a practice season is only ever a deliberate
  // pin (#265 — players never receive practice seasons, admins see both).
  // Falls back to the most recently *created* season, not the highest number:
  // /seasons is ordered by season_number, and practice seasons are numbered
  // 100+, so `at(-1)` sent everyone to Practice Island V the moment the real
  // season was marked completed.
  const newest = seasons.reduce<Season | null>(
    (best, s) => (best == null || s.created_at > best.created_at ? s : best),
    null,
  )
  return (
    seasons.find((s) => s.status === 'active' && !s.practice) ??
    seasons.find((s) => s.status === 'active') ??
    newest
  )
}

/** The season every page operates on: the pinned Standings pick if it still
 * exists, else the active one, else the most recent. */
export async function getActiveSeason(): Promise<Season | null> {
  const seasons = await api.get<Season[]>('/seasons')
  const pinned = localStorage.getItem(SEASON_KEY)
  return seasons.find((s) => s.id === pinned) ?? defaultSeason(seasons)
}
