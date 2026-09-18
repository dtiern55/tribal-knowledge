import { QueryClient, useQuery } from '@tanstack/react-query'
import { activeSeason, api, onApiMutation } from './api'
import type { Season } from '../types'

/**
 * The app's query cache (#816).
 *
 * Pages are moving onto this one at a time; the ones still on plain
 * `api.get` keep the short cache inside `lib/api.ts`, which also sits under
 * this layer's fetches. Both hold for 30 seconds, so a query going stale is a
 * real request rather than one cache answering the other, and the older cache
 * goes when the last page moves.
 *
 * `staleTime` is the 30 seconds the hand-rolled cache in `lib/api.ts` used, for
 * the same reason: the one change this client can't see is the commissioner
 * scoring an episode. Refetching when the window regains focus is what the old
 * cache couldn't do, and it matters here — this is a phone PWA the league
 * checks *during* an episode, switching away and back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep an answer around long enough to make going back to a page
      // instant, even after its component unmounted.
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

/**
 * Every read goes through `api.get(path)`, so the path *is* the key. Nesting it
 * under 'api' gives one handle for "forget everything".
 */
export const apiKey = (path: string) => ['api', path] as const

/** The query for an API path. `null` means "not yet" — the id isn't known. */
export function pathQuery<T>(path: string | null) {
  return {
    queryKey: apiKey(path ?? ''),
    queryFn: () => api.get<T>(path as string),
    enabled: path != null,
  }
}

/**
 * The league-season every page operates on (#595). One cached read of
 * `/league-seasons` serves the whole app; which of them is "active" is a pure
 * function of that list plus the pinned choice, so it costs nothing to derive
 * per page rather than fetching again.
 */
export function useActiveSeason() {
  const query = useQuery(pathQuery<Season[]>('/league-seasons'))
  return {
    ...query,
    seasons: query.data,
    season: query.data ? activeSeason(query.data) : undefined,
  }
}

// Writes invalidate everything, the same blunt rule the hand-rolled cache used
// (#814): ~36 write sites against ~20 read paths, and one of them forgetting is
// a wrong roster on screen. Registered from here so `lib/api.ts` stays free of
// any import of this file.
onApiMutation(() => void queryClient.invalidateQueries())
