import type { Session } from '@supabase/supabase-js'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavigate, useSearchParams } from 'react-router'
import { api, getActiveSeason } from '../lib/api'
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

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getActiveSeason: vi.fn(),
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
    is_finale: false,
    eliminated: [
      { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, elimination_type: 'voted_out' },
      { contestant_id: 'cast-2', name: 'Charlie', image_url: null, elimination_type: 'voted_out' },
    ],
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
        target_contestant_id: null,
        target_name: null,
        bonus_points: 30,
      },
    ],
    weekly_play_bonus: 30,
    total_points: 75,
    current_rank: 2,
    prior_rank: 5,
    rank_delta: 3,
    ...overrides,
  }
}

function arrange(
  episodes: Episode[],
  automaticResult?: EpisodeResult,
  replayResult?: EpisodeResult,
) {
  vi.mocked(getActiveSeason).mockResolvedValue(season)
  vi.mocked(api.get).mockImplementation(async (path: string) => {
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

    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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

    expect(await screen.findByText('Ep 2 · locked')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Results are pending' })).toBeVisible()
    expect(screen.getByText('No ballot was submitted.')).toBeVisible()
    // #451: the redundant standalone Advantage section is dropped while locked.
    expect(screen.queryByRole('heading', { name: 'Advantage' })).not.toBeInTheDocument()
    expect(screen.getByText('Awaiting league scoring')).toBeVisible()
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

  it('shows what each rostered castaway earned you, without a bio link', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
    // The unplayed advantage idol is always on screen in the bar.
    expect(screen.getByRole('button', { name: /Play your advantage/ })).toBeVisible()
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
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
    vi.mocked(api.post).mockResolvedValue([
      { id: 'pick-1', contestant_id: 'cast-1' },
      { id: 'pick-2', contestant_id: 'cast-2' },
    ])

    renderWithApp(<MySeasonPage />, { auth })

    const ballot = await openBeat('Ballot')
    expect(within(ballot).getByRole('heading', { name: 'Yanu' })).toBeVisible()
    expect(within(ballot).getByRole('heading', { name: 'Siga' })).toBeVisible()
    expect(within(ballot).getByRole('heading', { name: 'Nami' })).toBeVisible()
    expect(within(ballot).queryByText('Earlier Boot')).not.toBeInTheDocument()
    expect(within(ballot).getByText(/names written/)).toHaveTextContent('0 of 2 names written')
    expect(within(ballot).getByRole('button', { name: /Save ballot/ })).toBeDisabled()

    expect(within(ballot).getAllByRole('button', { name: /^Vote for/ })).toHaveLength(18)
    const kenzie = within(ballot).getByRole('button', { name: 'Vote for Kenzie' })
    const charlie = within(ballot).getByRole('button', { name: 'Vote for Charlie' })
    await user.click(kenzie)
    await user.click(charlie)
    // Selection is a tick, not a rank — votes are unordered and equally weighted
    expect(kenzie).toHaveAttribute('aria-pressed', 'true')
    expect(charlie).toHaveAttribute('aria-pressed', 'true')
    expect(within(ballot).getByText(/names written/)).toHaveTextContent('2 of 2 names written')
    expect(within(ballot).getByRole('button', { name: 'Vote for Venus' })).toBeDisabled()

    await user.click(within(ballot).getByRole('button', { name: /Save ballot/ }))
    expect(await screen.findByText('Ballot submitted')).toBeVisible()
    const slip = within(ballot).getByText('Kenzie').closest('.ballot-slip')
    expect(slip).toHaveStyle({
      '--ballot-tribe-color': '#7651a1',
      '--ballot-rotation': '-0.7deg',
    })
    // A vote is a name written down, not a person looked at (#552) — the tribe
    // rides the slip's left edge and the portrait is gone.
    expect(slip?.querySelector('.contestant-avatar')).toBeNull()
    expect(api.post).toHaveBeenCalledWith('/league-seasons/season-1/episodes/episode-2/picks', {
      contestant_ids: ['cast-1', 'cast-2'],
    })

    await user.click(within(ballot).getByRole('button', { name: 'Edit ballot' }))
    expect(within(ballot).getByText(/names written/)).toHaveTextContent('2 of 2 names written')
    expect(within(ballot).getByRole('button', { name: /Save ballot/ })).toBeDisabled()
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

  it('keeps the weekly play to the two doubles, with swaps living on the roster', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, free_swaps: 1, swap_lock_episode: 10 })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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

    // The advantage lives in the persistent strip now (#399); the swap is still
    // started from the Roster beat, priced in points.
    const roster = await openBeat('Tribe')
    expect(await within(roster).findByRole('button', { name: /^Swap ·/ })).toHaveTextContent(
      'free',
    )

    // The two doubles are behind the loud idol's tap menu — nothing else.
    await userEvent.click(screen.getByRole('button', { name: /Play your advantage/ }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Double a castaway' })).toBeVisible()
    expect(within(menu).getByRole('menuitem', { name: 'Double your ballot' })).toBeVisible()
    expect(within(menu).queryByRole('menuitem', { name: /Swap/ })).not.toBeInTheDocument()

    // Choosing "Double a castaway" opens the focused sheet to answer it.
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Double a castaway' }))
    const sheet = screen.getByRole('dialog', { name: /Choose a castaway to double/ })
    expect(within(sheet).getByText('Kenzie')).toBeVisible()
    expect(within(sheet).getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  it('marks the selected roster card after Double Castaway Points is saved', async () => {
    const open = episode(3, 'upcoming', '2099-08-27T00:00:00Z')
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(2, 'scored', '2026-08-08T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [{ id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null }]
      }
      if (path.includes('/advantage-plays/')) {
        return [{
          id: 'play-1',
          episode_id: 'episode-3',
          advantage_type: 'double_roster_points',
          target_contestant_id: 'cast-1',
        }]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    // The doubled castaway carries a wax-seal ×2 mark on the roster row.
    expect(
      await screen.findByRole('img', { name: /Double Castaway Points/ }),
    ).toBeInTheDocument()
    // The idol lives on the target row, not the tab (#487), and the tab no
    // longer restates the play at all — that's the hero's Advantage tile.
    const rosterTab = screen.getByRole('tab', { name: /^Tribe/ })
    expect(rosterTab).not.toHaveTextContent('×2')
    expect(within(rosterTab).queryByRole('img', { name: /Double Castaway Points/ })).not.toBeInTheDocument()

    // The hero's Advantage tile is the played state now: checked, and naming
    // where the ×2 landed.
    expect(screen.getByText('×2 · Kenzie')).toBeVisible()
  })

  it('drags the ×2 seal onto another castaway to move the double (#407)', async () => {
    const open = { ...episode(3, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 3 }
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(2, 'scored', '2026-08-08T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/advantage-plays/')) {
        return [{ id: 'play-1', episode_id: 'episode-3', advantage_type: 'double_roster_points', target_contestant_id: 'cast-1' }]
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
    vi.mocked(api.post).mockResolvedValue({ id: 'play-2', episode_id: 'episode-3', advantage_type: 'double_roster_points', target_contestant_id: 'cast-2' })
    let finishDelete!: () => void
    vi.mocked(api.delete).mockImplementation(
      () => new Promise<void>((resolve) => { finishDelete = resolve }),
    )

    renderWithApp(<MySeasonPage />, { auth })
    const roster = await openBeat('Tribe')

    // The seal on the doubled row (Kenzie) is the drag handle.
    const seal = await within(roster).findByRole('img', { name: /Double Castaway Points/ })
    const kenzieRow = within(roster).getByText('Kenzie').closest('[data-drop-id]')!
    const rosterTab = screen.getByRole('tab', { name: /^Tribe/ })
    // The other row is the drop target; jsdom does no layout, so stub the one
    // primitive the drop hit-test relies on to point at Charlie's row.
    const charlieRow = within(roster).getByText('Charlie').closest('[data-drop-id]')!
    document.elementFromPoint = () => charlieRow as Element

    fireEvent.pointerDown(seal, { clientX: 100, clientY: 100 })
    fireEvent(window, new MouseEvent('pointermove', { clientX: 60, clientY: 200 }))
    fireEvent(window, new MouseEvent('pointerup', { clientX: 60, clientY: 200 }))

    // The visible seal lands optimistically instead of flashing on Kenzie,
    // disappearing during delete, and only then reappearing on Charlie.
    expect(within(kenzieRow as HTMLElement).queryByRole('img', { name: /Double Castaway Points/ })).not.toBeInTheDocument()
    expect(within(charlieRow as HTMLElement).getByRole('img', { name: /Double Castaway Points/ })).toBeVisible()
    // The idol lives on the target now, not the tab (#487).
    expect(within(rosterTab).queryByRole('img', { name: /Double Castaway Points/ })).not.toBeInTheDocument()
    expect(rosterTab).not.toHaveTextContent('×2')
    // The move is optimistic across the board (#487/#399): the hero's Advantage
    // tile names the new target immediately, not only after delete+post lands.
    expect(screen.getByText('×2 · Charlie')).toBeVisible()

    // Moving the double is delete-old + post-new targeting Charlie (weekly.replace).
    finishDelete()
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/league-seasons/season-1/advantage-plays', {
        advantage_type: 'double_roster_points',
        target_contestant_id: 'cast-2',
      }),
    )
    expect(api.delete).toHaveBeenCalledWith('/advantage-plays/play-1')
  })

  it('drags the roster seal onto the Ballot tab to make it a ballot double (#487)', async () => {
    const open = { ...episode(3, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 3 }
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(2, 'scored', '2026-08-08T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/advantage-plays/')) {
        return [{ id: 'play-1', episode_id: 'episode-3', advantage_type: 'double_roster_points', target_contestant_id: 'cast-1' }]
      }
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })
    vi.mocked(api.post).mockResolvedValue({ id: 'play-2', episode_id: 'episode-3', advantage_type: 'double_vote_points', target_contestant_id: null })
    vi.mocked(api.delete).mockResolvedValue(undefined)

    renderWithApp(<MySeasonPage />, { auth })
    const roster = await openBeat('Tribe')

    const seal = await within(roster).findByRole('img', { name: /Double Castaway Points/ })
    const ballotTab = screen.getByRole('tab', { name: /^Ballot/ })
    // jsdom does no layout; point the hit-test at the Ballot tab (a drop target).
    document.elementFromPoint = () => ballotTab as Element

    fireEvent.pointerDown(seal, { clientX: 100, clientY: 100 })
    fireEvent(window, new MouseEvent('pointermove', { clientX: 100, clientY: 20 }))
    fireEvent(window, new MouseEvent('pointerup', { clientX: 100, clientY: 20 }))

    // The play converts to a targetless ballot double, and we auto-switch to the
    // Ballot beat so its landing is visible.
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/league-seasons/season-1/advantage-plays', {
        advantage_type: 'double_vote_points',
        target_contestant_id: null,
      }),
    )
    expect(api.delete).toHaveBeenCalledWith('/advantage-plays/play-1')
    await waitFor(() => expect(ballotTab).toHaveAttribute('aria-selected', 'true'))
  })

  it('drags the ballot seal onto the Roster tab to pick a castaway to double (#487)', async () => {
    const open = { ...episode(3, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 3 }
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(2, 'scored', '2026-08-08T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/advantage-plays/')) {
        return [{ id: 'play-1', episode_id: 'episode-3', advantage_type: 'double_vote_points', target_contestant_id: null }]
      }
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })
    const ballot = await openBeat('Ballot')

    const seal = await within(ballot).findByTitle(/Drag to the Roster tab/)
    const rosterTab = screen.getByRole('tab', { name: /^Tribe/ })
    document.elementFromPoint = () => rosterTab as Element

    fireEvent.pointerDown(seal, { clientX: 100, clientY: 100 })
    fireEvent(window, new MouseEvent('pointermove', { clientX: 100, clientY: 20 }))
    fireEvent(window, new MouseEvent('pointerup', { clientX: 100, clientY: 20 }))

    // Same as the Advantage → Roster ×2 flow: the double-pick sheet opens.
    expect(await screen.findByRole('dialog', { name: 'Choose a castaway to double' })).toBeVisible()
  })

  it('starts a swap from the roster, prices it, and commits it on the cards', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, free_swaps: 1, swap_lock_episode: 10 })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
      if (path.includes('/roster/')) {
        // One swap already made, back in episode 3 — so this is the 2nd of the
        // season (−10) and the one-per-episode rule does not block episode 4.
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: 2, swap_penalty_points: 0 },
          { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 3, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    // The swap starts on the roster now, and the header carries its price.
    const rosterSection = await openBeat('Tribe')
    const swap = await within(rosterSection).findByRole('button', { name: /^Swap ·/ })
    expect(swap).toHaveTextContent('-10')

    await userEvent.click(swap)
    expect(screen.getByText('Choose a castaway to drop')).toBeVisible()
    await userEvent.click(within(rosterSection).getByRole('button', { name: /Charlie/ }))
    expect(screen.getByText('Choose who replaces Charlie')).toBeVisible()
    // The cost is stated again at the moment of choosing, not just in the header.
    expect(screen.getByText('costs -10 points')).toBeVisible()
    expect(screen.getByText(/you can undo it until picks lock/)).toBeVisible()
    await userEvent.click(within(rosterSection).getByRole('button', { name: /Venus/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/league-seasons/season-1/roster/swap', {
        old_contestant_id: 'cast-2',
        new_contestant_id: 'cast-3',
      }),
    )
  })

  it('offers Undo on a swap made this episode, and reverses it', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, swap_lock_episode: 10 })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
    // No second swap this episode, but the one made is still reversible.
    expect(within(roster).queryByRole('button', { name: /^Swap ·/ })).not.toBeInTheDocument()
    expect(await within(roster).findByText(/Swapped this episode · -10/)).toBeVisible()
    await userEvent.click(within(roster).getByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/league-seasons/season-1/roster/swap'),
    )
  })

  it('keeps an unsaved ballot when you look at another beat', async () => {
    const open = { ...episode(2, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 2 }
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
    expect(within(ballot).getByText(/names written/)).toHaveTextContent('1 of 2 names written')

    // Panels stay mounted rather than unmounting, so the pick survives the trip.
    await openBeat('Tribe')
    const again = await openBeat('Ballot')
    expect(within(again).getByText(/names written/)).toHaveTextContent('1 of 2 names written')
  })

  // #401: this control was unreachable for a while — rendered only under a
  // `compact={false}` that no call site ever passed. It is the only way to
  // designate, so it gets a test of its own. #529 moved it from a select above
  // the roster onto the roster card's own ring; the guarantee is unchanged.
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
    expect(screen.getByText('Scoring comes next')).toBeVisible()
    expect(screen.queryByText(/ballot, roster, and weekly play are final/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Read only')).not.toBeInTheDocument()
  })

  it('shows the server-saved ballot roster and weekly play while locked', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
    expect(screen.getByText('Charlie')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Kenzie' })).toHaveAttribute('src', '/kenzie.jpg')
    // #451: My Roster behaves the same locked — scores in place, no jump to the
    // Cast page — so the locked roster no longer links out.
    expect(screen.getByText('Charlie').closest('a')).toBeNull()
    // #451: a played ballot double now reads as the idol ×2 mark on the Ballot heading.
    expect(screen.getByTitle('Double Ballot Points this episode')).toBeVisible()
  })

  it('shows the locked finale bracket instead of a weekly boot vote', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      { ...episode(2, 'upcoming', '2026-08-02T00:00:00Z'), is_finale: true },
    ]
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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

  it('hides roster members eliminated in an earlier episode from the locked roster', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
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
    // Kenzie is the designated Sole Survivor — the locked roster tags her.
    expect(screen.getByText('Sole Survivor')).toBeVisible()
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
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error('Still saving'))
      .mockResolvedValueOnce({})
    renderWithApp(<MySeasonPage />, { auth })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Two torches snuffed')
    expect(screen.getByRole('heading', { name: 'Tribe' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Ballot' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Advantage' })).toBeVisible()
    expect(dialog).toHaveTextContent(/Up 3.*#2/)
    expect(screen.getByRole('heading', { name: 'Episode insight' })).toBeVisible()
    expect(dialog).toHaveTextContent('72%')
    expect(dialog.querySelector('article')).toHaveClass('max-w-2xl')
    // Points buildup (Roster + Ballot + Advantage = total) replaces the old sum line.
    expect(dialog).toHaveTextContent('+75')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Still saving')
    expect(screen.getByRole('dialog')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /^Ballot/ })).toBeVisible()
    expect(api.post).toHaveBeenCalledWith(
      '/league-seasons/season-1/reveal-acknowledgement',
      { episode_id: 'episode-2' },
    )
  })

  it('replays a scored Episode History result without acknowledging it', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
      ],
      undefined,
      result({ current_rank: null, prior_rank: null, rank_delta: null }),
    )
    renderWithApp(<MySeasonPage />, { auth })

    await screen.findByRole('heading', { name: 'Between episodes' })
    await user.click(screen.getByRole('button', { name: /^History/ }))
    await user.click(screen.getByRole('tab', { name: /^Recaps/ }))
    await user.click(screen.getByRole('button', { name: /Ep 2.*View your scored result.*Replay/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Ep 2 replay')
    expect(dialog).not.toHaveTextContent(/ranked|spots to|Held at/)
    expect(dialog.querySelector('article')).toHaveClass('max-w-2xl')
    await user.click(screen.getByRole('button', { name: 'Back to My Season' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Between episodes' })).toBeVisible()
    expect(api.post).not.toHaveBeenCalled()
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
    vi.mocked(api.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('No one was voted out')).toBeVisible()
    expect(screen.getByText('No ballot was submitted, so there are no ballot points.')).toBeVisible()
    expect(screen.getByText('No weekly play was used.')).toBeVisible()
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
    )
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, status: 'completed' })
    vi.mocked(api.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Season complete' })).toBeVisible()
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
