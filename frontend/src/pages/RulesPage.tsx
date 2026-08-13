import { useEffect, useState } from 'react'
import { PageLoader } from '../components/PageLoader'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { api, getActiveSeason } from '../lib/api'
import type { RulePredictionScore, RuleScoringEvent, RulesResponse } from '../types'

const PRED_GROUPS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: 'Weekly vote — predict who goes home',
    blurb: 'Each episode, before it airs, you vote for who you think gets voted out.',
    keys: ['correct_elimination'],
  },
  {
    title: 'Sole Survivor designation',
    blurb:
      'Designate one castaway on your roster before the designation locks. Their whole ' +
      'finale total is worth an extra 50% to you — including how they finish, so ' +
      'designating the eventual winner pays 120 rather than 80.',
    keys: [],
  },
  {
    title: 'Finale night ballot',
    blurb: 'Your three finale predictions: first boot, fire-making loser, and the winner.',
    keys: ['correct_early_boot', 'correct_fire_loss', 'correct_winner_vote'],
  },
]

function pts(v: number) {
  return `${v > 0 ? '+' : ''}${v}`
}

function EventRow({ e, showTokens = false }: { e: RuleScoringEvent; showTokens?: boolean }) {
  const post = e.postmerge_point_value
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-100 last:border-0">
      <span className="text-sm text-gray-700">
        {e.label}
        {e.is_per_unit && <span className="text-gray-500"> (per vote)</span>}
      </span>
      <span className="flex items-center gap-2 text-sm font-medium shrink-0">
        {e.point_value !== 0 || post != null ? (
          <span className={e.point_value >= 0 ? 'text-jungle-700' : 'text-red-500'}>
            {post != null && post !== e.point_value
              ? `${pts(e.point_value)} pre / ${pts(post)} post`
              : `${pts(e.point_value)} pts`}
          </span>
        ) : null}
        {showTokens && e.token_value !== 0 && (
          <span className="text-amber-500">+{e.token_value} tkn</span>
        )}
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
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ocean-700 border-l-2 border-ember-500 pl-2 mb-1">
        {title}
      </h2>
      {blurb && <p className="text-xs text-gray-500 mb-2">{blurb}</p>}
      {children ? (
        <div className="bg-white border border-sand-200 rounded-xl p-4">{children}</div>
      ) : null}
    </div>
  )
}

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

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load the rules">{error}</Notice>
  if (!rules) return <Notice title="No season found">Choose an active season from the menu.</Notice>

  const { season, scoring_events, prediction_scores, advantages } = rules
  const usesTokens = season.token_economy_enabled
  const rosterEvents = scoring_events.filter((e) => e.point_value !== 0)
  const tokenEvents = scoring_events.filter((e) => e.point_value === 0 && e.token_value !== 0)

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Rules & Scoring"
        description={
          <>
            You score in a few separate ways: your <b>roster</b> earns points each episode;
            your <b>weekly vote</b> predicts each boot; your <b>Sole Survivor designation</b>{' '}
            and the <b>finale ballot</b> pay off at the end.{' '}
            {usesTokens ? (
              <><b>Tokens</b> are the historical second currency used for advantages.</>
            ) : (
              <><b>One optional weekly play</b> can boost your roster, boost your ballot, or pay for a roster swap.</>
            )}
          </>
        }
      />

      <Section title="Season structure">
        <ul className="text-sm text-gray-700 space-y-1">
          <li>Roster size: <b>{season.roster_size}</b> castaways</li>
          <li>Rosters lock at episode <b>{season.roster_lock_episode ?? '—'}</b> (freely editable before then)</li>
          <li>Merge at episode <b>{season.merge_episode ?? '—'}</b></li>
          <li>
            Sole Survivor designation locks with advantages, at episode{' '}
            <b>{season.ss_lock_episode ?? season.advantage_lock_episode ?? 'the finale'}</b>
          </li>
          {usesTokens ? (
            <>
              <li>
                Roster swaps: <b>{season.swap_token_cost} tokens</b> each, up to{' '}
                <b>{season.max_swaps}</b>/season
                {season.swap_lock_episode != null && <>, locked from episode <b>{season.swap_lock_episode}</b></>}
              </li>
              <li>
                Advantages &amp; token earning stop at episode{' '}
                <b>{season.advantage_lock_episode ?? 'the finale'}</b>
              </li>
            </>
          ) : (
            <>
              <li>
                Roster swaps: the first <b>{season.free_swaps}</b>{' '}
                {season.free_swaps === 1 ? 'swap is' : 'swaps are'} free; each later swap uses that episode&apos;s weekly play
                {season.swap_lock_episode != null && <>, locked from episode <b>{season.swap_lock_episode}</b></>}
              </li>
              <li>
                Weekly plays stop at episode{' '}
                <b>{season.advantage_lock_episode ?? 'the finale'}</b>
              </li>
            </>
          )}
        </ul>
      </Section>

      <Section
        title="Roster points — your picked team"
        blurb="Your roster is the castaways you draft. They earn you points every episode for what they do in the game."
      >
        <ul>
          {rosterEvents.map((e) => (
            <EventRow key={e.event_type} e={e} showTokens={usesTokens} />
          ))}
        </ul>
      </Section>

      {PRED_GROUPS.map((g) => {
        const rows = prediction_scores.filter((p) => g.keys.includes(p.key))
        if (rows.length === 0 && g.keys.length > 0) return null
        return (
          <Section key={g.title} title={g.title} blurb={g.blurb}>
            {rows.length > 0 && <PredList rows={rows} />}
          </Section>
        )
      })}

      {usesTokens ? (
        <>
          <Section
            title="Tokens — the second currency"
            blurb="Separate from points: tokens were spent on advantages. This season granted an allocation each episode and could award tokens for configured roster events."
          >
            <ul>
              {tokenEvents.map((e) => (
                <EventRow key={e.event_type} e={e} showTokens />
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
                  <span className="text-sm font-medium text-amber-700 shrink-0">{a.token_cost} tkn</span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : (
        <Section
          title="Weekly play — one choice each episode"
          blurb="Your optional play does not carry over. Choose one of these, or leave it unused."
        >
          <ul className="text-sm text-gray-700 space-y-3">
            <li><b>Double Roster Points</b> — choose one active roster member and double that castaway&apos;s episode points.</li>
            <li><b>Double Vote Points</b> — double the points from every correct elimination pick on that episode&apos;s ballot.</li>
            <li><b>Roster Swap</b> — after your free {season.free_swaps === 1 ? 'swap' : 'swaps'} {season.free_swaps === 1 ? 'has' : 'have'} been used, a swap spends that episode&apos;s weekly play.</li>
          </ul>
        </Section>
      )}

      <Section title="Clarifications" blurb="A few rulings on how specific points are judged.">
        <ul className="text-sm text-gray-700 space-y-3">
          {usesTokens && (
            <li>
              <b>Personal background story</b> — counts when the episode airs pre-game
              footage or photos of a castaway and shares their life before the game.
            </li>
          )}
          <li>
            <b>Voting correctly</b> — the castaway voted for the person who was voted
            out. A <b>blindside</b> requires voting correctly <i>and</i> the eliminated
            player holding an active idol.
          </li>
          <li>
            <b>Quits &amp; removals</b> — if a castaway quits or is removed (medical,
            DQ, etc.), it counts as an <b>elimination</b>. Anyone who predicted them in
            the weekly vote still gets their <b>voted-correctly</b> points, same as a
            normal vote-out.
          </li>
          <li>
            <b>Saving someone with an idol</b> — counts whether a castaway saves
            themselves or someone else. The person the idol is played for must{' '}
            <b>receive votes</b>, and points apply only if they would have been eliminated
            without it. A deliberately shared idol can split the credit when judged a team effort.
          </li>
          {usesTokens && (
            <>
              <li>
                <b>Crying</b> — wet eyes alone do not count. It takes a real cry: a shed
                tear, an audible sob, or a breaking voice.
              </li>
              <li>
                <b>Extra votes</b> can be used until only <b>one selection remains</b> — you
                can never vote for every castaway still in the game.
              </li>
            </>
          )}
        </ul>
      </Section>

      <p className="text-xs text-gray-500 mt-8">
        Episode schedule and contestant photos via{' '}
        <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer" className="underline">
          TVmaze
        </a>{' '}
        (CC BY-SA).
      </p>
    </div>
  )
}
