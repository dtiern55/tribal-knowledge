import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { ColdStart } from '../components/ColdStart'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import type { RulePredictionScore, RuleScoringEvent, RulesResponse, Season } from '../types'

// Tribe scoring reads as groups of like events, not a leaderboard of values
// (#661). Order inside a group is the order listed here. Anything the season
// scores that is not named lands in "Other" so nothing goes missing.
const EVENT_GROUPS: [string, string[]][] = [
  ['Challenges', [
    'win_individual_immunity',
    'win_individual_reward',
    'win_team_immunity',
    'win_team_reward',
    'win_fire_making_challenge',
  ]],
  ['Tribal Council', [
    'vote_correctly_at_tribal',
    'blindside_with_active_idol',
    'shot_in_the_dark_success',
    'votes_received',
    'eliminated_holding_idol',
  ]],
  ['Idols and advantages', [
    'acquire_active_idol',
    'acquire_inactive_idol',
    'activate_inactive_idol',
    'acquire_extra_vote',
    'acquire_other_advantage',
    'play_idol',
    'votes_blocked_by_idol',
    'idol_played_successfully',
    'play_idol_nullifier',
    'nullifier_played_successfully',
    'play_other_advantage',
    'steal_immunity_idol',
    'fake_idol_played',
  ]],
  ['Making it far', [
    'return_from_redemption',
    'join_jury',
    'made_final_tribal',
    'runner_up',
    'won_season',
  ]],
  ['Moments', [
    'go_on_journey',
    'episode_title_quote',
    'read_treemail_or_instructions',
    'jeff_thats_how_you_do_it',
  ]],
]

const FINALE_KEYS = ['correct_final_four', 'correct_final_three', 'perfect_final_three', 'correct_winner_vote']

function pts(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

function EventRow({ event, showTokens = false }: { event: RuleScoringEvent; showTokens?: boolean }) {
  const post = event.postmerge_point_value
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-700">
        {event.label}{event.is_per_unit && <span className="text-gray-500"> each</span>}
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-2 text-sm font-semibold">
        {event.point_value !== 0 || post != null ? (
          <span className={event.point_value >= 0 ? 'text-jade-700' : 'text-terracotta-600'}>
            {post != null && post !== event.point_value
              ? `${pts(event.point_value)} before merge, ${pts(post)} after`
              : `${pts(event.point_value)} pts`}
          </span>
        ) : null}
        {showTokens && event.token_value !== 0 && <span className="text-gold-700">+{event.token_value} tokens</span>}
      </span>
    </li>
  )
}

function EventList({ events, showTokens }: { events: RuleScoringEvent[]; showTokens: boolean }) {
  return (
    <ul className="divide-y divide-cream-200 border-y border-cream-200">
      {events.map((event) => <EventRow key={event.event_type} event={event} showTokens={showTokens} />)}
    </ul>
  )
}

