import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import type { RuleScoringEvent, RulesResponse } from '../types'

function pts(v: number) {
  return `${v > 0 ? '+' : ''}${v}`
}

// One scoring-event row: points (with pre/post-merge split) and/or token value.
function EventRow({ e }: { e: RuleScoringEvent }) {
  const post = e.postmerge_point_value
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-100 last:border-0">
      <span className="text-sm text-gray-700">
        {e.label}
        {e.is_per_unit && <span className="text-gray-400"> (per vote)</span>}
      </span>
      <span className="flex items-center gap-2 text-sm font-medium shrink-0">
        {e.point_value !== 0 || post != null ? (
          <span className={e.point_value >= 0 ? 'text-jungle-700' : 'text-red-500'}>
            {post != null && post !== e.point_value
              ? `${pts(e.point_value)} pre / ${pts(post)} post`
              : `${pts(e.point_value)} pts`}
          </span>
        ) : null}
        {e.token_value !== 0 && <span className="text-amber-500">+{e.token_value} tkn</span>}
      </span>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ocean-700 mb-2">
        {title}
      </h2>
      <div className="bg-white border border-gray-200 rounded-xl p-4">{children}</div>
    </div>
  )
}

export function RulesPage() {
  const [rules, setRules] = useState<RulesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        if (active) setRules(await api.get<RulesResponse>(`/seasons/${active.id}/rules`))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load rules')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!rules) return <p className="text-gray-500">No season found.</p>

  const { season, scoring_events, prediction_scores, advantages } = rules
  const rosterEvents = scoring_events.filter((e) => e.point_value !== 0)
  const tokenEvents = scoring_events.filter((e) => e.point_value === 0 && e.token_value !== 0)

  return (
    <div>
      <h1 className="font-display text-3xl tracking-wide text-ocean-800 mb-1">Rules & Scoring</h1>
      <p className="text-sm text-gray-500 mb-6">{season.name}</p>

      <Section title="Season structure">
        <ul className="text-sm text-gray-700 space-y-1">
          <li>Roster size: <b>{season.roster_size}</b> castaways</li>
          <li>Rosters lock at episode <b>{season.roster_lock_episode ?? '—'}</b> (freely editable before then)</li>
          <li>Merge at episode <b>{season.merge_episode ?? '—'}</b></li>
          <li>Winner pick locks at episode <b>{season.winner_lock_episode ?? '—'}</b></li>
          <li>
            Roster swaps: <b>{season.swap_penalty_points} pts</b> each, up to{' '}
            <b>{season.max_swaps}</b>/season
            {season.swap_lock_episode != null && <>, locked from episode <b>{season.swap_lock_episode}</b></>}
          </li>
          <li>
            Advantages &amp; token earning stop at episode{' '}
            <b>{season.advantage_lock_episode ?? 'the finale'}</b>
          </li>
        </ul>
      </Section>

      <Section title="Roster scoring (your picked team)">
        <ul>
          {rosterEvents.map((e) => (
            <EventRow key={e.event_type} e={e} />
          ))}
        </ul>
      </Section>

      <Section title="Predictions & finale">
        <ul>
          {prediction_scores.map((p) => (
            <li
              key={p.key}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-100 last:border-0"
            >
              <span className="text-sm text-gray-700">{p.label}</span>
              <span className="text-sm font-medium text-jungle-700 shrink-0">
                {p.postmerge_point_value != null && p.postmerge_point_value !== p.point_value
                  ? `${pts(p.point_value)} pre / ${pts(p.postmerge_point_value)} post`
                  : `${pts(p.point_value)} pts`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tokens — earn by watching (TV moments & game plays)">
        <ul>
          {tokenEvents.map((e) => (
            <EventRow key={e.event_type} e={e} />
          ))}
        </ul>
      </Section>

      <Section title="Advantages — spend tokens">
        <ul>
          {advantages.map((a) => (
            <li
              key={a.advantage_type}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-100 last:border-0"
            >
              <span className="text-sm text-gray-700">{a.label}</span>
              <span className="text-sm font-medium text-amber-600 shrink-0">{a.token_cost} tkn</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
