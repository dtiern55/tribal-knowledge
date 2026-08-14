import { useEffect, useState } from 'react'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import type { RulePredictionScore, RuleScoringEvent, RulesResponse } from '../types'

const CONTENTS = [
  ['roster', 'Roster'],
  ['ballot', 'Weekly ballot'],
  ['weekly-play', 'Weekly play'],
  ['swaps-locks', 'Swaps and locks'],
  ['scoring', 'Scoring'],
  ['finale', 'Finale'],
  ['privacy', 'Privacy'],
  ['rulings', 'Scoring rulings'],
] as const

function pts(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

function EventRow({ event, showTokens = false }: { event: RuleScoringEvent; showTokens?: boolean }) {
  const post = event.postmerge_point_value
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-700">
        {event.label}{event.is_per_unit && <span className="text-gray-500"> per vote</span>}
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-2 text-sm font-semibold">
        {event.point_value !== 0 || post != null ? (
          <span className={event.point_value >= 0 ? 'text-jungle-700' : 'text-red-600'}>
            {post != null && post !== event.point_value
              ? `${pts(event.point_value)} before merge, ${pts(post)} after merge`
              : `${pts(event.point_value)} pts`}
          </span>
        ) : null}
        {showTokens && event.token_value !== 0 && <span className="text-amber-700">+{event.token_value} tokens</span>}
      </span>
    </li>
  )
}

