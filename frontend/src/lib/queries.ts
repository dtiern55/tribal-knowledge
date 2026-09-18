import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { activeSeason, api, ApiError, onApiMutation } from './api'
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
      // v5's default, named here because it is the behaviour this migration
      // is buying: the league checks the app mid-episode, switching away and
      // back.
      refetchOnWindowFocus: true,
      // Retry a server or network failure once; never a refusal. A 403 from
      // the Hub before an episode locks is an answer, not a flake, and
      // retrying it only delays the empty state by a second.
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status < 500),
    },
  },
})

/** The query for an API path. Every read goes through `api.get(path)`, so the
 *  path *is* the key. `null` means "not yet" — the id isn't known. */
export function pathQuery<T>(path: string | null) {
  return {
    queryKey: ['api', path ?? ''],
    queryFn: () => api.get<T>(path as string),
    enabled: path != null,
  }
}

/**
 * The league-season every page operates on (#595). One cached read of
 * `/league-seasons` serves the whole app; which of them is "active" is a pure
 * function of that list plus the pinned choice, so it costs nothing to derive
 * per page rather than fetching again.
 *
 * `enabled` is for the app shell, which renders before anyone is signed in and
 * must not ask for a league-season it has no token for.
 */
export function useActiveSeason(enabled = true) {
  const query = useQuery({ ...pathQuery<Season[]>('/league-seasons'), enabled })
  return { ...query, season: query.data ? activeSeason(query.data) : undefined }
}

// A write through `api.post` and friends invalidates everything, the same blunt
// rule the hand-rolled cache used (#814): one write site forgetting is a wrong
// roster on screen. `api.quiet.*` is the opt-out, for the writes below that say
// what they changed. Registered from here so `lib/api.ts` stays free of any
// import of this file.
onApiMutation(() => void queryClient.invalidateQueries())

/**
 * A write that names the API paths it changes (#816). Its `write` must use
 * `api.quiet.*`, or the backstop above fires first and this is just slower.
 *
 * The backstop is right for a season-wide change and wrong for a busy one: the
 * commissioner toggles eliminations and scoring events a dozen times an
 * evening, and each toggle would otherwise refetch every league, every cast and
 * every episode list on the console. What isn't named is still marked stale —
 * it just keeps what it has until something asks again.
 */
export function useApiMutation<TVars, TData>({
  write,
  invalidates,
  onSuccess,
}: {
  write: (vars: TVars) => Promise<TData>
  invalidates: string[]
  onSuccess?: (data: TData, vars: TVars) => void
}) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: write,
    // On the way out either way: a write that fails part-way — the elimination
    // retype is a DELETE then a POST — has still changed the server, and
    // leaving the old answer up would be the flick-back this exists to prevent.
    onSettled: async () => {
      void client.invalidateQueries({ refetchType: 'none' })
      // The named paths refetch now, cancelling anything already in the air so
      // a pre-write body can't land as fresh. Awaited, so the mutation stays
      // pending until the answer is on screen.
      await Promise.all(
        invalidates.map((path) => client.invalidateQueries({ queryKey: ['api', path] })),
      )
    },
    onSuccess,
  })
}
