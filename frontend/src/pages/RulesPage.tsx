import { useEffect, useState } from 'react'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import type { RulePredictionScore, RuleScoringEvent, RulesResponse } from '../types'

const CONTENTS = [
  ['roster', 'Roster'],
  ['ballot', 'Ballot'],
  ['weekly-play', 'Weekly play'],
  ['swaps-locks', 'Swaps & locks'],
  ['finale', 'Finale'],
  ['privacy', 'Privacy'],
  ['clarifications', 'Clarifications'],
] as const

function pts(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

function EventRow({ event, showTokens = false }: { event: RuleScoringEvent; showTokens?: boolean }) {
  const post = event.postmerge_point_value
  return (
    <li className="flex items-start justify-between gap-4 border-b border-sand-100 py-2.5 last:border-0">
      <span className="text-sm text-gray-700">
        {event.label}{event.is_per_unit && <span className="text-gray-500"> (per vote)</span>}
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-2 text-sm font-semibold">
        {event.point_value !== 0 || post != null ? (
          <span className={event.point_value >= 0 ? 'text-jungle-700' : 'text-red-600'}>
            {post != null && post !== event.point_value
              ? `${pts(event.point_value)} pre-merge / ${pts(post)} post-merge`
              : `${pts(event.point_value)} pts`}
          </span>
        ) : null}
        {showTokens && event.token_value !== 0 && <span className="text-amber-600">+{event.token_value} tokens</span>}
      </span>
    </li>
  )
}

function PredictionList({ rows }: { rows: RulePredictionScore[] }) {
  return (
    <ul className="mt-3 rounded-xl border border-sand-200 bg-sand-50 px-4">
      {rows.map((row) => (
        <li key={row.key} className="flex items-start justify-between gap-4 border-b border-sand-200 py-2.5 last:border-0">
          <span className="text-sm text-gray-700">{row.label}</span>
          <span className="shrink-0 text-sm font-semibold text-jungle-700">
            {row.postmerge_point_value != null && row.postmerge_point_value !== row.point_value
              ? `${pts(row.point_value)} pre / ${pts(row.postmerge_point_value)} post`
              : `${pts(row.point_value)} pts`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RuleSection({
  id,
  eyebrow,
  title,
  summary,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-sand-200 pb-9 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-700">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-1 font-display text-2xl tracking-wide text-ocean-900 md:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">{summary}</p>
      <div className="mt-5">{children}</div>
    </section>
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

  useEffect(() => {
    if (!rules || !window.location.hash) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [rules])

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load the rules">{error}</Notice>
  if (!rules) return <Notice title="No season found">Choose an active season from the menu.</Notice>

  const { season, scoring_events, prediction_scores, advantages } = rules
  const usesTokens = season.token_economy_enabled
  const rosterEvents = scoring_events.filter((event) => event.point_value !== 0)
  const tokenEvents = scoring_events.filter((event) => event.point_value === 0 && event.token_value !== 0)
  const ballotScores = prediction_scores.filter((score) => score.key === 'correct_elimination')
  const finaleScores = prediction_scores.filter((score) => ['correct_early_boot', 'correct_fire_loss', 'correct_winner_vote'].includes(score.key))
  const pickSchedule = [...(season.elimination_pick_schedule ?? [])].sort((a, b) => a.from_episode - b.from_episode)

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Rules & scoring"
        description="A practical guide to making your weekly decisions and understanding where your points come from."
      />

      <section aria-labelledby="quick-start-title" className="mb-8 rounded-2xl border border-ocean-200 bg-ocean-50 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">The short version</p>
        <h2 id="quick-start-title" className="mt-1 font-display text-2xl tracking-wide text-ocean-900">Three separate decisions</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            ['1', 'Build a roster', `${season.roster_size} castaways earn points from what they do in the game.`],
            ['2', 'Submit a ballot', 'Predict who will be eliminated. Every correct prediction scores independently.'],
            ['3', usesTokens ? 'Use advantages' : 'Choose a weekly play', usesTokens ? 'Spend this historical season’s tokens on configured advantages.' : 'Optionally boost one roster member, boost every correct ballot pick, or fund a paid swap.'],
          ].map(([number, title, copy]) => (
            <div key={number} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ocean-700 text-sm font-bold text-white">{number}</span>
              <div><h3 className="font-semibold text-gray-900">{title}</h3><p className="mt-1 text-sm leading-relaxed text-gray-600">{copy}</p></div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Rules contents" className="rounded-xl border border-sand-200 bg-white p-3 lg:sticky lg:top-20">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">On this page</p>
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {CONTENTS.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block rounded-lg px-2 py-2 text-sm text-ocean-700 hover:bg-ocean-50 hover:text-ocean-900">{label}</a></li>)}
          </ul>
        </nav>

        <div className="min-w-0 space-y-9">
          <RuleSection id="roster" eyebrow="Season-long team" title="Roster" summary={`Choose ${season.roster_size} castaways. Their in-show actions earn your roster points; your ballot predictions are a separate score.`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-sand-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Roster size</p><p className="mt-1 text-2xl font-bold text-ocean-900">{season.roster_size}</p></div>
              <div className="rounded-xl border border-sand-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Initial roster lock</p><p className="mt-1 text-lg font-bold text-ocean-900">{season.roster_lock_episode == null ? 'Not configured' : `Episode ${season.roster_lock_episode}`}</p></div>
            </div>
            <h3 className="mt-6 font-semibold text-gray-900">Roster scoring events</h3>
            {rosterEvents.length > 0 ? <ul className="mt-2 rounded-xl border border-sand-200 bg-white px-4">{rosterEvents.map((event) => <EventRow key={event.event_type} event={event} showTokens={usesTokens} />)}</ul> : <p className="mt-2 text-sm text-gray-500">No roster scoring events are configured.</p>}
          </RuleSection>

          <RuleSection id="ballot" eyebrow="Every playable episode" title="Ballot" summary="Choose the castaways you think will be eliminated. A correct pick earns the configured elimination-prediction points; an incorrect pick earns zero.">
            <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
              <li>• You may use fewer than the available picks, but you must save the ballot before its episode lock.</li>
              <li>• If several castaways leave in one episode, every correct pick scores independently.</li>
              <li>• The episode itself remains authoritative about the exact number of picks available.</li>
            </ul>
            {pickSchedule.length > 0 && <div className="mt-4 rounded-xl border border-sand-200 bg-sand-50 p-4"><h3 className="text-sm font-semibold text-gray-900">Configured pick schedule</h3><ul className="mt-2 flex flex-wrap gap-2">{pickSchedule.map((tier) => <li key={tier.from_episode} className="rounded-full bg-white px-3 py-1.5 text-xs text-gray-700 ring-1 ring-sand-200">From episode {tier.from_episode}: <b>{tier.picks}</b> {tier.picks === 1 ? 'pick' : 'picks'}</li>)}</ul></div>}
            {ballotScores.length > 0 && <PredictionList rows={ballotScores} />}
          </RuleSection>

          <RuleSection id="weekly-play" eyebrow="Optional weekly decision" title={usesTokens ? 'Advantages & tokens' : 'Weekly play'} summary={usesTokens ? 'This historical season uses its snapshotted token economy. Token rules stay attached to that season and do not apply to current weekly-play seasons.' : 'You receive one optional play per episode. It does not carry over, and only one of the three choices can be used.'}>
            {usesTokens ? (
              <div className="space-y-5">
                {tokenEvents.length > 0 && <ul className="rounded-xl border border-sand-200 bg-white px-4">{tokenEvents.map((event) => <EventRow key={event.event_type} event={event} showTokens />)}</ul>}
                <ul className="rounded-xl border border-sand-200 bg-white px-4">{advantages.map((advantage) => <li key={advantage.advantage_type} className="flex justify-between gap-3 border-b border-sand-100 py-2.5 text-sm last:border-0"><span>{advantage.label}</span><b className="shrink-0 text-amber-700">{advantage.token_cost} tokens</b></li>)}</ul>
              </div>
            ) : (
              <ol className="grid gap-3 md:grid-cols-3">
                <li className="rounded-xl border border-sand-200 bg-white p-4"><h3 className="font-semibold text-gray-900">Double Roster Points</h3><p className="mt-2 text-sm leading-relaxed text-gray-600">Choose one active roster member. That castaway’s episode roster points count twice.</p></li>
                <li className="rounded-xl border border-sand-200 bg-white p-4"><h3 className="font-semibold text-gray-900">Double Vote Points</h3><p className="mt-2 text-sm leading-relaxed text-gray-600">Double the points from every correct elimination pick on that episode’s ballot. It does not add a pick or target one selection.</p></li>
                <li className="rounded-xl border border-sand-200 bg-white p-4"><h3 className="font-semibold text-gray-900">Roster Swap</h3><p className="mt-2 text-sm leading-relaxed text-gray-600">After your free {season.free_swaps === 1 ? 'swap is' : 'swaps are'} used, a swap consumes that episode’s weekly play.</p></li>
              </ol>
            )}
          </RuleSection>

          <RuleSection id="swaps-locks" eyebrow="When choices become final" title="Swaps & locks" summary="Each episode’s displayed lock time controls its ballot and weekly play. Once locked, the episode is read-only until scoring is complete.">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-sand-200 bg-white p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Free swaps</dt><dd className="mt-1 text-xl font-bold text-ocean-900">{season.free_swaps}</dd></div>
              <div className="rounded-xl border border-sand-200 bg-white p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Swap lock</dt><dd className="mt-1 text-lg font-bold text-ocean-900">{season.swap_lock_episode == null ? 'Not configured' : `Episode ${season.swap_lock_episode}`}</dd></div>
              <div className="rounded-xl border border-sand-200 bg-white p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Weekly-play cutoff</dt><dd className="mt-1 text-lg font-bold text-ocean-900">{season.advantage_lock_episode == null ? 'Finale' : `Episode ${season.advantage_lock_episode}`}</dd></div>
              <div className="rounded-xl border border-sand-200 bg-white p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sole Survivor lock</dt><dd className="mt-1 text-lg font-bold text-ocean-900">{season.ss_lock_episode ?? season.advantage_lock_episode ? `Episode ${season.ss_lock_episode ?? season.advantage_lock_episode}` : 'Finale'}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-gray-600">A free swap does not consume the weekly play. Later swaps do, and take effect with the next episode.</p>
          </RuleSection>

          <RuleSection id="finale" eyebrow="Endgame" title="Sole Survivor & finale ballot" summary="These are two different finale decisions: one boosts a roster member’s finale contribution; the other predicts finale outcomes.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-sand-200 bg-white p-4"><h3 className="font-semibold text-gray-900">Sole Survivor designation</h3><p className="mt-2 text-sm leading-relaxed text-gray-600">Designate one eligible castaway on your roster before the designation lock. That castaway’s entire finale-episode roster contribution is doubled. If they are no longer active at the finale, doubling zero still earns zero.</p></div>
              <div className="rounded-xl border border-sand-200 bg-white p-4"><h3 className="font-semibold text-gray-900">Finale ballot</h3><p className="mt-2 text-sm leading-relaxed text-gray-600">Predict the first finale boot, the fire-making loser, and the season winner. This replaces the normal weekly elimination ballot for the finale.</p>{finaleScores.length > 0 && <PredictionList rows={finaleScores} />}</div>
            </div>
          </RuleSection>

          <RuleSection id="privacy" eyebrow="Fair play" title="What stays private" summary="Your unlocked decisions remain yours until acting on that information can no longer affect the episode.">
            <ul className="space-y-3 text-sm leading-relaxed text-gray-700">
              <li><b>Before lock:</b> other players cannot see your roster, ballot, or weekly-play choice.</li>
              <li><b>After lock:</b> player choices may be revealed because the episode is read-only.</li>
              <li><b>After scoring:</b> aggregate pick statistics belong in Reveal or scored-history contexts, never in the open or merely locked decision flow.</li>
            </ul>
          </RuleSection>

          <RuleSection id="clarifications" eyebrow="Commissioner rulings" title="Clarifications" summary="These rulings explain how less obvious scoring events are judged.">
            <ul className="space-y-4 text-sm leading-relaxed text-gray-700">
              <li><b>Voting correctly:</b> the castaway voted for the person who was eliminated. A blindside requires voting correctly and the eliminated player holding an active idol.</li>
              <li><b>Quits and removals:</b> a quit, medical removal, or disqualification counts as an elimination. A ballot that correctly predicted that castaway still scores.</li>
              <li><b>Saving someone with an idol:</b> the protected person must receive votes and would otherwise have been eliminated. A deliberately shared idol can split credit when judged a team effort.</li>
              {usesTokens && <li><b>Personal background story:</b> counts when an episode shares meaningful pre-game footage, photos, or life history about a castaway.</li>}
            </ul>
          </RuleSection>
        </div>
      </div>

      <p className="mt-10 text-xs text-gray-500">Episode schedule and contestant photos via <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer" className="underline">TVmaze</a> (CC BY-SA).</p>
    </div>
  )
}