function PredictionList({ rows }: { rows: RulePredictionScore[] }) {
  return (
    <ul className="mt-3 divide-y divide-cream-200 border-y border-cream-200">
      {rows.map((row) => (
        <li key={row.key} className="flex items-start justify-between gap-4 py-2.5">
          <span className="text-sm text-gray-700">{row.key === 'correct_elimination' ? 'Correct pick' : row.label}</span>
          <span className="shrink-0 text-sm font-semibold text-jade-700">
            {row.postmerge_point_value != null && row.postmerge_point_value !== row.point_value
              ? `${pts(row.point_value)} before merge, ${pts(row.postmerge_point_value)} after`
              : `${pts(row.point_value)} pts`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RuleSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-cream-200 pb-8 last:border-0">
      <h2 id={`${id}-title`} className="font-display text-2xl tracking-wide text-forest-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function RuleList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">{children}</ul>
}

/** The escalating swap cost as a readable ladder (#404), e.g. "-10, -15, -20,
 *  then -25". Mirrors the backend: step * ordinal, floored. */
function swapCostLadder(season: Season) {
  const costs: number[] = []
  for (let n = season.free_swaps + 1; ; n++) {
    const cost = Math.max(season.swap_penalty_step * n, season.swap_penalty_floor)
    if (cost === season.swap_penalty_floor) {
      return costs.length ? `${costs.join(', ')}, then ${cost}` : `${cost} each`
    }
    costs.push(cost)
  }
}

/** "3 picks from Episode 2, 2 from Episode 6, 1 from Episode 11" (#269). */
function pickTiers(season: Season) {
  const tiers = [...season.elimination_pick_schedule].sort((a, b) => a.from_episode - b.from_episode)
  if (tiers.length === 0) return 'You get 3 picks an episode.'
  const parts = tiers.map((t, i) =>
    i === 0 ? `${t.picks} pick${t.picks === 1 ? '' : 's'} from Episode ${t.from_episode}` : `${t.picks} from Episode ${t.from_episode}`,
  )
  return `You get ${parts.join(', ')}.`
}

export function RulesPage() {
  const [rules, setRules] = useState<RulesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { hash } = useLocation()

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        if (active) setRules(await api.get<RulesResponse>(`/league-seasons/${active.id}/rules`))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load rules')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  // A deep link lands mid-page: scroll to the section and flash it. Done
  // with a class, not :target, because the router pushes the URL and
  // browsers only re-evaluate :target on a real fragment navigation.
  useEffect(() => {
    if (!rules || !hash) return
    const el = document.getElementById(hash.slice(1))
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    el.classList.remove('rule-flash')
    void el.offsetWidth // restart the animation when the hash changes in place
    el.classList.add('rule-flash')
  }, [rules, hash])

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load the rules">{error}</Notice>
  if (!rules) return <ColdStart />

  const { season, scoring_events, prediction_scores, advantages, has_redemption } = rules
  const usesTokens = season.token_economy_enabled
  const tribeEvents = scoring_events.filter(
    (event) => event.point_value !== 0 && (has_redemption || event.event_type !== 'return_from_redemption'),
  )
  const tokenEvents = scoring_events.filter((event) => event.point_value === 0 && event.token_value !== 0)
  const grouped = EVENT_GROUPS.map(([title, keys]) => [
    title,
    keys.map((key) => tribeEvents.find((e) => e.event_type === key)).filter((e): e is RuleScoringEvent => e != null),
  ] as const)
  const named = new Set(EVENT_GROUPS.flatMap(([, keys]) => keys))
  const other = tribeEvents.filter((e) => !named.has(e.event_type))
  const ballotScore = prediction_scores.find((score) => score.key === 'correct_elimination')
  const finaleScores = prediction_scores.filter((score) => FINALE_KEYS.includes(score.key))
  // Only the explicit lock is a fact. The words carry the rule for a live
  // season where the number is not known yet.
  const lastSwapEpisode = season.swap_lock_episode != null ? season.swap_lock_episode - 1 : null

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={season.name} title="Rules" />

      <section id="basics" aria-labelledby="basics-title" className="scroll-mt-24 border-y border-forest-200 py-5">
        <h2 id="basics-title" className="font-display text-2xl tracking-wide text-forest-900">How it works</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-gray-700">
          <p>
            You draft a tribe of {season.roster_size} castaways. They earn you points for what they do on the show:
            winning challenges, voting correctly, finding idols, making the merge.
          </p>
          <p>
            Every episode you also fill out a ballot. Each castaway you correctly call as the boot earns you points.
          </p>
          <p>
            Before each episode airs: submit your ballot, choose your advantage, and swap a tribe member if you want.
            Most points after the finale wins.
          </p>
        </div>
      </section>

      <div className="mt-8 space-y-8">
        <RuleSection id="tribe" title="Tribe">
          <RuleList>
            <li>
              Pick {season.roster_size} castaways. Your tribe locks before Episode {season.roster_lock_episode ?? 2}. Until then you can change it freely.
            </li>
            <li>A castaway scores for you only while they are on your tribe. A voted-out castaway stays on your tribe until you swap them out.</li>
            <li>The finale is worth a lot. Finalists score big for making final tribal, finishing runner-up, and winning.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="swaps" title="Swaps">
          <RuleList>
            {usesTokens ? (
              <li>A swap costs {season.swap_token_cost} tokens.</li>
            ) : (
              <li>
                You can swap one castaway per episode. The first {season.free_swaps === 1 ? 'swap is' : `${season.free_swaps} swaps are`} free.
                After that each swap costs points: {swapCostLadder(season)}.
              </li>
            )}
            <li>The cost comes off the castaway you drop, even if they were already voted out. You can undo a swap until the episode locks.</li>
            <li>
              Swaps close after the episode that follows the first juror being voted out.
              {lastSwapEpisode != null && ` Episode ${lastSwapEpisode} is the last one you can swap for.`} No swaps on the finale.
            </li>
          </RuleList>
        </RuleSection>

        <RuleSection id="ballot" title="Ballot">
          <RuleList>
            <li>Each episode, pick who you think is going home. {pickTiers(season)}</li>
            <li>
              Each correct pick scores on its own. Wrong picks cost nothing.
              {ballotScore && ballotScore.postmerge_point_value != null && ballotScore.postmerge_point_value !== ballotScore.point_value
                ? ` Before the merge a correct pick is worth ${ballotScore.point_value}. After the merge, ${ballotScore.postmerge_point_value}.`
                : ballotScore ? ` A correct pick is worth ${ballotScore.point_value}.` : ''}
            </li>
            <li>You can change your ballot until the episode locks. One episode is open at a time. The next opens once the last one is scored.</li>
            <li>The finale has its own ballot. See <a href="#finale" className="font-medium text-forest-700 underline underline-offset-2">Finale</a>.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="weekly-play" title={usesTokens ? 'Advantages and tokens' : 'Weekly advantage'}>
          {usesTokens ? (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-gray-700">This season uses tokens. Advantage costs and token scoring are listed below.</p>
              {tokenEvents.length > 0 && <EventList events={tokenEvents} showTokens />}
              <ul className="divide-y divide-cream-200 border-y border-cream-200">
                {advantages.map((advantage) => <li key={advantage.advantage_type} className="flex justify-between gap-3 py-2.5 text-sm"><span>{advantage.label}</span><b className="shrink-0 text-gold-700">{advantage.token_cost} tokens</b></li>)}
              </ul>
            </div>
          ) : (
            <RuleList>
              <li>Each episode you get one advantage. Use it or lose it. It does not carry over.</li>
              <li><b>Double Castaway Points:</b> one tribe member's points count double this episode.</li>
              <li><b>Extra Vote ×2:</b> add one more name to your ballot. If that name goes home, it pays double.</li>
              <li>
                You can change or remove it until the episode locks.
                {season.advantage_lock_episode != null && ` Advantages close at Episode ${season.advantage_lock_episode}.`} No advantage on the finale.
              </li>
            </RuleList>
          )}
        </RuleSection>

        <RuleSection id="sole-survivor" title="Sole Survivor">
          <RuleList>
            <li>Once the merge hits, name one castaway on your tribe as your Sole Survivor.</li>
            <li>Your Sole Survivor locks when swaps do. Once your tribe is final, so is your pick.</li>
            <li>At the finale, whatever your Sole Survivor scores, you get half again on top.</li>
            <li>If they are already out of the game, the bonus is zero.</li>
          </RuleList>
        </RuleSection>

        <RuleSection id="finale" title="Finale">
          <RuleList>
            <li>The finale ballot is a bracket, not a boot pick. Name your Final 4, your Final 3, and the winner.</li>
            <li>Each correct Final 4 name and Final 3 name scores on its own. Naming the exact Final 3 earns a bonus. The winner scores on top.</li>
            <li>No swaps and no advantage on the finale.</li>
          </RuleList>
          {finaleScores.length > 0 && <PredictionList rows={finaleScores} />}
        </RuleSection>

        <RuleSection id="scoring" title="Scoring">
          <p className="text-sm leading-6 text-gray-700">
            Your total is tribe points, plus ballot points, plus finale bracket points, plus your Sole Survivor bonus, minus any swap costs.
          </p>
          {tribeEvents.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No tribe scoring is set up for this season.</p>
          ) : (
            <div className="mt-5 space-y-6">
              {grouped.map(([title, events]) => events.length > 0 && (
                <div key={title}>
                  <h3 className="mb-2 font-semibold text-gray-900">{title}</h3>
                  <EventList events={events} showTokens={usesTokens} />
                </div>
              ))}
              {other.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold text-gray-900">Other</h3>
                  <EventList events={other} showTokens={usesTokens} />
                </div>
              )}
            </div>
          )}
          {ballotScore && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-900">Ballot picks</h3>
              <PredictionList rows={[ballotScore]} />
            </div>
          )}
        </RuleSection>

        <RuleSection id="rulings" title="Rulings">
          <RuleList>
            <li>
              <b>Merge:</b> "after merge" values start the episode the tribes become one
              {season.merge_episode != null ? ` (Episode ${season.merge_episode})` : ''}.
            </li>
            <li><b>Correct vote:</b> the castaway voted for the person who went home.</li>
            <li><b>Blindside:</b> the castaway voted correctly and the person who went home had an active idol.</li>
            <li><b>Quit or removal:</b> a quit, medical removal, or disqualification counts as a boot.</li>
            <li><b>Successful idol play:</b> the person the idol protected got votes and would have gone home without it.</li>
            <li><b>Idol nullifier voids a real idol:</b> the nullifier hit a castaway who played a real idol. Aimed at nothing, it scores the play alone.</li>
            {has_redemption && (
              <li>
                <b>Redemption Island:</b> a castaway sent to the island counts as the boot on your ballot but is still in the game.
                They stay on your tribe and keep scoring, and cannot be picked on a ballot while there.
                Coming back scores points. Losing there is the real elimination.
              </li>
            )}
            {usesTokens && <li><b>Personal background story:</b> the episode shows meaningful pre-game footage, photos, or life history.</li>}
            <li><b>Privacy:</b> nobody can see your tribe, ballot, advantage, or Sole Survivor until it locks.</li>
          </RuleList>
        </RuleSection>
      </div>
    </div>
  )
}
