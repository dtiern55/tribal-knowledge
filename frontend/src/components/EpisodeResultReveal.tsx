import { useEffect, useRef, useState } from 'react'
import { ADV_LABELS } from '../lib/advantages'
import type { EpisodeResult } from '../types'
import { ContestantAvatar } from './ContestantAvatar'

interface EpisodeResultRevealProps {
  result: EpisodeResult
  mode: 'automatic' | 'replay'
  onContinue?: () => Promise<void>
  onClose?: () => void
}

function points(value: number) {
  return `${value > 0 ? '+' : ''}${value} pts`
}

function ballotLabel(kind: EpisodeResult['ballot'][number]['prediction_type']) {
  if (kind === 'early_boot') return 'First boot'
  if (kind === 'fire_loss') return 'Fire-making loser'
  if (kind === 'winner') return 'Sole Survivor'
  return 'Elimination vote'
}

function incorrectBallotCopy(kind: EpisodeResult['ballot'][number]['prediction_type']) {
  if (kind === 'early_boot') return 'Not the first boot'
  if (kind === 'fire_loss') return 'Did not lose fire-making'
  if (kind === 'winner') return 'Did not win'
  return 'Not eliminated'
}

function rankCopy(result: EpisodeResult) {
  if (result.current_rank == null) return null
  if (result.prior_rank == null || result.rank_delta == null) {
    return `Now ranked #${result.current_rank}`
  }
  if (result.rank_delta > 0) {
    return `Up ${result.rank_delta} ${result.rank_delta === 1 ? 'spot' : 'spots'} to #${result.current_rank}`
  }
  if (result.rank_delta < 0) {
    const amount = Math.abs(result.rank_delta)
    return `Down ${amount} ${amount === 1 ? 'spot' : 'spots'} to #${result.current_rank}`
  }
  return `Held at #${result.current_rank}`
}

