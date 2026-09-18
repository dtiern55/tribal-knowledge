import type { Session } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavigate, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { isBroadcastWindow, resolveMySeasonState } from '../lib/mySeasonState'
import type { Episode, EpisodeResult, Season } from '../types'
import { renderWithApp } from '../test/render'
import { MySeasonPage } from './MySeasonPage'

// Exposes the router's `recap` search param so tests can assert on it (#479),
// and a way to simulate the OS/browser Back gesture, which MemoryRouter has
// no imperative handle for otherwise.
function LocationProbe() {
  const [params] = useSearchParams()
  return <div data-testid="location-probe" data-recap={params.get('recap') ?? ''} />
}

function BackButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      simulate back
    </button>
  )
}

// A write that names what it changed goes through `api.quiet.*`, which skips
// the refetch-everything backstop (#816). Separate spies, so a write going
// loud is visible here: on this page that is the difference between the idol
// moving and the idol snapping back to the row it left (#487).
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    quiet: { post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  },
}))

const season = {
  id: 'season-1',
  season_id: 'season-1',
  league_id: 'league-1',
  league_name: 'Snakes and Rats',
  name: 'Survivor 51',
  status: 'active',
  roster_lock_episode: 2,
  free_swaps: 1,
  swap_penalty_step: -5,
  swap_penalty_floor: -25,
} as Season

function episode(number: number, status: string, lock: string): Episode {
  return {
    id: `episode-${number}`,
    season_id: season.id,
    episode_number: number,
    air_date: lock.slice(0, 10),
    max_elimination_picks: 3,
    is_finale: false,
    picks_lock_at: lock,
    status,
    created_at: lock,
    title: null,
  }
}

function result(overrides: Partial<EpisodeResult> = {}): EpisodeResult {
  return {
    episode_id: 'episode-2',
    episode_number: 2,
    title: null,
    headline: null,
    note: null,
    is_finale: false,
    eliminated: [
      { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, elimination_type: 'voted_out', is_final: true },
      { contestant_id: 'cast-2', name: 'Charlie', image_url: null, elimination_type: 'voted_out', is_final: true },
    ],
    redemption: [],
    ballot: [
      { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, prediction_type: 'elimination', correct: true, points: 15 },
      { contestant_id: 'cast-2', name: 'Charlie', image_url: null, prediction_type: 'elimination', correct: true, points: 15 },
      { contestant_id: 'cast-3', name: 'Venus', image_url: null, prediction_type: 'elimination', correct: false, points: 0 },
    ],
    roster: [
      {
        contestant_id: 'cast-4',
        name: 'Tiffany',
        image_url: null,
        points: 15,
        breakdown: [
          { event_type: 'win_individual_immunity', label: 'Win individual immunity', quantity: 1, points: 15 },
        ],
      },
    ],
    roster_points: 15,
    roster_adjustment_points: 0,
    ballot_points: 30,
    weekly_plays: [
      {
        advantage_play_id: 'play-1',
        advantage_type: 'double_vote_points',
        target_contestant_id: 'cast-1',
        target_name: 'Kenzie',
        bonus_points: 15,
      },
    ],
    weekly_play_bonus: 15,
    total_points: 60,
    current_rank: 2,
    prior_rank: 5,
    rank_delta: 3,
    ...overrides,
  }
}

/** The page reads which league-season it plays from /league-seasons (#816),
 *  so every test answers that first and its own routes after. */
function mockGet(leagueSeason: Season, routes: (path: string) => Promise<unknown>) {
  vi.mocked(api.get).mockImplementation(async (path: string) =>
    path === '/league-seasons' ? [leagueSeason] : routes(path),
  )
}

function arrange(
  episodes: Episode[],
  automaticResult?: EpisodeResult,
  replayResult?: EpisodeResult,
  leagueSeason: Season = season,
) {
  mockGet(leagueSeason, async (path: string) => {
    // Show routes live on /seasons; play routes on /league-seasons (#595).
    if (/^\/league-seasons\/[^/]+\/(contestants|episodes)$/.test(path)) throw new Error(`No such route: ${path}`)
    if (/^\/episodes\/[^/]+\/picks/.test(path)) throw new Error(`No such route: ${path}`)
    if (path.endsWith('/episodes')) return episodes
    if (path.endsWith('/reveal')) return automaticResult
    if (path.includes('/episode-results/')) return replayResult
    if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
    return []
  })
}

const auth = {
  session: { user: { id: 'user-1' }, access_token: 'test-token' } as Session,
}

/** Switch to a beat and return its panel. The record shows one at a time. */
async function openBeat(name: 'Tribe' | 'Ballot' | 'Advantage') {
  const re = new RegExp('^' + name)
  await userEvent.click(await screen.findByRole('tab', { name: re }))
  return screen.getByRole('tabpanel', { name: re })
}

/** Five castaways, Kenzie and Charlie on the roster, episode 3 open for picks
 *  with a three-name ballot. `state` is what the server holds; the mocks keep
 *  it the way the API would: naming a Power Vote writes its pick (#678),
 *  taking a play back drops that pick, a ballot save replaces the picks. */
