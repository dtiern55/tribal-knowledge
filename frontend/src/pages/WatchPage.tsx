import { useEffect, useState } from 'react'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { useAuth } from '../auth/useAuth'
import { api, getActiveSeason } from '../lib/api'
import { rankCast } from '../lib/cast'
import { airingEpisode } from '../lib/episodes'
import type { CastMember, Episode, Season } from '../types'

/**
 * The six scoring events survivoR never proposes, so the commissioner has to
 * watch for them. Kept in step by hand with the "Judgment calls not proposed"
 * warning in backend/app/survivor_import.py; everything else on the sheet
 * arrives in the import proposal.
 */
const EVENTS = [
  {
    type: 'episode_title_quote',
    short: 'Title quote',
    points: 3,
    perUnit: false,
    hint: 'Says the line the episode is named after.',
  },
  {
    type: 'read_treemail_or_instructions',
    short: 'Treemail',
    points: 3,
    perUnit: true,
    hint: 'Reads Treemail or challenge instructions aloud. Counts every time.',
  },
  {
    type: 'jeff_thats_how_you_do_it',
    short: 'Jeff quote',
    points: 5,
    perUnit: false,
    hint: 'Jeff says "That’s how you do it on Survivor" straight to them.',
  },
  {
    type: 'blindside_with_active_idol',
    short: 'Blindside',
    points: 7,
    perUnit: false,
    hint: 'Voted out someone who was holding an active idol and never played it.',
  },
  {
    type: 'fake_idol_played',
    short: 'Fake idol',
    points: 12,
    perUnit: false,
    hint: 'Made the fake idol that somebody played.',
  },
  {
    type: 'steal_immunity_idol',
    short: 'Idol steal',
    points: 15,
    perUnit: false,
    hint: 'Stole an immunity idol.',
  },
]

/** The feed proposes these but gets them wrong or partial, so they need eyes. */
const VERIFY = [
  'Team immunity or reward: write down the whole winning tribe, not just the winner the feed names.',
  'Redemption Island week: for each boot, island or gone for good.',
  'First individual Tribal Council. That sets the merge episode.',
  'Fire-making winner. The feed guesses it from a text field.',
  'Nullified votes, and any correct vote that got nullified.',
  'The episode title, which is typed in by hand.',
]

const storageKey = (episodeId: string) => `tk-watch-${episodeId}`

// Taps wrap back to zero so a mistap undoes itself without an undo control.
const nextCount = (n: number, perUnit: boolean) => (perUnit ? (n + 1) % 10 : (n + 1) % 2)

function summarize(
  episode: Episode,
  cast: CastMember[],
  counts: Record<string, number>,
  notes: string,
): string {
  const lines = [`Episode ${episode.episode_number} manual events`]
  for (const event of EVENTS) {
    const named = cast
      .filter((c) => counts[`${c.id}|${event.type}`])
      .map((c) => {
        const n = counts[`${c.id}|${event.type}`]
        return n > 1 ? `${c.name} x${n}` : c.name
      })
    if (named.length) lines.push(`${event.short}: ${named.join(', ')}`)
  }
  if (lines.length === 1) lines.push('Nothing recorded.')
  if (notes.trim()) lines.push('', 'Notes:', notes.trim())
  return lines.join('\n')
}

/** Commissioner scratchpad for watching an episode live (#737). Everything
 * here stays in this browser: it is a phone note, not league data. */
