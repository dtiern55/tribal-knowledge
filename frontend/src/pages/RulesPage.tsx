import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import type { RulePredictionScore, RuleScoringEvent, RulesResponse } from '../types'

// Prediction values grouped by concept, so distinct games aren't jumbled.
const PRED_GROUPS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: 'Weekly vote — predict who goes home',
    blurb: 'Each episode, before it airs, you vote for who you think gets voted out.',
    keys: ['correct_elimination'],
  },
  {
    title: 'Winner pick — call the winner early',
    blurb: 'One pick for who wins the whole game, locked in early and scored at the finale.',
    keys: ['winner_sole_survivor', 'winner_runner_up', 'winner_2nd_runner_up'],
  },
  {
    title: 'Sole Survivor designation',
    blurb:
      'Designate one castaway on your roster as your Sole Survivor before the designation ' +
      'locks — everything they score in the finale episode counts double for you, ' +
      'including these final-tribal bonuses.',
    keys: ['made_final_tribal', 'runner_up', 'sole_survivor_win'],
  },
  {
    title: 'Finale night ballot',
    blurb: 'Your three finale predictions: first boot, fire-making loser, and the winner.',
    keys: ['correct_early_boot', 'correct_fire_loss', 'correct_winner_vote'],
  },
  {
    title: 'Roster bonus — a castaway you rostered goes far',
    blurb: 'If someone on your team finishes 1st / 2nd / 3rd, you get bonus roster points.',
    keys: ['roster_placement_1', 'roster_placement_2', 'roster_placement_3'],
  },
]

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

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ocean-700 border-l-2 border-ember-500 pl-2 mb-1">
        {title}
      </h2>
      {blurb && <p className="text-xs text-gray-500 mb-2">{blurb}</p>}
      <div className="bg-white border border-sand-200 rounded-xl p-4">{children}</div>
    </div>
  )
}

// A grouped list of prediction values (points only), so distinct concepts
// aren't jumbled into one value-sorted heap.
function PredList({ rows }: { rows: RulePredictionScore[] }) {
  return (
    <ul>
      {rows.map((p) => (
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
      <p className="text-sm text-gray-500 mb-4">{season.name}</p>
      <p className="text-sm text-gray-600 mb-6 leading-relaxed">
        You score in a few separate ways: your <b>roster</b> (the team you draft) earns points
        each episode; your <b>weekly vote</b> predicts each boot; your{' '}
        {season.winner_mode === 'classic' ? (
          <b>winner pick</b>
        ) : (
          <b>Sole Survivor designation</b>
        )}{' '}
        and the <b>finale ballot</b> pay off at the end. <b>Tokens</b> are a separate currency
        you spend on advantages.
      </p>

      <Section title="Season structure">
        <ul className="text-sm text-gray-700 space-y-1">
          <li>Roster size: <b>{season.roster_size}</b> castaways</li>
          <li>Rosters lock at episode <b>{season.roster_lock_episode ?? '—'}</b> (freely editable before then)</li>
          <li>Merge at episode <b>{season.merge_episode ?? '—'}</b></li>
          {season.winner_mode === 'classic' ? (
            <li>Winner pick locks at episode <b>{season.winner_lock_episode ?? '—'}</b></li>
          ) : (
            <li>
              Sole Survivor designation locks with advantages, at episode{' '}
              <b>{season.ss_lock_episode ?? season.advantage_lock_episode ?? 'the finale'}</b>
            </li>
          )}
          <li>
            Roster swaps: <b>{season.swap_token_cost} tokens</b> each, up to{' '}
            <b>{season.max_swaps}</b>/season
            {season.swap_lock_episode != null && <>, locked from episode <b>{season.swap_lock_episode}</b></>}
          </li>
          <li>
            Advantages &amp; token earning stop at episode{' '}
            <b>{season.advantage_lock_episode ?? 'the finale'}</b>
          </li>
        </ul>
      </Section>

      <Section
        title="Roster points — your picked team"
        blurb="Your roster is the 5 castaways you draft. They earn you points every episode for what they do in the game."
      >
        <ul>
          {rosterEvents.map((e) => (
            <EventRow key={e.event_type} e={e} />
          ))}
        </ul>
      </Section>

      {PRED_GROUPS.map((g) => {
        const rows = prediction_scores.filter((p) => g.keys.includes(p.key))
        if (rows.length === 0) return null
        return (
          <Section key={g.title} title={g.title} blurb={g.blurb}>
            <PredList rows={rows} />
          </Section>
        )
      })}

      <Section
        title="Tokens — the second currency"
        blurb="Separate from points: tokens are spent on advantages. You get an allocation each episode, plus some for fun TV moments and game plays by your roster."
      >
        <ul>
          {tokenEvents.map((e) => (
            <EventRow key={e.event_type} e={e} />
          ))}
        </ul>
      </Section>

      <Section title="Advantages — spend your tokens" blurb="Bought with tokens and played on an upcoming episode.">
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