export function EpisodeResultReveal({
  result,
  mode,
  onContinue,
  onClose,
}: EpisodeResultRevealProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (mode !== 'replay' || !onClose) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mode, onClose])

  async function continueReveal() {
    if (!onContinue) return
    setSubmitting(true)
    setError(null)
    try {
      await onContinue()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not continue')
    } finally {
      setSubmitting(false)
    }
  }

  const correct = result.ballot.filter((pick) => pick.correct).length
  const rosterLane = result.roster_points + result.roster_adjustment_points
  const rank = rankCopy(result)

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 px-3 py-4 sm:px-6 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="episode-result-title"
    >
      <article
        className="reveal-enter mx-auto w-full max-w-5xl overflow-hidden rounded-2xl bg-sand-50 shadow-2xl"
      >
        <header className="relative overflow-hidden bg-gradient-to-br from-ocean-900 via-ocean-800 to-jungle-800 px-5 py-6 text-white sm:px-8 sm:py-8">
          <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-ember-500/20 blur-2xl" />
          <div className="relative">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember-200">
                Episode {result.episode_number} {mode === 'replay' ? 'replay' : 'results'}
              </p>
              {mode === 'replay' && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close episode replay"
                  className="shrink-0 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Close
                </button>
              )}
            </div>

            <h2
              id="episode-result-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-5 font-display text-3xl tracking-wide outline-none focus-visible:!outline-none sm:text-4xl"
            >
              {result.eliminated.length === 0
                ? 'No one was eliminated'
                : result.eliminated.length === 1
                  ? `${result.eliminated[0].name} was eliminated`
                  : `${result.eliminated.length} castaways were eliminated`}
            </h2>

            {result.eliminated.length > 1 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Eliminated castaways">
                {result.eliminated.map((castaway) => (
                  <li
                    key={castaway.contestant_id}
                    className="flex min-w-0 items-center gap-2 rounded-full bg-black/20 py-1 pl-1 pr-3 text-sm"
                  >
                    <ContestantAvatar
                      name={castaway.name}
                      imageUrl={castaway.image_url}
                      tribeColor={null}
                      tribeName={null}
                      size="sm"
                    />
                    <span className="truncate">{castaway.name}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-sm text-white/75">
              {result.ballot.length === 0
                ? 'You did not submit a ballot for this episode.'
                : `You called ${correct} of ${result.ballot.length} ballot ${result.ballot.length === 1 ? 'vote' : 'votes'} correctly.`}
            </p>

            <div className="mt-6 flex min-w-0 items-end justify-between gap-4 border-t border-white/15 pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                  Episode total
                </p>
                <p className="font-display text-5xl tracking-wide text-ember-200">
                  {result.total_points > 0 ? '+' : ''}{result.total_points}
                </p>
              </div>
              {rank && <p className="min-w-0 text-right text-sm font-semibold text-white">{rank}</p>}
            </div>
          </div>
        </header>

        <div className="px-4 py-5 sm:px-8 sm:py-7">
          <div
            className={
              result.insights && result.insights.length > 0
                ? 'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)] lg:items-start lg:gap-7'
                : ''
            }
          >
          <div
            className={
              result.insights && result.insights.length > 0
                ? 'space-y-5'
                : 'space-y-5 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4 lg:space-y-0'
            }
          >
          <ResultLane title="Roster earnings" total={rosterLane}>
            {result.roster.length === 0 && result.roster_adjustment_points === 0 ? (
              <p className="text-sm text-gray-500">No active roster members scored this episode.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {result.roster.map((member) => (
                  <ResultRow
                    key={member.contestant_id}
                    name={member.name}
                    imageUrl={member.image_url}
                    value={member.points}
                  />
                ))}
                {result.roster_adjustment_points !== 0 && (
                  <li className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-gray-600">Historical roster adjustment</span>
                    <span className="shrink-0 font-semibold text-gray-800">
                      {points(result.roster_adjustment_points)}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </ResultLane>

          <ResultLane title="Ballot earnings" total={result.ballot_points}>
            {result.ballot.length === 0 ? (
              <p className="text-sm text-gray-500">No ballot was submitted, so there are no ballot points.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {result.ballot.map((pick) => (
                  <li
                    key={`${pick.prediction_type}:${pick.contestant_id}`}
                    className="flex min-w-0 items-center gap-2 py-2"
                  >
                    <ContestantAvatar
                      name={pick.name}
                      imageUrl={pick.image_url}
                      tribeColor={null}
                      tribeName={null}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-800">{pick.name}</span>
                      <span className={`block text-xs ${pick.correct ? 'text-jungle-700' : 'text-gray-500'}`}>
                        {ballotLabel(pick.prediction_type)} · {pick.correct ? 'Correct' : incorrectBallotCopy(pick.prediction_type)}
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm font-semibold ${pick.correct ? 'text-jungle-700' : 'text-gray-500'}`}>
                      {points(pick.points)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ResultLane>

          <ResultLane title="Weekly play" total={result.weekly_play_bonus}>
            {result.weekly_plays.length === 0 ? (
              <p className="text-sm text-gray-500">No weekly play was used. Your base score is unchanged.</p>
            ) : (
              <ul className="space-y-2">
                {result.weekly_plays.map((play) => (
                  <li key={play.advantage_play_id} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">
                      {ADV_LABELS[play.advantage_type] ?? play.advantage_type.replace(/_/g, ' ')}
                    </span>
                    {play.target_name && <span> · {play.target_name}</span>}
                    {play.advantage_type === 'roster_swap' ? (
                      <span className="block text-xs text-gray-500">Used for this episode's roster swap.</span>
                    ) : (
                      <span className="block text-xs text-gray-500">
                        Added {points(play.bonus_points)} beyond the base score.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ResultLane>
          </div>

          {result.insights && result.insights.length > 0 && (
            <section aria-labelledby="episode-insights-title" className="mt-5 border-t border-sand-200 pt-5 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
              <h3 id="episode-insights-title" className="text-xs font-semibold uppercase tracking-wide text-ocean-700">
                Episode insight
              </h3>
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {result.insights.map((insight) => (
                  <li key={insight.id} className="rounded-xl bg-ocean-50 p-3">
                    <p className="text-xs text-ocean-700">{insight.label}</p>
                    <p className="mt-0.5 text-lg font-semibold text-ocean-900">{insight.value}</p>
                    {insight.detail && <p className="mt-1 text-xs text-gray-600">{insight.detail}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          </div>

          <div className="mt-5 border-t border-sand-200 pt-5">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-gray-900">
              <span>Roster + ballot + weekly play</span>
              <span className="shrink-0">{points(result.total_points)}</span>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            {mode === 'automatic' ? (
              <button
                type="button"
                onClick={() => void continueReveal()}
                disabled={submitting}
                className="mt-5 w-full rounded-xl bg-jungle-600 px-4 py-3 text-sm font-semibold text-white hover:bg-jungle-700 disabled:opacity-50"
              >
                {submitting ? 'Continuing…' : 'Continue'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="mt-5 w-full rounded-xl border border-ocean-300 bg-white px-4 py-3 text-sm font-semibold text-ocean-800 hover:bg-ocean-50"
              >
                Back to My Season
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  )
}

function ResultLane({
  title,
  total,
  children,
}: {
  title: string
  total: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-sand-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        <span className="shrink-0 text-sm font-semibold text-gray-900">{points(total)}</span>
      </div>
      {children}
    </section>
  )
}

function ResultRow({
  name,
  imageUrl,
  value,
}: {
  name: string
  imageUrl: string | null
  value: number
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 py-2">
      <ContestantAvatar
        name={name}
        imageUrl={imageUrl}
        tribeColor={null}
        tribeName={null}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{name}</span>
      <span className="shrink-0 text-sm font-semibold text-gray-800">{points(value)}</span>
    </li>
  )
}