export function WatchPage() {
  const { profile } = useAuth()
  const [season, setSeason] = useState<Season | null>(null)
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [cast, setCast] = useState<CastMember[]>([])
  const [selected, setSelected] = useState(EVENTS[0].type)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        setSeason(active)
        if (!active) return
        const [members, episodes] = await Promise.all([
          api.get<CastMember[]>(`/seasons/${active.season_id}/cast`),
          api.get<Episode[]>(`/seasons/${active.season_id}/episodes`),
        ])
        setCast(members)
        // The airing episode is the one that has locked but isn't scored. Fall
        // back to the latest scheduled one so the page still works early.
        const ep = airingEpisode(episodes, active) ?? episodes.at(-1) ?? null
        setEpisode(ep)
        // Restored alongside the episode, not in its own effect, so the save
        // below never races an empty state onto a stored episode.
        if (ep) {
          try {
            const stored = JSON.parse(localStorage.getItem(storageKey(ep.id)) ?? '{}') as {
              counts?: Record<string, number>
              notes?: string
            }
            setCounts(stored.counts ?? {})
            setNotes(stored.notes ?? '')
          } catch {
            // Unreadable scratchpad, start clean.
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load the episode')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    if (!episode) return
    localStorage.setItem(storageKey(episode.id), JSON.stringify({ counts, notes }))
  }, [episode, counts, notes])

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load the episode">{error}</Notice>
  if (!profile?.is_admin) {
    return (
      <Notice tone="error" title="Commissioner access required">
        Your account is not authorized to score the league.
      </Notice>
    )
  }
  if (!season || !episode) return <ColdStart />

  const event = EVENTS.find((e) => e.type === selected) ?? EVENTS[0]
  const ranked = rankCast(cast)
  const active = ranked.filter((c) => c.eliminated_in_episode == null)
  const out = ranked.filter((c) => c.eliminated_in_episode != null)
  const text = summarize(episode, cast, counts, notes)

  function tap(id: string) {
    setCounts((prev) => ({ ...prev, [`${id}|${event.type}`]: nextCount(prev[`${id}|${event.type}`] ?? 0, event.perUnit) }))
    setCopied(false)
  }

  function castRow(member: CastMember) {
    const count = counts[`${member.id}|${event.type}`] ?? 0
    const eliminated = member.eliminated_in_episode != null
    return (
      <li key={member.id}>
        <button
          type="button"
          onClick={() => tap(member.id)}
          aria-pressed={count > 0}
          className={`flex min-h-14 w-full items-center justify-between gap-3 border-b border-cream-200 px-2 text-left transition-colors ${
            count > 0 ? 'bg-jade-50' : 'hover:bg-cream-100'
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={eliminated ? ELIMINATED_DIM : undefined}>
              <ContestantAvatar
                name={member.name}
                imageUrl={member.image_url}
                tribeColor={member.tribe_color}
                tribeName={member.tribe_name}
              />
            </span>
            <span className={`truncate font-display text-lg ${eliminated ? ELIMINATED_STRIKE : ''}`}>
              {member.name}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
              count > 0 ? 'bg-jade-600 text-white' : 'text-stone-300'
            }`}
          >
            {count > 0 ? (event.perUnit ? `x${count}` : '✓') : '·'}
          </span>
        </button>
      </li>
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={`Episode ${episode.episode_number}`}
        title="Watch tracker"
        description="The six things the import never proposes. Tap a castaway to record one. Everything stays on this device."
      />

      <div className="flex flex-wrap gap-2">
        {EVENTS.map((e) => (
          <button
            key={e.type}
            type="button"
            aria-pressed={e.type === selected}
            onClick={() => setSelected(e.type)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              e.type === selected
                ? 'border-terracotta-600 bg-terracotta-600 text-cream-50'
                : 'border-forest-200 bg-white text-forest-700 hover:bg-cream-100'
            }`}
          >
            {e.short} <span className="font-normal opacity-70">+{e.points}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-gray-600">{event.hint}</p>

      <ul className="mt-4 border-t border-cream-200">{active.map(castRow)}</ul>
      {out.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-gray-500">
            Already out ({out.length})
          </summary>
          <ul className="border-t border-cream-200">{out.map(castRow)}</ul>
        </details>
      )}

      <section className="mt-8">
        <h2 className="font-display text-2xl tracking-wide text-forest-900">Also worth a note</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
          {VERIFY.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setCopied(false) }}
          rows={4}
          aria-label="Notes"
          placeholder="Immunity winners, who was safe, anything to check"
          className="mt-3 w-full rounded-lg border border-forest-200 bg-white px-3 py-2 text-sm"
        />
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl tracking-wide text-forest-900">Hand off</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-cream-100 p-3 text-sm text-gray-700">{text}</pre>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => void copy()}
            className="min-h-11 rounded-lg bg-forest-700 px-4 text-sm font-semibold text-white hover:bg-forest-800"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear everything recorded for this episode?')) {
                setCounts({})
                setNotes('')
                setCopied(false)
              }
            }}
            className="min-h-11 rounded-lg border border-forest-200 px-4 text-sm font-semibold text-forest-700 hover:bg-cream-100"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  )
}
