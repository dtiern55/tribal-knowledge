import { useEffect, useRef, useState } from 'react'
import { ADV_LABELS } from '../lib/advantages'
import type { EpisodeResult, EpisodeResultBreakdownLine } from '../types'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from './ContestantAvatar'

/** Compact signed score used all over the card — no "pts" noise (#477). */
function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

const NUMBER_WORDS = ['zero', 'one', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

/** The headline is the night's story: name the one boot, count the torches
 *  beyond that (#477). */
function snuffedHeadline(eliminated: EpisodeResult['eliminated']) {
  if (eliminated.length === 0) return 'No one was voted out'
  if (eliminated.length === 1) return `${eliminated[0].name}'s torch was snuffed`
  const count = NUMBER_WORDS[eliminated.length] ?? String(eliminated.length)
  return `${count} torches snuffed`
}

/** Finale ballots predict different things (winner, fire, first boot); a plain
 *  weekly elimination vote needs no label — the points already say it. */
function ballotTypeLabel(kind: EpisodeResult['ballot'][number]['prediction_type']) {
  if (kind === 'early_boot') return 'First boot'
  if (kind === 'fire_loss') return 'Fire-making loser'
  if (kind === 'winner') return 'Sole Survivor'
  return null
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

  const rosterLane = result.roster_points + result.roster_adjustment_points
  const eliminatedIds = new Set(result.eliminated.map((e) => e.contestant_id))
  const insights = result.insights ?? []
  const delta = result.rank_delta

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 px-3 py-4 sm:px-6 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="episode-result-title"
    >
      <article className="reveal-enter mx-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-[#122318] text-cream-100 shadow-2xl ring-1 ring-white/10">
        {/* ── Header: the torchlit night, kept from the old recap ── */}
        <header className="relative overflow-hidden bg-gradient-to-br from-forest-900 via-forest-800 to-jade-800 px-5 py-6 text-white sm:px-8 sm:py-7">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-terracotta-500/25 blur-2xl" />
          <div className="relative">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-200">
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
              {snuffedHeadline(result.eliminated)}
            </h2>

            {result.eliminated.length > 1 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Eliminated castaways">
                {result.eliminated.map((castaway) => (
                  <li
                    key={castaway.contestant_id}
                    className="flex min-w-0 items-center gap-2 rounded-full bg-black/25 py-1 pl-1 pr-3 text-sm ring-1 ring-white/10"
                  >
                    <span className="grayscale opacity-80">
                      <ContestantAvatar
                        name={castaway.name}
                        imageUrl={castaway.image_url}
                        tribeColor={null}
                        tribeName={null}
                        size="sm"
                      />
                    </span>
                    <span className={`truncate ${ELIMINATED_STRIKE}`}>{castaway.name}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex min-w-0 items-end justify-between gap-4 border-t border-white/15 pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                  Your episode
                </p>
                <p className="font-display text-5xl leading-none tracking-wide text-terracotta-200 tabular-nums">
                  {signed(result.total_points)}
                </p>
              </div>
              {result.current_rank != null && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-jade-200/35 bg-jade-600/25 px-3 py-1.5 font-display text-sm font-semibold text-jade-100">
                  {delta != null && delta !== 0 && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {delta > 0 ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
                    </svg>
                  )}
                  {delta != null && delta !== 0
                    ? `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} · `
                    : ''}
                  <span className="text-white">#{result.current_rank}</span>
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ── Body: one dark scorecard ── */}
        <div className="px-4 py-5 sm:px-7 sm:py-6">
          <div className="space-y-3">
            <ResultLane title="Roster" total={rosterLane} accent="roster">
              {result.roster.length === 0 && result.roster_adjustment_points === 0 ? (
                <LaneEmpty>No active roster members scored this episode.</LaneEmpty>
              ) : (
                <>
                  {result.roster.map((member) => (
                    <ResultRow
                      key={member.contestant_id}
                      name={member.name}
                      imageUrl={member.image_url}
                      value={member.points}
                      eliminated={eliminatedIds.has(member.contestant_id)}
                      breakdown={member.breakdown}
                    />
                  ))}
                  {result.roster_adjustment_points !== 0 && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <span className="text-cream-100/70">Historical roster adjustment</span>
                      <span className="shrink-0 font-display font-semibold text-cream-100 tabular-nums">
                        {signed(result.roster_adjustment_points)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </ResultLane>

            <ResultLane title="Ballot" total={result.ballot_points} accent="ballot">
              {result.ballot.length === 0 ? (
                <LaneEmpty>No ballot was submitted, so there are no ballot points.</LaneEmpty>
              ) : (
                result.ballot.map((pick) => {
                  const label = ballotTypeLabel(pick.prediction_type)
                  return (
                    <div
                      key={`${pick.prediction_type}:${pick.contestant_id}`}
                      className={`flex min-w-0 items-center gap-3 px-3.5 py-2.5 ${
                        pick.correct ? 'bg-jade-600/12' : ''
                      }`}
                    >
                      <ContestantAvatar
                        name={pick.name}
                        imageUrl={pick.image_url}
                        tribeColor={null}
                        tribeName={null}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-cream-100">{pick.name}</span>
                        {label && <span className="block text-xs text-cream-100/45">{label}</span>}
                      </span>
                      <span
                        className={`shrink-0 font-display font-semibold tabular-nums ${
                          pick.correct ? 'text-jade-200' : 'text-cream-100/45'
                        }`}
                      >
                        {signed(pick.points)}
                      </span>
                    </div>
                  )
                })
              )}
            </ResultLane>

            <ResultLane title="Advantage" total={result.weekly_play_bonus} accent="advantage">
              {result.weekly_plays.length === 0 ? (
                <LaneEmpty>No weekly play was used.</LaneEmpty>
              ) : (
                result.weekly_plays.map((play) => (
                  <div key={play.advantage_play_id} className="flex min-w-0 items-center gap-3 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-cream-100">
                        {ADV_LABELS[play.advantage_type] ?? play.advantage_type.replace(/_/g, ' ')}
                      </span>
                      {play.target_name && (
                        <span className="block truncate text-xs text-cream-100/45">{play.target_name}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-display font-semibold text-jade-200 tabular-nums">
                      {play.advantage_type === 'roster_swap' ? '—' : signed(play.bonus_points)}
                    </span>
                  </div>
                ))
              )}
            </ResultLane>
          </div>

          {/* ── Points buildup: Roster + Ballot + Advantage = total ── */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-[#0d1c14] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 font-display font-semibold text-cream-100/75">
              <BuildTerm label="Roster" value={rosterLane} />
              <span className="text-white/25">+</span>
              <BuildTerm label="Ballot" value={result.ballot_points} />
              <span className="text-white/25">+</span>
              <BuildTerm label="Adv" value={result.weekly_play_bonus} />
            </div>
            <div className="ml-auto flex items-baseline gap-2">
              <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-cream-100/55">
                Episode
              </span>
              <span className="font-display text-2xl font-bold leading-none text-terracotta-200 tabular-nums">
                {signed(result.total_points)}
              </span>
            </div>
          </div>

          {insights.length > 0 && (
            <section aria-labelledby="episode-insights-title" className="mt-4">
              <h3
                id="episode-insights-title"
                className="mb-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-cream-100/55"
              >
                Episode insight
              </h3>
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
                {insights.map((insight) => (
                  <li key={insight.id} className="rounded-xl border border-white/10 bg-[#18301f] px-3.5 py-3">
                    <p className="text-[0.7rem] uppercase tracking-wide text-cream-100/45">{insight.label}</p>
                    <p className="my-0.5 font-display text-lg font-bold leading-tight text-cream-100">
                      {insight.value}
                    </p>
                    {insight.detail && <p className="text-xs text-cream-100/70">{insight.detail}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-terracotta-200">{error}</p>}
          {mode === 'automatic' ? (
            <button
              type="button"
              onClick={() => void continueReveal()}
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-jade-600 px-4 py-3 font-display text-sm font-semibold uppercase tracking-[0.08em] text-white hover:bg-jade-700 disabled:opacity-50"
            >
              {submitting ? 'Continuing…' : 'Continue'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl border border-white/20 px-4 py-3 font-display text-sm font-semibold uppercase tracking-[0.08em] text-cream-100 hover:bg-white/5"
            >
              Back to My Season
            </button>
          )}
        </div>
      </article>
    </div>
  )
}

function BuildTerm({ label, value }: { label: string; value: number }) {
  return (
    <span className="leading-none">
      <span className="text-cream-100 tabular-nums">{signed(value)}</span>
      <span className="ml-1 font-sans text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-cream-100/45">
        {label}
      </span>
    </span>
  )
}

function LaneEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 py-2.5 text-sm text-cream-100/45">{children}</p>
}

const LANE_EDGE = {
  roster: 'border-l-jade-600',
  ballot: 'border-l-terracotta-500',
  advantage: 'border-l-gold-500',
} as const

function ResultLane({
  title,
  total,
  accent,
  children,
}: {
  title: string
  total: number
  accent: keyof typeof LANE_EDGE
  children: React.ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-white/10 border-l-[3px] bg-[#18301f] ${LANE_EDGE[accent]}`}>
      <div className="flex items-baseline gap-3 border-b border-white/10 px-3.5 py-2.5">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-cream-100/70">{title}</h3>
        <span
          className={`ml-auto shrink-0 font-display text-lg font-bold tabular-nums ${
            total > 0 ? 'text-jade-200' : total < 0 ? 'text-terracotta-200' : 'text-cream-100/45'
          }`}
        >
          {signed(total)}
        </span>
      </div>
      <div className="divide-y divide-white/[0.07]">{children}</div>
    </section>
  )
}

function ResultRow({
  name,
  imageUrl,
  value,
  eliminated = false,
  breakdown = [],
}: {
  name: string
  imageUrl: string | null
  value: number
  eliminated?: boolean
  breakdown?: EpisodeResultBreakdownLine[]
}) {
  const [open, setOpen] = useState(false)
  const expandable = breakdown.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => expandable && setOpen((current) => !current)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        className="flex w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-left disabled:cursor-default"
      >
        {/* Voted out reads the way Cast/Standings show it (#457): grey avatar,
            name crossed off. The point sources stay behind the chevron so a big
            scorer never blows the row up (#477). */}
        <span className={eliminated ? ELIMINATED_DIM : undefined}>
          <ContestantAvatar name={name} imageUrl={imageUrl} tribeColor={null} tribeName={null} size="sm" />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm font-medium ${
            eliminated ? `text-cream-100/45 ${ELIMINATED_STRIKE}` : 'text-cream-100'
          }`}
        >
          {name}
        </span>
        {eliminated && <span className="sr-only">voted out this episode</span>}
        <span className="shrink-0 font-display font-semibold text-cream-100 tabular-nums">{signed(value)}</span>
        {expandable && (
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-cream-100/40 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {expandable && open && (
        <ul className="space-y-0.5 pb-2.5 pl-[3.75rem] pr-3.5 text-xs text-cream-100/55">
          {breakdown.map((line, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {line.label}
                {line.quantity > 1 && ` ×${line.quantity}`}
              </span>
              <span
                className={`tabular-nums ${
                  line.points > 0 ? 'text-jade-200' : line.points < 0 ? 'text-terracotta-200' : 'text-cream-100/45'
                }`}
              >
                {signed(line.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface EpisodeResultRevealProps {
  result: EpisodeResult
  mode: 'automatic' | 'replay'
  onContinue?: () => Promise<void>
  onClose?: () => void
}