function arrangePlayWorld(initial: {
  plays?: { id: string; episode_id: string; advantage_type: string; target_contestant_id: string }[]
  picks?: { id: string; episode_id: string; contestant_id: string }[]
  /** Week two: episode 2 open and the two-castaway tribe still editable. */
  preLock?: boolean
  /** Contestant id → the episode their Redemption Island stint began (#655). */
  island?: Record<string, number>
}) {
  const openNumber = initial.preLock ? 2 : 3
  const open = { ...episode(openNumber, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 3 }
  const state = {
    plays: initial.plays ?? [],
    picks: initial.picks ?? [],
    roster: [
      { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
      { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
    ],
  }
  mockGet(initial.preLock ? { ...season, roster_size: 2 } : season, async (path: string) => {
    if (path.endsWith('/episodes')) return [episode(openNumber - 1, 'scored', '2026-08-08T00:00:00Z'), open]
    if (path.endsWith('/contestants')) {
      return [
        { id: 'cast-1', name: 'Kenzie', tribe_name: 'Yanu' },
        { id: 'cast-2', name: 'Charlie', tribe_name: 'Siga' },
        { id: 'cast-3', name: 'Maria', tribe_name: 'Siga' },
        { id: 'cast-4', name: 'Tiffany', tribe_name: 'Yanu' },
        { id: 'cast-5', name: 'Venus', tribe_name: 'Siga' },
      ].map((c) => ({
        ...c,
        image_url: null,
        eliminated_in_episode: null,
        on_redemption_from_episode: initial.island?.[c.id] ?? null,
      }))
    }
    if (path.includes('/advantage-plays/')) return state.plays
    if (path.includes('/roster/')) return state.roster
    // The page reads every episode's ballot in one keyed request (#803); the
    // per-episode route still answers a single save.
    if (path.includes('/episodes/') && path.includes('/picks/')) return state.picks
    if (path.includes('/picks/')) {
      return state.picks.reduce<Record<string, typeof state.picks>>((byEpisode, pick) => {
        const list = byEpisode[pick.episode_id] ?? []
        byEpisode[pick.episode_id] = [...list, pick]
        return byEpisode
      }, {})
    }
    if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
    if (path.endsWith('/reveal')) return undefined
    return []
  })
  let playSeq = 10
  // The world answers the same way whichever set a write came through; the
  // spies stay separate so a test can say which one it was.
  const write = async (path: string, body: unknown) => {
    if (path.endsWith('/advantage-plays')) {
      const { advantage_type, target_contestant_id } = body as { advantage_type: string; target_contestant_id: string }
      const play = { id: `play-${++playSeq}`, episode_id: 'episode-3', advantage_type, target_contestant_id }
      state.plays = [play]
      if (advantage_type === 'double_vote_points' && !state.picks.some((p) => p.contestant_id === target_contestant_id)) {
        state.picks = [...state.picks, { id: `pick-${target_contestant_id}`, episode_id: 'episode-3', contestant_id: target_contestant_id }]
      }
      return play
    }
    if (path.endsWith('/roster')) {
      // roster.py drops a Double Castaway Points play on anyone who leaves.
      const { contestant_ids } = body as { contestant_ids: string[] }
      state.roster = contestant_ids.map((id, i) => ({
        id: `roster-${i}`, contestant_id: id, active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0,
      }))
      state.plays = state.plays.filter(
        (p) => p.advantage_type !== 'double_roster_points' || contestant_ids.includes(p.target_contestant_id),
      )
      return state.roster
    }
    const { contestant_ids, doubled_contestant_id } = body as { contestant_ids: string[]; doubled_contestant_id: string | null }
    // Ranks follow the order sent; the Power Vote's name takes none (#694).
    let rung = 0
    state.picks = contestant_ids.map((id, i) => ({
      id: `pick-${i}`,
      episode_id: 'episode-3',
      contestant_id: id,
      rank: id === doubled_contestant_id ? null : ++rung,
    }))
    // The save moves an existing Power Vote to the doubled name (#682).
    if (doubled_contestant_id && state.plays[0]?.advantage_type === 'double_vote_points') {
      state.plays = [{ ...state.plays[0], target_contestant_id: doubled_contestant_id }]
    }
    return { picks: state.picks, play: state.plays[0] ?? null }
  }
  const remove = async () => {
    const gone = state.plays[0]
    state.plays = []
    if (gone?.advantage_type === 'double_vote_points') {
      // The name drops to the top rung; the ladder shifts down and trims to
      // the limit (#694).
      const top = state.picks.filter((p) => p.contestant_id === gone.target_contestant_id)
      const rest = state.picks.filter((p) => p.contestant_id !== gone.target_contestant_id)
      state.picks = [...top, ...rest].slice(0, 3).map((p, i) => ({ ...p, rank: i + 1 }))
    }
  }
  vi.mocked(api.post).mockImplementation(write)
  vi.mocked(api.quiet.post).mockImplementation(write)
  vi.mocked(api.delete).mockImplementation(remove)
  vi.mocked(api.quiet.delete).mockImplementation(remove)
  return state
}

/** jsdom does no layout: point the drop hit-test at `target` and drag `handle` there. */
function dragTo(handle: Element, target: Element) {
  document.elementFromPoint = () => target
  fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
  fireEvent(window, new MouseEvent('pointermove', { clientX: 60, clientY: 200 }))
  fireEvent(window, new MouseEvent('pointerup', { clientX: 60, clientY: 200 }))
}

describe('MySeasonPage state shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('waits for the roster and ballot before the hero claims anything', async () => {
    // The hero's colour and headline are computed from the roster and this
    // episode's picks, which load after the main fetch. Until they land an
    // empty roster looks identical to an unset one, so the page used to open
    // on an owed week and correct itself — a lie, briefly, every visit.
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2036-01-01T00:00:00Z'),
    ]
    let releaseRoster: (value: unknown) => void = () => {}
    const rosterPending = new Promise((resolve) => {
      releaseRoster = resolve
    })

    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.includes('/roster/')) return rosterPending
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    // The main fetch has resolved, but the roster has not — and nothing about
    // the week is on screen yet.
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByText(/need you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ballot is empty/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /this week/i })).not.toBeInTheDocument()

    releaseRoster([
      { id: 'r1', contestant_id: 'c1', active_until_episode: null },
    ])

    // And when it does appear it appears once, already correct.
    const hero = await screen.findByRole('region', { name: /this week/i })
    expect(within(hero).queryByText(/tribe both need you/i)).not.toBeInTheDocument()
  })

  it('renders a locked composition without mounting editable Open controls', async () => {
    arrange([
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ])
    renderWithApp(<MySeasonPage />, { auth })

    // The episode is named once, at page level, above the cards (#732) — it
    // paints before the locked card's own load resolves, so the card's
    // heading is what this waits on.
    expect(await screen.findByRole('heading', { name: 'Results are pending' })).toBeVisible()
    expect(screen.getByText('Ep 2 · locked')).toBeVisible()
    expect(screen.getByText('No ballot was submitted.')).toBeVisible()
    // #451: the redundant standalone Advantage section is dropped while locked.
    expect(screen.queryByRole('heading', { name: 'Advantage' })).not.toBeInTheDocument()
    // No "awaiting scoring" footer: the lock itself says results are pending (#685).
    expect(screen.queryByText(/awaiting league scoring/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/episode is over/i)).not.toBeInTheDocument()
    const lockedState = screen.getByRole('region', { name: 'Results are pending' })
    expect(lockedState).toHaveAttribute('data-variant', 'delayed')
    expect(lockedState.querySelector('[class*="lg:grid-cols"]')).not.toBeInTheDocument()
    expect(screen.queryByText('Read only')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Roster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Episode Ballots' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit|Save ballot|Use on ballot|Confirm Swap/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Episode History/ })).not.toBeInTheDocument()
  })

  it('gives watch-only composition precedence over a later open episode', async () => {
    arrange([
      episode(1, 'upcoming', '2026-08-20T00:00:00Z'),
      episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
    ])
    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Ep 1 · watch only')).toBeVisible()
    expect(screen.getByText('No action needed for the premiere')).toBeVisible()
    // The tribe can be drafted during the premiere; ballots still wait.
    expect(await screen.findByRole('button', { name: 'Lock In Tribe' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Episode Ballots' })).not.toBeInTheDocument()
  })

  it('does not offer the weekly advantage during the watch-only premiere', async () => {
    // Season 51 shape: roster locks at episode 2, so episode 1 is watch-only.
    // The tribe is draftable then, but RosterSection renders in both states
    // and its useWeeklyPlay resolves to episode 2 — the one surface that used
    // to leak the "double point boost" play into the premiere (regression).
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'upcoming', '2099-08-20T00:00:00Z'),
          episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [{ id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null }]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Ep 1 · watch only')).toBeVisible()
    const roster = await screen.findByRole('tabpanel', { name: /^Tribe/ })
    expect(within(roster).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()
    expect(within(roster).queryByText(/double point boost/i)).not.toBeInTheDocument()
  })

  it('shows what each rostered castaway earned you, without a bio link', async () => {
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      // 30 rather than the raw 15 — the breakdown folds a Double Roster
      // Points play in, which is the whole point of showing it here.
      if (path.includes('/scoring-breakdown/')) {
        return { roster: [{ contestant_id: 'cast-1', points: 30 }], picks: [] }
      }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const roster = await screen.findByRole('tabpanel', { name: /^Tribe/ })
    const card = (await within(roster).findByText(/\+30/)).closest('li')!
    expect(within(card).getByText('Kenzie')).toBeVisible()
    // The bio moved to the Cast page (#406 review) — the roster row expands
    // your own scoring instead of linking out.
    expect(within(roster).queryByRole('link', { name: /Kenzie/ })).not.toBeInTheDocument()
  })

  it('renders the Open state as Roster and Ballot beats beside the Advantage idol', async () => {
    arrange([
      episode(1, 'scored', '2026-08-20T00:00:00Z'),
      episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
    ])
    renderWithApp(<MySeasonPage />, { auth })

    // Two beats now (#399) — the advantage idol rides the beat bar's chrome.
    const tabs = await screen.findAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveTextContent(/^Tribe/)
    expect(tabs[1]).toHaveTextContent(/^Ballot/)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    // The unplayed advantage rides the bar as state: it says where to play it.
    expect(screen.getByText('One per episode, played on your Tribe or Ballot')).toBeVisible()
    expect(screen.queryByRole('button', { name: /advantage/i })).not.toBeInTheDocument()
    // Unplayed, the lane links the rule.
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/rules#weekly-play')
    expect(screen.getByRole('tabpanel', { name: /^Tribe/ })).toBeVisible()
    // The other two stay mounted (so an unsaved ballot survives) but hidden.
    expect(screen.queryByRole('tabpanel', { name: /^Ballot/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Episode decisions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ballot rules' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Past Episodes' })).not.toBeInTheDocument()
    expect(screen.queryByText('This Week')).not.toBeInTheDocument()
  })

  it('supports a variable ballot limit, tribe grouping, selection, save, and edit', async () => {
    const user = userEvent.setup()
    const open = { ...episode(2, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 2 }
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(1, 'scored', '2026-08-01T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: '/kenzie.jpg', tribe_color: '#7651a1', tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: '/charlie.jpg', tribe_color: '#4ca56a', tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_color: '#f28b39', tribe_name: 'Nami', eliminated_in_episode: null },
          ...Array.from({ length: 15 }, (_, index) => ({
            id: `cast-extra-${index}`,
            name: `Castaway ${index + 4}`,
            image_url: null,
            tribe_color: ['#7651a1', '#4ca56a', '#f28b39'][index % 3],
            tribe_name: ['Yanu', 'Siga', 'Nami'][index % 3],
            eliminated_in_episode: null,
          })),
          { id: 'cast-out', name: 'Earlier Boot', image_url: null, tribe_color: '#7651a1', tribe_name: 'Yanu', eliminated_in_episode: 1 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })
    vi.mocked(api.post).mockResolvedValue({
      picks: [
        { id: 'pick-1', contestant_id: 'cast-1' },
        { id: 'pick-2', contestant_id: 'cast-2' },
      ],
      play: null,
    })

    renderWithApp(<MySeasonPage />, { auth })

    const ballot = await openBeat('Ballot')
    expect(within(ballot).getByRole('heading', { name: 'Yanu' })).toBeVisible()
    expect(within(ballot).getByRole('heading', { name: 'Siga' })).toBeVisible()
    expect(within(ballot).getByRole('heading', { name: 'Nami' })).toBeVisible()
    expect(within(ballot).queryByText('Earlier Boot')).not.toBeInTheDocument()
    expect(within(ballot).getByText('0 of 2')).toBeInTheDocument()
    expect(within(ballot).getByRole('button', { name: /Save ballot/ })).toBeDisabled()

    expect(within(ballot).getAllByRole('button', { name: /^Vote for/ })).toHaveLength(18)
    const kenzie = within(ballot).getByRole('button', { name: 'Vote for Kenzie' })
    const charlie = within(ballot).getByRole('button', { name: 'Vote for Charlie' })
    await user.click(kenzie)
    await user.click(charlie)
    // Selection is a tick, not a rank — votes are unordered and equally weighted
    expect(kenzie).toHaveAttribute('aria-pressed', 'true')
    expect(charlie).toHaveAttribute('aria-pressed', 'true')
    expect(within(ballot).getByText('2 of 2')).toBeInTheDocument()
    expect(within(ballot).getByRole('button', { name: 'Vote for Venus' })).toBeDisabled()

    // The room is lit while the ballot is being written, and back to ordinary
    // light once it is submitted and tidy (#694 review).
    expect(document.documentElement).toHaveClass('ballot-room')
    await user.click(within(ballot).getByRole('button', { name: /Save ballot/ }))
    expect(await within(ballot).findByText('Submitted')).toBeVisible()
    await waitFor(() => expect(document.documentElement).not.toHaveClass('ballot-room'))
    // The record is the roster's own manifest: portrait, name, rung (#694).
    const record = within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })
    const row = within(record).getByText('Kenzie').closest('li') as HTMLElement
    expect(row.querySelector('.contestant-avatar')).not.toBeNull()
    expect(row).toHaveTextContent('Top pick')
    expect(api.post).toHaveBeenCalledWith('/league-seasons/season-1/episodes/episode-2/picks', {
      contestant_ids: ['cast-1', 'cast-2'],
      doubled_contestant_id: null,
    })

    // Reopened with nothing changed, the button is Done: it closes the sheet
    // rather than sitting disabled (#694 review).
    await user.click(within(ballot).getByRole('button', { name: 'Edit ballot' }))
    expect(within(ballot).getByText('2 of 2')).toBeInTheDocument()
    await user.click(within(ballot).getByRole('button', { name: 'Done' }))
    expect(await within(ballot).findByText('Submitted')).toBeVisible()
  })

  it('keeps Redemption Island residents off the ballot from the week after the vote (#726)', async () => {
    // Episode 3 is open. Maria has been on the island since episode 2, so she
    // can't be voted off a tribe this week. Venus was sent there by episode
    // 3's own vote — a ballot naming her that week is a correct prediction,
    // and submit_picks accepts it, so the grid has to offer her.
    arrangePlayWorld({ island: { 'cast-3': 2, 'cast-5': 3 } })
    renderWithApp(<MySeasonPage />, { auth })
    const ballot = await openBeat('Ballot')

    expect(within(ballot).queryByRole('button', { name: 'Vote for Maria' })).not.toBeInTheDocument()
    expect(within(ballot).getByRole('button', { name: 'Vote for Venus' })).toBeEnabled()
  })

  it('lights the room on the Ballot beat and puts it out on the way off the page', async () => {
    // The room light is DOM side effects on <html>, so nothing else would
    // catch it breaking. Covers the two exits that behave differently: leaving
    // the beat, and leaving the page.
    arrange([
      episode(1, 'scored', '2026-08-20T00:00:00Z'),
      episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
    ])
    const { unmount } = renderWithApp(<MySeasonPage />, { auth })

    await openBeat('Ballot')
    expect(document.documentElement).toHaveClass('ballot-room')

    // Leaving the beat puts it out; the lane is still in front of you, so this
    // is the slow lift and nothing marks it as leaving the page.
    await openBeat('Tribe')
    expect(document.documentElement).not.toHaveClass('ballot-room')
    expect(document.documentElement).not.toHaveClass('ballot-room--leaving')

    await openBeat('Ballot')
    expect(document.documentElement).toHaveClass('ballot-room')

    // Leaving the page holds the dark and flags the fast lift.
    unmount()
    expect(document.documentElement).toHaveClass('ballot-room')
    expect(document.documentElement).toHaveClass('ballot-room--leaving')

    await waitFor(() =>
      expect(document.documentElement).not.toHaveClass('ballot-room'),
    )
  })

  it('leaves the room light alone when you were never on the Ballot beat', async () => {
    arrange([
      episode(1, 'scored', '2026-08-20T00:00:00Z'),
      episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
    ])
    const { unmount } = renderWithApp(<MySeasonPage />, { auth })
    await screen.findAllByRole('tab')

    unmount()
    // Nothing to put away, so nothing is stranded on <html>.
    expect(document.documentElement).not.toHaveClass('ballot-room')
    expect(document.documentElement).not.toHaveClass('ballot-room--leaving')
  })

  it('offers the advantage on each tab, with swaps living on the roster', async () => {
    mockGet({ ...season, free_swaps: 1, swap_lock_episode: 10 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    // The hero's Advantage lane is state only: no menu, no button.
    expect(await screen.findByText('One per episode, played on your Tribe or Ballot')).toBeVisible()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // Tribe: the strip says what the advantage becomes here and starts the
    // pick. Designating lights the rows; Cancel puts the offer back.
    const roster = await openBeat('Tribe')
    expect(await screen.findByRole('button', { name: /^Swap ·/ })).toHaveTextContent('free')
    const tribeStrip = within(roster).getByRole('region', { name: 'Advantage' })
    expect(within(tribeStrip).getByText(/double point boost/)).toBeVisible()
    await userEvent.click(within(tribeStrip).getByRole('button', { name: 'Play it here' }))
    expect(within(tribeStrip).getByText(/Tap a Survivor/)).toBeVisible()
    expect(within(roster).getByRole('button', { name: /Kenzie/ })).toBeVisible()
    await userEvent.click(within(tribeStrip).getByRole('button', { name: 'Cancel' }))
    expect(within(tribeStrip).getByRole('button', { name: 'Play it here' })).toBeVisible()

    // Ballot: the same strip, in Power Vote terms.
    const ballot = await openBeat('Ballot')
    const ballotStrip = within(ballot).getByRole('region', { name: 'Advantage' })
    expect(within(ballotStrip).getByText(/Power Vote/)).toBeVisible()
    expect(within(ballotStrip).getByRole('button', { name: 'Play it here' })).toBeVisible()
  })

  it('marks the doubled roster card, and the strip and hero report it', async () => {
    arrangePlayWorld({
      plays: [{ id: 'play-1', episode_id: 'episode-3', advantage_type: 'double_roster_points', target_contestant_id: 'cast-1' }],
    })
    renderWithApp(<MySeasonPage />, { auth })

    // The Tribe tab wears the idol; the row says it in words (#694).
    const rosterTab = await screen.findByRole('tab', { name: /^Tribe/ })
    expect(await within(rosterTab).findByRole('img', { name: 'Advantage played here' })).toBeInTheDocument()
    expect(within(screen.getByRole('tab', { name: /^Ballot/ })).queryByRole('img', { name: 'Advantage played here' })).not.toBeInTheDocument()
    expect(screen.getByText('Tribe · Kenzie · double points')).toBeVisible()
    // Played, the strip is gone: the row says ×2 this week, and the hero
    // holds Undo. No idol inside the tab.
    const roster = await openBeat('Tribe')
    expect(within(roster).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()
    expect(within(roster).getByText(/×2 this week/)).toBeVisible()
    expect(within(roster).queryByRole('img', { name: /Double Castaway Points/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible()
  })

  it('drops the play with a doubled castaway edited off the tribe pre-lock, from the footer Edit', async () => {
    arrangePlayWorld({
      preLock: true,
      plays: [{ id: 'play-1', episode_id: 'episode-2', advantage_type: 'double_roster_points', target_contestant_id: 'cast-1' }],
    })
    renderWithApp(<MySeasonPage />, { auth })
    expect(await screen.findByText('Tribe · Kenzie · double points')).toBeVisible()
    const roster = await openBeat('Tribe')

    // Edit sits in the lane's footer with the lock date, not on the toolbar.
    const edit = within(roster).getByRole('button', { name: /locks when episode 2 starts.*Edit tribe/ })
    await userEvent.click(edit)
    // The picker has no rows to play on, so the gold card leaves with them.
    expect(within(roster).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()
    await userEvent.click(within(roster).getByRole('button', { name: /Kenzie/ }))
    await userEvent.click(within(roster).getByRole('button', { name: /Maria/ }))
    await userEvent.click(within(roster).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/league-seasons/season-1/roster', { contestant_ids: ['cast-2', 'cast-3'] }),
    )

    // The server deleted the play with Kenzie; the hero learns that without a
    // reload, so there is no stale Undo to 404 on ("Advantage not found").
    expect(await screen.findByText('One per episode, played on your Tribe or Ballot')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(within(roster).getByRole('region', { name: 'Advantage' })).toBeVisible()
  })

  it('plays the advantage on the Tribe tab by tap, and the tab wears the idol until Undo', async () => {
    arrangePlayWorld({})
    renderWithApp(<MySeasonPage />, { auth })
    const roster = await openBeat('Tribe')
    const strip = within(roster).getByRole('region', { name: 'Advantage' })

    // Tap path: Play it here, then a row.
    await userEvent.click(within(strip).getByRole('button', { name: 'Play it here' }))
    expect(within(strip).getByText(/Tap a Survivor/)).toBeVisible()
    await userEvent.click(within(roster).getByRole('button', { name: /Kenzie/ }))
    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/league-seasons/season-1/advantage-plays', {
        advantage_type: 'double_roster_points',
        target_contestant_id: 'cast-1',
      }),
    )
    expect(await screen.findByText('Tribe · Kenzie · double points')).toBeVisible()
    // The idol is on the tab, not the row; the row says it in words.
    expect(within(screen.getByRole('tab', { name: /^Tribe/ })).getByRole('img', { name: 'Advantage played here' })).toBeInTheDocument()
    expect(within(roster).queryByRole('img', { name: /Double Castaway Points/ })).not.toBeInTheDocument()

    // Undo lives in the hero; the strip comes back with the offer.
    expect(within(roster).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.quiet.delete).toHaveBeenCalled())
    expect(await screen.findByText('One per episode, played on your Tribe or Ballot')).toBeVisible()
    expect(
      within(await within(roster).findByRole('region', { name: 'Advantage' })).getByRole('button', {
        name: 'Play it here',
      }),
    ).toBeVisible()
    expect(within(screen.getByRole('tab', { name: /^Tribe/ })).queryByRole('img', { name: 'Advantage played here' })).not.toBeInTheDocument()
  })

  it('plays the advantage on the Ballot tab as a Power Vote, by tap and by drag (#673)', async () => {
    arrangePlayWorld({
      picks: [{ id: 'pick-1', episode_id: 'episode-3', contestant_id: 'cast-1' }],
    })
    renderWithApp(<MySeasonPage />, { auth })
    const ballot = await openBeat('Ballot')
    const strip = within(ballot).getByRole('region', { name: 'Advantage' })

    // Play it here opens the grid with an idol slot on every name. Tapping
    // Charlie's saves the play at once.
    await userEvent.click(within(strip).getByRole('button', { name: 'Play it here' }))
    expect(within(strip).getByText(/Cast your votes/)).toBeVisible()
    await userEvent.click(within(ballot).getByRole('button', { name: 'Make Charlie your Power Vote' }))
    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/league-seasons/season-1/advantage-plays', {
        advantage_type: 'double_vote_points',
        target_contestant_id: 'cast-2',
      }),
    )
    expect(await screen.findByText('Ballot · Charlie · Power Vote')).toBeVisible()
    expect(within(ballot).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()
    // The gold card holds the idol; the count is the regular names only.
    expect(within(ballot).getByRole('button', { name: 'Remove Power Vote from Charlie' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: /^Ballot/ })).toHaveTextContent('1 of 3')

    // Voting is unchanged around it, and the save carries the Power Vote's
    // name so the server keeps it.
    await userEvent.click(within(ballot).getByRole('button', { name: 'Vote for Maria' }))
    expect(within(ballot).getByText('2 of 3')).toBeInTheDocument()
    await userEvent.click(within(ballot).getByRole('button', { name: 'Save ballot' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/league-seasons/season-1/episodes/episode-3/picks', {
        contestant_ids: ['cast-1', 'cast-3', 'cast-2'],
        doubled_contestant_id: 'cast-2',
      }),
    )
    // The record: the Power Vote's gold row first, then the rungs, and the
    // Ballot tab wears the idol.
    expect(await within(ballot).findByText('Submitted')).toBeVisible()
    const record = within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })
    expect(within(record).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Charlie'),
      expect.stringContaining('Kenzie'),
      expect.stringContaining('Maria'),
      expect.stringContaining('Open'),
    ])
    expect(within(record).getAllByRole('listitem')[0]).toHaveTextContent('Power Vote')
    expect(within(screen.getByRole('tab', { name: /^Ballot/ })).getByRole('img', { name: 'Advantage played here' })).toBeInTheDocument()

    // Moving the Power Vote while editing: drag Maria's slip up into the gold
    // rung. One picks request moves the play; Charlie takes Maria's old rung.
    await userEvent.click(within(ballot).getByRole('button', { name: 'Edit ballot' }))
    const ladder = within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })
    const goldRung = within(ladder).getAllByRole('listitem')[0]
    dragTo(within(ladder).getByText('Maria'), goldRung)
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/league-seasons/season-1/episodes/episode-3/picks', {
        contestant_ids: ['cast-1', 'cast-2', 'cast-3'],
        doubled_contestant_id: 'cast-3',
      }),
    )
    expect(await screen.findByText('Ballot · Maria · Power Vote')).toBeVisible()
    expect(api.quiet.delete).not.toHaveBeenCalled()
  })

  it('ranks the ballot in ladder order, reorders with the arrows, and a slip dragged into the gold rung is the Power Vote (#694)', async () => {
    arrangePlayWorld({})
    renderWithApp(<MySeasonPage />, { auth })
    const ballot = await openBeat('Ballot')

    // Names land on the next rung in the order tapped; the card says which.
    await userEvent.click(within(ballot).getByRole('button', { name: 'Vote for Kenzie' }))
    await userEvent.click(within(ballot).getByRole('button', { name: 'Vote for Charlie' }))
    const ladder = within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })
    expect(within(ladder).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Kenzie'),
      expect.stringContaining('Charlie'),
      expect.stringContaining('Tap a name below.'),
    ])
    expect(within(ballot).getByRole('button', { name: 'Remove vote for Kenzie' })).toHaveTextContent('Top pick')

    // The arrows reorder; the save carries the order as the ranks.
    await userEvent.click(within(ladder).getByRole('button', { name: 'Move Charlie up' }))
    expect(within(ladder).getAllByRole('listitem')[0]).toHaveTextContent('Charlie')
    await userEvent.click(within(ballot).getByRole('button', { name: 'Save ballot' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/league-seasons/season-1/episodes/episode-3/picks', {
        contestant_ids: ['cast-2', 'cast-1'],
        doubled_contestant_id: null,
      }),
    )
    expect(await within(ballot).findByText('Submitted')).toBeVisible()
    // The submitted ballot reads top to bottom in ladder order, rung named,
    // with an open line for the rung not yet filled.
    const submitted = within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })
    expect(within(submitted).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Charlie.*Top pick/),
      expect.stringMatching(/Kenzie.*2nd/),
      expect.stringMatching(/Open.*3rd/),
    ])

    // Play it here opens the gold rung; a slip dragged into it is the Power
    // Vote, and its old rung closes up.
    await userEvent.click(within(ballot).getByRole('button', { name: 'Play it here' }))
    const goldRung = ballot.querySelector('[data-drop-id="rung:pv"]') as Element
    const kenzieSlip = within(within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })).getByText('Kenzie')
    dragTo(kenzieSlip, goldRung)
    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenLastCalledWith('/league-seasons/season-1/advantage-plays', {
        advantage_type: 'double_vote_points',
        target_contestant_id: 'cast-1',
      }),
    )
    expect(await screen.findByText('Ballot · Kenzie · Power Vote')).toBeVisible()
    expect(within(ballot).getByRole('button', { name: 'Remove Power Vote from Kenzie' })).toBeEnabled()
    expect(within(ballot).getByRole('button', { name: 'Remove vote for Charlie' })).toHaveTextContent('Top pick')

    // The gold rung has the same arrows: down swaps the Power Vote with 1st,
    // in one picks request that saves the ladder as shown.
    const rungs = within(ballot).getByRole('list', { name: 'Your ballot, surest on top' })
    await userEvent.click(within(rungs).getByRole('button', { name: 'Move Kenzie down' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/league-seasons/season-1/episodes/episode-3/picks', {
        contestant_ids: ['cast-1', 'cast-2'],
        doubled_contestant_id: 'cast-2',
      }),
    )
    expect(await screen.findByText('Ballot · Charlie · Power Vote')).toBeVisible()
    expect(within(rungs).getAllByRole('listitem')[1]).toHaveTextContent('Kenzie')
    // And 1st's up arrow climbs back into it.
    await userEvent.click(within(rungs).getByRole('button', { name: 'Move Kenzie up' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/league-seasons/season-1/episodes/episode-3/picks', {
        contestant_ids: ['cast-2', 'cast-1'],
        doubled_contestant_id: 'cast-1',
      }),
    )
    expect(await screen.findByText('Ballot · Kenzie · Power Vote')).toBeVisible()
  })

  it('takes a Power Vote that was a regular vote off the ballot in the same paint, and back again on Undo', async () => {
    arrangePlayWorld({
      picks: [
        { id: 'pick-1', episode_id: 'episode-3', contestant_id: 'cast-1' },
        { id: 'pick-2', episode_id: 'episode-3', contestant_id: 'cast-2' },
      ],
    })
    renderWithApp(<MySeasonPage />, { auth })
    const ballot = await openBeat('Ballot')
    const ballotTab = screen.getByRole('tab', { name: /^Ballot/ })
    expect(await within(ballot).findByText('Submitted')).toBeVisible()
    expect(ballotTab).toHaveTextContent('2 of 3')

    // Naming a regular vote as the Power Vote moves it off the ballot at once,
    // not a beat later when the re-read lands.
    await userEvent.click(within(ballot).getByRole('button', { name: 'Play it here' }))
    await userEvent.click(within(ballot).getByRole('button', { name: 'Make Kenzie your Power Vote' }))
    expect(within(ballot).getByText('1 of 3')).toBeInTheDocument()
    expect(within(ballot).getByRole('button', { name: 'Remove Power Vote from Kenzie' })).toBeInTheDocument()
    await waitFor(() => expect(ballotTab).toHaveTextContent('1 of 3'))
    expect(await screen.findByText('Ballot · Kenzie · Power Vote')).toBeVisible()

    // The gold card taps off like any vote, and the name drops to the top
    // rung: Kenzie leads again.
    await userEvent.click(within(ballot).getByRole('button', { name: 'Remove Power Vote from Kenzie' }))
    await waitFor(() => expect(api.quiet.delete).toHaveBeenCalled())
    expect(await screen.findByText('One per episode, played on your Tribe or Ballot')).toBeVisible()
    await waitFor(() => expect(ballotTab).toHaveTextContent('2 of 3'))
    expect(within(ballot).getByRole('button', { name: 'Remove vote for Kenzie' })).toHaveTextContent('Top pick')
    expect(within(ballot).getByRole('button', { name: 'Play it here' })).toBeVisible()
  })

  it('takes the offer off both tabs once the advantage is played, until Undo', async () => {
    arrangePlayWorld({
      plays: [{ id: 'play-1', episode_id: 'episode-3', advantage_type: 'double_vote_points', target_contestant_id: 'cast-3' }],
      picks: [{ id: 'pick-3', episode_id: 'episode-3', contestant_id: 'cast-3' }],
    })
    renderWithApp(<MySeasonPage />, { auth })
    expect(await screen.findByText('Ballot · Maria · Power Vote')).toBeVisible()
    const roster = await openBeat('Tribe')
    expect(within(roster).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()

    // Undo in the hero frees it; the Tribe strip offers again and plays.
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.quiet.delete).toHaveBeenCalledWith('/advantage-plays/play-1'))
    const strip = await within(roster).findByRole('region', { name: 'Advantage' })
    await userEvent.click(within(strip).getByRole('button', { name: 'Play it here' }))
    await userEvent.click(within(roster).getByRole('button', { name: /Kenzie/ }))
    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/league-seasons/season-1/advantage-plays', {
        advantage_type: 'double_roster_points',
        target_contestant_id: 'cast-1',
      }),
    )
    expect(await screen.findByText('Tribe · Kenzie · double points')).toBeVisible()
    // Both halves went through the quiet set. Loud, the backstop would fire
    // mid-move — between the delete and the post of a play that is moving —
    // refetch the plays with the old one already gone, and snap the idol back
    // to the row it just left (#487).
    expect(api.delete).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    // The Power Vote's name dropped to the top rung when the play left.
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Ballot/ })).toHaveTextContent('1 of 3'))
    const ballot = await openBeat('Ballot')
    expect(within(ballot).queryByRole('region', { name: 'Advantage' })).not.toBeInTheDocument()
  })

  it('starts a swap from the roster, prices it, holds the picker open until the new tribe is on screen, and re-reads only what it changed', async () => {
    // The roster read the swap triggers, held open by the test so the order
    // of what the player sees is observable rather than a race.
    let holdRoster: { promise: Promise<unknown>; release: () => void } | null = null
    const savedRoster = [
      // One swap already made, back in episode 3 — so this is the 2nd of the
      // season (−10) and the one-per-episode rule does not block episode 4.
      { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: 2, swap_penalty_points: 0 },
      { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 3, active_until_episode: null, swap_penalty_points: 0 },
    ]
    mockGet({ ...season, free_swaps: 1, swap_lock_episode: 10 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'scored', '2026-08-15T00:00:00Z'),
          episode(4, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) return holdRoster ? holdRoster.promise : savedRoster
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    // The swap starts on the roster now, and the header carries its price.
    const rosterSection = await openBeat('Tribe')
    const swap = await screen.findByRole('button', { name: /^Swap ·/ })
    expect(swap).toHaveTextContent('-10')

    await userEvent.click(swap)
    expect(screen.getByText('Choose a castaway to drop')).toBeVisible()
    await userEvent.click(within(rosterSection).getByRole('button', { name: /Charlie/ }))
    expect(screen.getByText('Choose who replaces Charlie')).toBeVisible()
    // The cost is stated again at the moment of choosing, not just in the header.
    expect(screen.getByText('costs -10 points')).toBeVisible()
    expect(screen.getByText(/you can undo it until picks lock/)).toBeVisible()
    // `clearAllMocks` keeps implementations, so without this the swap POST is
    // still answered by the last test's world — which threw on it, and the
    // assertion below would have been happy with a write that failed.
    vi.mocked(api.quiet.post).mockResolvedValue({})
    vi.mocked(api.get).mockClear()
    let release: () => void = () => {}
    holdRoster = {
      promise: new Promise((resolve) => {
        release = () => resolve([{ ...savedRoster[1], contestant_id: 'cast-3' }])
      }),
      release: () => release(),
    }
    await userEvent.click(within(rosterSection).getByRole('button', { name: /Venus/ }))

    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/league-seasons/season-1/roster/swap', {
        old_contestant_id: 'cast-2',
        new_contestant_id: 'cast-3',
      }),
    )
    // The write is through, the new tribe is not here yet — and the picker is
    // still up. Closing on the write would draw the lane with the castaway you
    // just dropped still on it, until the read caught up.
    expect(screen.getByText('Choose who replaces Charlie')).toBeVisible()
    holdRoster.release()
    holdRoster = null
    await waitFor(() =>
      expect(screen.queryByText('Choose who replaces Charlie')).not.toBeInTheDocument(),
    )
    // The swap names the two things it changed — the tribe, and the play
    // roster.py drops with a doubled castaway (#816). Before that it emptied
    // the cache, and every read on the page went out again behind it.
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/league-seasons/season-1/roster/user-1'),
    )
    expect([...new Set(vi.mocked(api.get).mock.calls.map(([path]) => path))].sort()).toEqual([
      '/league-seasons/season-1/advantage-plays/user-1',
      '/league-seasons/season-1/roster/user-1',
    ])
    // Which only holds because the write went out quiet: through the loud set
    // it would take the refetch-everything backstop with it.
    expect(api.post).not.toHaveBeenCalled()
  })

  it('says a read was refused rather than claiming there is no season (#816)', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Could not reach the league'))

    renderWithApp(<MySeasonPage />, { auth })

    // A failed league-season read leaves the page with no season, which is
    // indistinguishable from a league that has none — so it has to be gated
    // as a failure first. Falling through to the cold start tells a player
    // their commissioner never started a season, a different thing entirely.
    expect(await screen.findByText('Could not reach the league')).toBeVisible()
    expect(screen.queryByText(/Camp isn’t set up yet/)).not.toBeInTheDocument()
  })

  it('shows a refused locked-screen read instead of spinning on it (#816)', async () => {
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'upcoming', '2026-08-02T00:00:00Z')]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      // The locked screen holds its roster and ballot as "null means not yet",
      // so a refusal reads as pending forever unless the error is gated first.
      if (path.includes('/roster/')) throw new Error('Your tribe could not be read')
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Your tribe could not be read')).toBeVisible()
  })

  it('offers Undo on a swap made this episode, and reverses it', async () => {
    mockGet({ ...season, swap_lock_episode: 10 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        // Swapped during the open episode 3: the outgoing pick closed at 2.
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: 2, swap_penalty_points: -10 },
          { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 3, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const roster = await openBeat('Tribe')
    // Another swap is still on offer, and the one made is reversible from its row.
    expect(await screen.findByRole('button', { name: /^Swap ·/ })).toBeVisible()
    await userEvent.click(await within(roster).findByRole('button', { name: 'Undo swap' }))

    await waitFor(() =>
      expect(api.quiet.delete).toHaveBeenCalledWith('/league-seasons/season-1/roster/swap/cast-2'),
    )
  })

  it('lets a castaway snuffed weeks ago be swapped out', async () => {
    mockGet({ ...season, swap_lock_episode: 10 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'scored', '2026-08-15T00:00:00Z'),
          episode(4, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: 2 },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        // Charlie went out in 2 and is still held, so by 4 he's in the Snuffed bin.
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
          { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const roster = await openBeat('Tribe')
    expect(within(roster).queryByRole('button', { name: /Charlie/ })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: /^Swap ·/ }))
    await userEvent.click(within(roster).getByRole('button', { name: /Charlie/ }))
    expect(screen.getByText('Choose who replaces Charlie')).toBeVisible()
  })

  it('says the tribe has spoken the first time a castaway is voted out, then pulses Swap', async () => {
    localStorage.removeItem('mytribe.first-loss.season-1')
    mockGet({ ...season, swap_lock_episode: 10 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: 2 },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
          { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    await openBeat('Tribe')
    const dialog = await screen.findByRole('dialog', { name: /tribe has spoken/i })
    expect(within(dialog).getByText('free swap')).toBeVisible()
    // The chip pulses under the card already, and keeps on after Got it.
    const swap = screen.getByRole('button', { name: /^Swap ·/ })
    expect(swap).toHaveAttribute('data-pulse')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(swap).toHaveAttribute('data-pulse')
    await userEvent.click(swap)
    // Starting the swap ends the nudge and greys the chip out (disabled), but
    // keeps it in place so History below doesn't jump; Cancel rides the banner.
    const dimmedSwap = screen.getByRole('button', { name: /^Swap ·/ })
    expect(dimmedSwap).toBeDisabled()
    expect(dimmedSwap).not.toHaveAttribute('data-pulse')
    expect(screen.getByText('Choose a castaway to drop')).toBeVisible()
    expect(localStorage.getItem('mytribe.first-loss.season-1')).toBe('1')
  })

  it('holds the Sole Survivor card until the first-loss card is dismissed (#798)', async () => {
    localStorage.removeItem('mytribe.first-loss.season-1')
    localStorage.removeItem('mytribe.name-sole-survivor.season-1')
    mockGet({ ...season, swap_lock_episode: 4 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: 2 },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0, is_sole_survivor: false },
          { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0, is_sole_survivor: false },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    await openBeat('Tribe')
    const first = await screen.findByRole('dialog', { name: /tribe has spoken/i })
    expect(screen.queryByRole('dialog', { name: /choose your sole survivor/i })).not.toBeInTheDocument()
    await userEvent.click(within(first).getByRole('button', { name: 'Got it' }))
    expect(await screen.findByRole('dialog', { name: /choose your sole survivor/i })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: /tribe has spoken/i })).not.toBeInTheDocument()
  })

  it('keeps an unsaved ballot when you look at another beat', async () => {
    const open = { ...episode(2, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 2 }
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(1, 'scored', '2026-08-01T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const ballot = await openBeat('Ballot')
    await userEvent.click(within(ballot).getByRole('button', { name: /Kenzie/ }))
    expect(within(ballot).getByText('1 of 2')).toBeInTheDocument()

    // Panels stay mounted rather than unmounting, so the pick survives the trip.
    await openBeat('Tribe')
    const again = await openBeat('Ballot')
    expect(within(again).getByText('1 of 2')).toBeInTheDocument()
  })

  // Naming happens by tapping your Tribe in the pick mode the Sole Survivor
  // button starts (#164) — the only path to designate, so it gets its own test.
  it('names a Sole Survivor by tapping the tribe once the pick window opens', async () => {
    // The naming popup has its own test; suppress it here.
    localStorage.setItem('mytribe.name-sole-survivor.season-1', '1')
    mockGet({ ...season, swap_lock_episode: 3 }, async (path: string) => {
      if (path.endsWith('/contestants')) return [{ id: 'cast-1', name: 'Kenzie', nickname: null, eliminated_in_episode: null }]
      if (path.endsWith('/episodes')) {
        return [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'upcoming', '2099-08-27T00:00:00Z'), episode(9, 'upcoming', '2099-09-27T00:00:00Z')]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0, is_sole_survivor: false }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })
    vi.mocked(api.quiet.post).mockResolvedValue({})

    renderWithApp(<MySeasonPage />, { auth })

    await userEvent.click(await screen.findByRole('button', { name: /name your sole survivor/i }))
    // Now in the pick mode: tap the castaway's roster card.
    await userEvent.click(await screen.findByRole('button', { name: /Kenzie/ }))
    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/league-seasons/season-1/sole-survivor', {
        contestant_id: 'cast-1',
      }),
    )
  })

  it('pops the info card when the window opens with nobody named, then leaves the button pulsing (#164)', async () => {
    localStorage.removeItem('mytribe.name-sole-survivor.season-1')
    mockGet({ ...season, swap_lock_episode: 3 }, async (path: string) => {
      if (path.endsWith('/contestants')) return [{ id: 'cast-1', name: 'Kenzie', nickname: null, eliminated_in_episode: null }]
      if (path.endsWith('/episodes')) {
        return [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'upcoming', '2099-08-27T00:00:00Z'), episode(9, 'upcoming', '2099-09-27T00:00:00Z')]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0, is_sole_survivor: false }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const dialog = await screen.findByRole('dialog', { name: /choose your sole survivor/i })
    expect(within(dialog).getByText(/finale are worth an extra 50%/i)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    // Popup gone; the button keeps pulsing until one is named.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /choose your sole survivor/i })).not.toBeInTheDocument(),
    )
    expect(document.querySelector('.ss-line')).toHaveAttribute('data-pulse')
    expect(localStorage.getItem('mytribe.name-sole-survivor.season-1')).toBe('1')
  })

  it('prompts the hero for the Sole Survivor instead of "all set" while the window is open and none is named (#164)', async () => {
    localStorage.setItem('mytribe.name-sole-survivor.season-1', '1') // suppress the popup
    const open = { ...episode(2, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 1 }
    mockGet({ ...season, swap_lock_episode: 3 }, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [episode(1, 'scored', '2026-08-01T00:00:00Z'), open, episode(9, 'upcoming', '2099-09-27T00:00:00Z')]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', nickname: null, eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', nickname: null, eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', nickname: null, eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0, is_sole_survivor: false }]
      }
      // A saved vote makes the ballot "done", so the only thing left is the pick.
      if (/\/episodes\/[^/]+\/picks\//.test(path)) return [{ contestant_id: 'cast-2', episode_id: open.id }]
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const hero = await screen.findByRole('region', { name: /this week/i })
    await waitFor(() => expect(within(hero).getByText('Name your Sole Survivor')).toBeVisible())
    expect(within(hero).queryByText(/all set/i)).not.toBeInTheDocument()
  })

  it('limits broadcast styling to the short window after lock without changing state', () => {
    const locked = episode(2, 'upcoming', '2026-08-13T18:00:00Z')
    expect(isBroadcastWindow(locked, new Date('2026-08-13T20:00:00Z'))).toBe(true)
    expect(isBroadcastWindow(locked, new Date('2026-08-14T08:00:00Z'))).toBe(false)
    expect(resolveMySeasonState(season, [locked])).toEqual({ kind: 'locked', episode: locked })
  })

  it('uses the torchlit broadcast treatment only during the short airing window', async () => {
    const recentlyLocked = episode(2, 'upcoming', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    arrange([episode(1, 'scored', '2026-08-01T00:00:00Z'), recentlyLocked])

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByRole('heading', { name: 'Tribal Council' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Tribal Council' })).toHaveAttribute('data-variant', 'broadcast')
    expect(screen.queryByText('Scoring comes next')).not.toBeInTheDocument()
    expect(screen.queryByText(/ballot, roster, and weekly play are final/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Read only')).not.toBeInTheDocument()
  })

  it('shows the server-saved ballot roster and weekly play while locked', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: '/kenzie.jpg', tribe_color: '#123456', tribe_name: 'Yanu' },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_color: '#abcdef', tribe_name: 'Siga' },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      if (path.includes('/advantage-plays/')) {
        return [{ id: 'play-1', episode_id: 'episode-2', advantage_type: 'double_vote_points', target_contestant_id: null }]
      }
      if (path.includes('/picks/')) return [{ id: 'pick-1', contestant_id: 'cast-1' }]
      if (path.includes('/roster/')) return [{ id: 'roster-1', contestant_id: 'cast-2', active_until_episode: null }]
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Kenzie')).toBeVisible()
    // The roster arrives on its own request, so wait for it rather than
    // assume it landed with the ballot (flaky under CI load).
    expect(await screen.findByText('Charlie')).toBeVisible()
    // The locked ballot is the same handwritten slips as the open one, no
    // portraits: the roster above is where the people are (#685).
    expect(screen.getByText('Kenzie').closest('.ballot-slip')).not.toBeNull()
    // #451: My Roster behaves the same locked — scores in place, no jump to the
    // Cast page — so the locked roster no longer links out.
    expect(screen.getByText('Charlie').closest('a')).toBeNull()
    // #451: a played ballot double now reads as the idol ×2 mark on the Ballot heading.
    expect(screen.getByTitle('Power Vote this episode')).toBeVisible()
  })

  it("marks another team's Sole Survivor with a small torch instead of a gold name", async () => {
    const user = userEvent.setup()
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_color: '#123456', tribe_name: 'Yanu' },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_color: '#abcdef', tribe_name: 'Siga' },
        ]
      }
      if (path.endsWith('/hub')) {
        return [{
          user_id: 'user-2',
          display_name: 'Rival',
          roster: [{
            contestant_id: 'cast-1',
            name: 'Kenzie',
            image_url: null,
            tribe_color: '#123456',
            tribe_name: 'Yanu',
            eliminated_episode: null,
            points: 0,
          }],
          ballot: [],
          advantage_type: null,
          advantage_target: null,
          sole_survivor_contestant_id: 'cast-1',
          finale: null,
          tribe_points: null,
          ballot_points: null,
        }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      if (path.includes('/advantage-plays/')) return []
      if (path.includes('/picks/')) return []
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-2', active_until_episode: null }]
      }
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    const rival = await screen.findByText('Rival')
    const rivalRow = rival.closest('details')
    expect(rivalRow).not.toBeNull()
    await user.click(rival)

    const kenzie = await within(rivalRow!).findByText('Kenzie')
    expect(kenzie).not.toHaveClass('text-gold-300', 'text-gold-700')
    expect(rivalRow!.querySelector('.sole-survivor-torch')).toBeVisible()
    expect(within(rivalRow!).getByText('· Sole Survivor')).toBeInTheDocument()
  })

  it('uses compact text play marks and Standings ballot states in the locked Field', async () => {
    const user = userEvent.setup()
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    const survivor = (id: string, name: string) => ({
      contestant_id: id,
      name,
      image_url: null,
      tribe_color: '#123456',
      tribe_name: 'Yanu',
      eliminated_episode: null,
    })
    const baseEntry = {
      ballot: [],
      sole_survivor_contestant_id: null,
      finale: null,
      tribe_points: null,
      ballot_points: null,
    }
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_color: '#123456', tribe_name: 'Yanu' },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_color: '#abcdef', tribe_name: 'Siga' },
        ]
      }
      if (path.endsWith('/hub')) {
        const kenzie = survivor('cast-1', 'Kenzie')
        const charlie = survivor('cast-2', 'Charlie')
        return [
          {
            ...baseEntry,
            user_id: 'user-2',
            display_name: 'Tribe player',
            roster: [{ ...kenzie, points: 0 }],
            advantage_type: 'double_roster_points',
            advantage_target: kenzie,
          },
          {
            ...baseEntry,
            user_id: 'user-3',
            display_name: 'Ballot player',
            roster: [{ ...charlie, points: 0 }],
            ballot: [{ ...charlie, correct: false }],
            advantage_type: 'double_vote_points',
            advantage_target: charlie,
          },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      if (path.includes('/advantage-plays/')) return []
      if (path.includes('/picks/')) return []
      if (path.includes('/roster/')) return []
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    await user.click(await screen.findByRole('button', { name: 'Expand all' }))
    expect(await screen.findByLabelText('Double Castaway Points on them this episode')).toHaveTextContent('×2')

    const powerVote = screen.getByTitle('Power Vote on this vote')
    expect(powerVote).toHaveTextContent('Charlie')
    expect(powerVote.className).toContain('border-dotted')
    expect(powerVote.className).toContain('text-gold-700')

    // No season-idol art remains in the shared Field treatment.
    expect(screen.queryByRole('img', { name: /Power Vote|Double Castaway Points/ })).not.toBeInTheDocument()
  })

  it('shows the locked finale bracket instead of a weekly boot vote', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      { ...episode(2, 'upcoming', '2026-08-02T00:00:00Z'), is_finale: true },
    ]
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_color: '#123456', tribe_name: 'Yanu' },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_color: '#abcdef', tribe_name: 'Siga' },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      if (path.includes('/advantage-plays/')) return []
      if (path.includes('/finale-predictions/')) {
        return {
          id: 'pred-1',
          user_id: auth.session.user.id,
          season_id: season.id,
          final_four_contestant_ids: ['cast-1', 'cast-2'],
          final_three_contestant_ids: ['cast-1'],
          winner_contestant_id: 'cast-1',
          created_at: '2026-08-02T00:00:00Z',
        }
      }
      if (path.includes('/roster/')) return [{ id: 'roster-1', contestant_id: 'cast-2', active_until_episode: null }]
      // A weekly boot-vote fetch would land here; the finale must not make one.
      if (path.includes('/picks/')) throw new Error('finale should not fetch weekly picks')
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Finale ballot locked')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Finale ballot' })).toBeVisible()
    // The stale weekly "Ballot" section is gone at the finale.
    expect(screen.queryByRole('heading', { name: 'Ballot' })).not.toBeInTheDocument()
  })

  it('keeps the locked finale screen up when the refused bracket read is retried (#822)', async () => {
    // Everyone who filed no bracket gets a 404 here, which the locked screen
    // forgives — it reads as no ballot. A refused query holds no data, so a
    // refetch resets it to pending, on every window focus and after every
    // write; on `isPending` the whole screen would drop to the loader for a
    // round trip each time, on finale night.
    const bracketPath = `/league-seasons/season-1/finale-predictions/${auth.session.user.id}`
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      { ...episode(2, 'upcoming', '2026-08-02T00:00:00Z'), is_finale: true },
    ]
    const asked: string[] = []
    mockGet(season, async (path: string) => {
      asked.push(path)
      if (path === '/seasons/season-1/episodes') return episodes
      if (path === '/seasons/season-1/contestants') {
        return [{ id: 'cast-1', name: 'Kenzie', image_url: null, tribe_color: '#123456', tribe_name: 'Yanu' }]
      }
      if (path === bracketPath) {
        // Refuses at once the first time; the retry stays in the air, so the
        // screen can be read while the refused query is back to pending.
        if (asked.filter((p) => p === path).length > 1) return new Promise(() => {})
        throw new ApiError('No bracket submitted', 404)
      }
      if (path === `/league-seasons/season-1/roster/${auth.session.user.id}`) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_until_episode: null }]
      }
      if (path === `/league-seasons/season-1/scoring-breakdown/${auth.session.user.id}`) return { roster: [], picks: [] }
      if (path === `/league-seasons/season-1/advantage-plays/${auth.session.user.id}`) return []
      if (path === '/league-seasons/season-1/standings') return []
      if (path.endsWith('/reveal')) return undefined
      if (path.endsWith('/hub')) return []
      // Anything else fails the test, including the weekly boot-vote read the
      // finale must not make.
      throw new Error(`Unexpected path: ${path}`)
    })

    // The test holds the cache so it can trigger the retry itself.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithApp(<MySeasonPage />, { auth, client })

    expect(await screen.findByRole('heading', { name: 'Results are pending' })).toBeVisible()

    // What a window focus or a write elsewhere does: everything refetches. The
    // `setTimeout(0)` is what gets the refetch's pending state on screen:
    // react-query schedules its notifications with `setTimeout(cb, 0)`
    // (notifyManager), so an act with nothing awaited in it returns before
    // React has been told anything.
    await act(async () => {
      void client.invalidateQueries()
      await new Promise((r) => setTimeout(r, 0))
    })

    // The retry really went out and is still out, or this proves nothing.
    expect(asked.filter((p) => p === bracketPath)).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Results are pending' })).toBeVisible()
  })

  it('hides roster members eliminated in an earlier episode from the locked roster', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_color: '#123456', tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_color: '#abcdef', tribe_name: 'Siga', eliminated_in_episode: 1 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      if (path.includes('/advantage-plays/')) return []
      if (path.includes('/picks/')) return []
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_until_episode: null, is_sole_survivor: true },
          { id: 'roster-2', contestant_id: 'cast-2', active_until_episode: null },
        ]
      }
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    // Kenzie is still in; Charlie was voted out in ep 1 and can't score, so the
    // locked roster drops him.
    expect(await screen.findByText('Kenzie')).toBeVisible()
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    // Kenzie is the designated Sole Survivor: a gold name with a screen-reader
    // label, nothing louder (#685).
    await waitFor(() => expect(screen.getByText('Kenzie')).toHaveClass('text-gold-700'))
    expect(screen.getByText('· Sole Survivor')).toBeInTheDocument()
  })

  it('shows the latest automatic reveal and retries acknowledgement before continuing to Open', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
        episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
      ],
      result({
        insights: [
          { id: 'popular-pick', label: 'League call', value: '72%', detail: 'picked Kenzie' },
        ],
      }),
    )
    vi.mocked(api.quiet.post)
      .mockRejectedValueOnce(new Error('Still saving'))
      .mockResolvedValueOnce({})
    renderWithApp(<MySeasonPage />, { auth })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Two torches snuffed')
    expect(screen.getByRole('heading', { name: 'Tribe' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Ballot' })).toBeVisible()
    // The play is not a lane of its own: the idol rides the doubled vote, at
    // what it paid, and the Ballot lane total carries the bonus.
    expect(screen.queryByRole('heading', { name: 'Advantage' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: 'Power Vote' })).toBeVisible()
    expect(dialog).toHaveTextContent(/Kenzie\+30/)
    expect(dialog).toHaveTextContent(/Up 3.*#2/)
    expect(screen.getByRole('heading', { name: 'Episode insight' })).toBeVisible()
    expect(dialog).toHaveTextContent('72%')
    expect(dialog.querySelector('article')).toHaveClass('max-w-2xl')
    // Points buildup (Roster + Ballot = total) replaces the old sum line.
    expect(dialog).toHaveTextContent('+45Ballot')
    expect(dialog).toHaveTextContent('+60')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Still saving')
    expect(screen.getByRole('dialog')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /^Ballot/ })).toBeVisible()
    expect(api.quiet.post).toHaveBeenCalledWith(
      '/league-seasons/season-1/reveal-acknowledgement',
      { episode_id: 'episode-2' },
    )
  })

  it('reopens a recap the server refused once, when the server is back (#816)', async () => {
    const user = userEvent.setup()
    let fail = true
    mockGet(season, async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'scored', '2026-08-08T00:00:00Z')]
      }
      if (path.includes('/episode-results/')) {
        if (fail) throw new Error('Recap is unavailable')
        return result()
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth, gcTime: 60_000 })
    await screen.findByRole('heading', { name: 'Between episodes' })
    await user.click(screen.getByRole('button', { name: /^History/ }))
    await user.click(screen.getByRole('tab', { name: /^Recaps/ }))
    await user.click(screen.getByRole('button', { name: /Ep 2.*Replay/ }))
    // A recap that can't be read closes rather than sitting empty, and says
    // why back on the sheet it was opened from.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // The server is fine now, and the same recap has to open — the refused
    // answer is still in the cache for five minutes, and the effect that
    // closed the recap reads the same `error` it was closed on. It doesn't
    // fire twice: re-enabling a query with no data refetches, and that clears
    // the error in the same render the observer hands back (query-core's
    // `fetchState`). Which is only true with the app's gcTime, so this test
    // asks for it — under the harness's zero the query would be long gone and
    // this would pass without meaning anything.
    fail = false
    await user.click(screen.getByRole('button', { name: /^History/ }))
    await user.click(screen.getByRole('tab', { name: /^Recaps/ }))
    await user.click(screen.getByRole('button', { name: /Ep 2.*Replay/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Ep 2 replay')
  })

  it('previews the last episode on the History card from the standings row (#803)', async () => {
    mockGet(season, async (path: string) => {
      // The card used to build a whole episode result for these two numbers.
      if (path.includes('/episode-results/')) throw new Error(`No such route: ${path}`)
      if (path.endsWith('/episodes')) {
        return [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'scored', '2026-08-08T00:00:00Z')]
      }
      if (path.includes('/standings')) {
        return [{ user_id: 'user-1', display_name: 'Danny', total_points: 100, last_episode_points: 64, trend: 'up', trend_delta: 3, active_survivors: [], recently_eliminated_survivors: [] }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByRole('button', { name: /1 episode · last: \+64, up 3 spots/ })).toBeVisible()
  })

  it('replays a scored Episode History result without acknowledging it', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
      ],
      undefined,
      result({
        current_rank: null,
        prior_rank: null,
        rank_delta: null,
        headline: 'Rachel sent to Redemption. Rupert ends his Survivor career.',
        note: "Tony's mystery paper is a deferred call — no points yet.",
      }),
    )
    renderWithApp(<MySeasonPage />, { auth })

    await screen.findByRole('heading', { name: 'Between episodes' })
    await user.click(screen.getByRole('button', { name: /^History/ }))
    await user.click(screen.getByRole('tab', { name: /^Recaps/ }))
    await user.click(screen.getByRole('button', { name: /Ep 2.*View your scored result.*Replay/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Ep 2 replay')
    // The commissioner's headline replaces the torch count.
    expect(dialog).toHaveTextContent('Rachel sent to Redemption. Rupert ends his Survivor career.')
    // The commissioner's note rides along under it (#185).
    expect(dialog).toHaveTextContent("Tony's mystery paper is a deferred call — no points yet.")
    expect(dialog).not.toHaveTextContent('torches snuffed')
    expect(dialog).not.toHaveTextContent(/ranked|spots to|Held at/)
    expect(dialog.querySelector('article')).toHaveClass('max-w-2xl')
    await user.click(screen.getByRole('button', { name: 'Back to My Season' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Between episodes' })).toBeVisible()
    // Nothing was written at all: a replay is a read, and the reveal it is
    // not is the one thing here that would acknowledge anything.
    expect(api.post).not.toHaveBeenCalled()
    expect(api.quiet.post).not.toHaveBeenCalled()
  })

  it('tells a Redemption Island week apart: island trips in the headline, only the exit gets a boot chip, the island line names everyone there (#655)', async () => {
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
      ],
      result({
        eliminated: [
          { contestant_id: 'cast-1', name: 'Rachel', image_url: null, elimination_type: 'voted_out', is_final: false },
          { contestant_id: 'cast-2', name: 'Rupert', image_url: null, elimination_type: 'redemption_loss', is_final: true },
        ],
        redemption: [
          { contestant_id: 'cast-5', name: 'Candice', image_url: null },
          { contestant_id: 'cast-6', name: 'Marissa', image_url: null },
          { contestant_id: 'cast-1', name: 'Rachel', image_url: null },
        ],
      }),
    )
    vi.mocked(api.quiet.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    const dialog = await screen.findByRole('dialog')
    // By id: the embedded Field panel adds its own level-2 heading.
    const title = dialog.querySelector('#episode-result-title')!
    expect(title).toHaveTextContent('Rachel sent to Redemption. Rupert sent home.')
    expect(title).toHaveClass('whitespace-pre-line')
    const chips = within(dialog).getByRole('list', { name: 'Eliminated castaways' })
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1)
    expect(chips).toHaveTextContent(/Rupert.*Sent home/)
    expect(dialog).toHaveTextContent('Rachel joins Candice and Marissa on Redemption Island.')
  })

  it('continues an automatic reveal to Intermission when no next episode exists', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
      ],
      result({
        eliminated: [],
        ballot: [],
        ballot_points: 0,
        weekly_plays: [],
        weekly_play_bonus: 0,
        total_points: 15,
        current_rank: 1,
        prior_rank: null,
        rank_delta: null,
      }),
    )
    vi.mocked(api.quiet.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('No one was voted out')).toBeVisible()
    expect(screen.getByText('No ballot was submitted, so there are no ballot points.')).toBeVisible()
    expect(screen.getByText('#1')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Episode insight' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Between episodes' })).toBeVisible()
  })

  it('continues the finale reveal to Complete when the season is completed', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        { ...episode(2, 'scored', '2026-08-08T00:00:00Z'), is_finale: true },
      ],
      result({ is_finale: true }),
      undefined,
      { ...season, status: 'completed' },
    )
    vi.mocked(api.quiet.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Season complete' })).toBeVisible()
    // No standing in this fixture, so the hero falls back to the plain line
    // with no points total or split (#686).
    expect(screen.getByText('Final standings are settled')).toBeVisible()
  })

  // #479: the recap is a durable, navigable state — a URL search param, not
  // just an in-page overlay — so it survives Back and refresh correctly.
  describe('recap as a URL search param (#479)', () => {
    it('puts recap=<episode id> in the URL when opening a replay', async () => {
      const user = userEvent.setup()
      arrange(
        [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'scored', '2026-08-08T00:00:00Z')],
        undefined,
        result(),
      )
      renderWithApp(
        <>
          <MySeasonPage />
          <LocationProbe />
        </>,
        { auth },
      )

      await screen.findByRole('heading', { name: 'Between episodes' })
      expect(screen.getByTestId('location-probe')).toHaveAttribute('data-recap', '')

      await user.click(screen.getByRole('button', { name: /^History/ }))
      await user.click(screen.getByRole('tab', { name: /^Recaps/ }))
      await user.click(
        screen.getByRole('button', { name: /Ep 2.*View your scored result.*Replay/ }),
      )

      await screen.findByRole('dialog')
      expect(screen.getByTestId('location-probe')).toHaveAttribute('data-recap', 'episode-2')
    })

    it('closes the recap and returns to My Season when the recap param is cleared (Back)', async () => {
      const user = userEvent.setup()
      arrange(
        [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'scored', '2026-08-08T00:00:00Z')],
        undefined,
        result(),
      )
      renderWithApp(
        <>
          <MySeasonPage />
          <BackButton />
        </>,
        { auth },
      )

      await screen.findByRole('heading', { name: 'Between episodes' })
      await user.click(screen.getByRole('button', { name: /^History/ }))
      await user.click(screen.getByRole('tab', { name: /^Recaps/ }))
      await user.click(
        screen.getByRole('button', { name: /Ep 2.*View your scored result.*Replay/ }),
      )
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'simulate back' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Between episodes' })).toBeVisible()
    })

    it('fetches and shows the recap on initial render when ?recap=<id> is already in the URL', async () => {
      arrange(
        [episode(1, 'scored', '2026-08-01T00:00:00Z'), episode(2, 'scored', '2026-08-08T00:00:00Z')],
        undefined,
        result(),
      )
      renderWithApp(<MySeasonPage />, { auth, route: '/?recap=episode-2' })

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent('Ep 2 replay')
      expect(api.get).toHaveBeenCalledWith('/league-seasons/season-1/episode-results/episode-2')
    })
  })
})