function PredictionList({ rows }: { rows: RulePredictionScore[] }) {
  return (
    <ul className="mt-3 divide-y divide-sand-200 border-y border-sand-200">
      {rows.map((row) => (
        <li key={row.key} className="flex items-start justify-between gap-4 py-2.5">
          <span className="text-sm text-gray-700">{row.key === 'correct_elimination' ? 'Correct vote' : row.label}</span>
          <span className="shrink-0 text-sm font-semibold text-jungle-700">
            {row.postmerge_point_value != null && row.postmerge_point_value !== row.point_value
              ? `${pts(row.point_value)} before merge, ${pts(row.postmerge_point_value)} after merge`
              : `${pts(row.point_value)} pts`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RuleSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-sand-200 pb-8 last:border-0">
      <h2 id={`${id}-title`} className="font-display text-2xl tracking-wide text-ocean-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function RuleList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">{children}</ul>
}

function configuredEpisode(value: number | null | undefined, fallback = 'Finale') {
  return value == null ? fallback : `Episode ${value}`
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
  const swapLock = season.swap_lock_episode ?? (season.merge_episode == null ? null : season.merge_episode + 2)
  const soleSurvivorLock = season.ss_lock_episode ?? season.advantage_lock_episode

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={season.name} title="Rules" />

      <section aria-labelledby="how-to-play-title" className="border-y border-ocean-200 py-5">
        <h2 id="how-to-play-title" className="font-display text-2xl tracking-wide text-ocean-900">How to play</h2>
        <ol className="mt-4 space-y-4">
          <li className="flex gap-3">
            <span className="font-semibold text-ocean-700">1.</span>
            <div><h3 className="font-semibold text-gray-900">Pick your roster</h3><p className="mt-1 text-sm leading-6 text-gray-600">Choose {season.roster_size} castaways. They score points for what they do in the game.</p></div>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-ocean-700">2.</span>
            <div><h3 className="font-semibold text-gray-900">Submit a weekly ballot</h3><p className="mt-1 text-sm leading-6 text-gray-600">Vote for the castaways you think will be eliminated.</p></div>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-ocean-700">3.</span>
            <div>
              <h3 className="font-semibold text-gray-900">{usesTokens ? 'Use an advantage' : 'Choose a weekly play'}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {usesTokens ? 'Spend tokens on an available advantage.' : 'Use one optional advantage on your roster, ballot, or a roster swap.'}
              </p>
            </div>
          </li>
        </ol>
      </section>

      <nav aria-label="Rules contents" className="border-b border-sand-200 py-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {CONTENTS.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="text-sm font-medium text-ocean-700 underline decoration-ocean-200 underline-offset-4 hover:text-ocean-900">{label}</a></li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 space-y-8">
        <RuleSection id="roster" title="Roster">
          <RuleList>
            <li>Choose exactly {season.roster_size} castaways before {configuredEpisode(season.roster_lock_episode, 'the roster lock')} locks.</li>
            <li>You can replace the full roster before the roster lock.</li>
            <li>A castaway scores only while they are on your active roster.</li>
            <li>An eliminated castaway stays on your roster until you swap them out.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="ballot" title="Weekly ballot">
          <RuleList>
            <li>One episode is open at a time. The next episode opens after the current episode is scored.</li>
            <li>Vote for up to the limit shown on the ballot. You may submit fewer votes.</li>
            <li>Each correct vote scores separately. An incorrect vote scores zero.</li>
            <li>You can edit the ballot until the episode lock.</li>
          </RuleList>
          {ballotScores.length > 0 && <PredictionList rows={ballotScores} />}
        </RuleSection>

        <RuleSection id="weekly-play" title={usesTokens ? 'Advantages and tokens' : 'Weekly play'}>
          {usesTokens ? (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-gray-700">This season uses tokens. Advantage costs and token scoring are listed below.</p>
              {tokenEvents.length > 0 && <ul className="divide-y divide-sand-200 border-y border-sand-200">{tokenEvents.map((event) => <EventRow key={event.event_type} event={event} showTokens />)}</ul>}
              <ul className="divide-y divide-sand-200 border-y border-sand-200">
                {advantages.map((advantage) => <li key={advantage.advantage_type} className="flex justify-between gap-3 py-2.5 text-sm"><span>{advantage.label}</span><b className="shrink-0 text-amber-700">{advantage.token_cost} tokens</b></li>)}
              </ul>
            </div>
          ) : (
            <div className="space-y-4 text-sm leading-6 text-gray-700">
              <p>You have one optional weekly play for each eligible episode. It does not carry over.</p>
              <dl className="divide-y divide-sand-200 border-y border-sand-200">
                <div className="py-3"><dt className="font-semibold text-gray-900">Double Roster Points</dt><dd className="mt-1">Double one active roster member's points for the episode.</dd></div>
                <div className="py-3"><dt className="font-semibold text-gray-900">Double Vote Points</dt><dd className="mt-1">Double every correct vote on the episode ballot. This does not add a vote.</dd></div>
                <div className="py-3"><dt className="font-semibold text-gray-900">Roster Swap</dt><dd className="mt-1">Use the weekly play for a swap after your free {season.free_swaps === 1 ? 'swap' : 'swaps'}.</dd></div>
              </dl>
              <p>Double plays can be changed or removed before the episode lock. A roster swap takes effect when submitted.</p>
            </div>
          )}
        </RuleSection>

        <RuleSection id="swaps-locks" title="Swaps and locks">
          <RuleList>
            <li>{season.free_swaps === 0 ? 'There are no free midseason swaps.' : `The first ${season.free_swaps} midseason ${season.free_swaps === 1 ? 'swap is' : 'swaps are'} free.`}</li>
            {!usesTokens && <li>Each later swap uses the weekly play for the open episode.</li>}
            <li>A swap takes effect in the open episode. The incoming castaway must still be in the game and cannot have been on your roster before.</li>
            <li>Swaps close at {configuredEpisode(swapLock)}. The finale never allows swaps.</li>
            {!usesTokens && <li>Weekly plays close at {configuredEpisode(season.advantage_lock_episode)}. The finale never allows a weekly play.</li>}
            <li>At the episode lock, the ballot and weekly play become final. The next episode stays closed until scoring is complete.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="scoring" title="Scoring">
          <p className="text-sm leading-6 text-gray-700">Your total is roster points, weekly ballot points, and finale ballot points.</p>
          <h3 className="mt-5 font-semibold text-gray-900">Roster scoring</h3>
          {rosterEvents.length > 0 ? (
            <ul className="mt-2 divide-y divide-sand-200 border-y border-sand-200">{rosterEvents.map((event) => <EventRow key={event.event_type} event={event} showTokens={usesTokens} />)}</ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No roster scoring is available for this season.</p>
          )}
          <RuleList>
            <li>Double Roster Points is included in roster points.</li>
            <li>Double Vote Points is included in weekly ballot points.</li>
            <li>Finale ballot points are scored separately from roster points.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="finale" title="Finale">
          <h3 className="font-semibold text-gray-900">Sole Survivor</h3>
          <RuleList>
            <li>Choose one castaway who is still in the game and on your active roster before {configuredEpisode(soleSurvivorLock)} locks.</li>
            <li>The choice adds 50% of that castaway's finale roster points, rounded once.</li>
            <li>If the castaway earns no finale roster points, the bonus is zero.</li>
          </RuleList>
          <h3 className="mt-6 font-semibold text-gray-900">Finale ballot</h3>
          <RuleList>
            <li>The finale ballot replaces the weekly ballot.</li>
            <li>Predict the first finale boot, the fire-making loser, and the season winner.</li>
            <li>Each correct prediction scores separately.</li>
          </RuleList>
          {finaleScores.length > 0 && <PredictionList rows={finaleScores} />}
        </RuleSection>

        <RuleSection id="privacy" title="Privacy">
          <RuleList>
            <li>Initial rosters are hidden from other players until the roster lock.</li>
            <li>Roster changes are visible after the initial roster lock.</li>
            <li>Weekly ballots and double plays are hidden until that episode locks.</li>
            <li>The Sole Survivor choice is hidden until its lock.</li>
            <li>The finale ballot is hidden until the finale locks.</li>
            <li>Vote totals and other aggregate data appear only after scoring.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="rulings" title="Scoring rulings">
          <RuleList>
            <li><b>Correct vote:</b> The castaway voted for the person who was eliminated.</li>
            <li><b>Blindside:</b> The castaway voted correctly and the eliminated player had an active idol.</li>
            <li><b>Quit or removal:</b> A quit, medical removal, or disqualification counts as an elimination.</li>
            <li><b>Successful idol play:</b> The protected person received votes and would have been eliminated. Shared credit may be used for a deliberate team play.</li>
            {usesTokens && <li><b>Personal background story:</b> The episode shows meaningful pre-game footage, photos, or life history.</li>}
          </RuleList>
        </RuleSection>
      </div>

      <p className="mt-10 text-xs text-gray-500">Episode schedule and contestant photos from <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer" className="underline">TVmaze</a> under CC BY-SA.</p>
    </div>
  )
}
