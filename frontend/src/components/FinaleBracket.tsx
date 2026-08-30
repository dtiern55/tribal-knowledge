import { displayName } from '../lib/cast'
import type { Contestant } from '../types'
import { ContestantAvatar } from './ContestantAvatar'

/** The actual finale outcome, for marking a scored bracket correct/incorrect.
 *  Each set holds the contestant_ids that truly landed in that tier (Final 4 =
 *  placement ≤ 4, Final 3 = placement ≤ 3, winner = placement 1). Omit it and
 *  the bracket renders unmarked — the pre-lock/record view. */
export interface FinaleActuals {
  finalFour: Set<string>
  finalThree: Set<string>
  winner: string | null
}

/**
 * The finale ballot as a torch podium (#534): the slates stacked and narrowing
 * — the winner crowned at the apex, Final 3 below, Final 4 at the base. Unmarked
 * (pre-lock/record), the winner keeps a gold ring wherever they appear. Marked
 * (a scored finale, via `actuals`), each pick reads correct (jade) or missed
 * (dimmed), per tier — the same castaway can be a right Final 4 but a wrong
 * winner. A bare winner with empty slates degrades to a single apex, which is
 * how a Sole Survivor designation (no bracket) shows.
 */
export function FinaleBracket({
  finalFour,
  finalThree,
  winner,
  byId,
  actuals,
}: {
  finalFour: string[]
  finalThree: string[]
  winner: string
  byId: Map<string, Contestant>
  actuals?: FinaleActuals
}) {
  const winnerId = winner || null

  const member = (id: string, apex = false, correct?: boolean) => {
    const c = byId.get(id)
    const name = c ? displayName(c) : '—'
    const isWin = id === winnerId
    const ring =
      correct === true
        ? 'ring-2 ring-jade-500 ring-offset-2 ring-offset-jade-50'
        : correct === false
          ? ''
          : isWin
            ? 'ring-2 ring-gold-500 ring-offset-2 ring-offset-jade-50'
            : ''
    const nameColor =
      correct === true
        ? 'text-jade-700'
        : correct === false
          ? 'text-gray-400'
          : isWin
            ? 'text-gold-800'
            : 'text-forest-800'
    return (
      <div key={id} className="flex w-14 flex-col items-center gap-1 text-center">
        <span className={`relative inline-flex rounded-full ${ring} ${correct === false ? 'opacity-40 grayscale' : ''}`}>
          <ContestantAvatar
            name={name}
            imageUrl={c?.image_url ?? null}
            tribeColor={c?.tribe_color ?? null}
            tribeName={c?.tribe_name ?? null}
            size={apex ? 'lg' : 'md'}
          />
          {correct !== undefined && (
            <span
              aria-hidden
              className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                correct ? 'bg-jade-600' : 'bg-gray-400'
              }`}
            >
              {correct ? '✓' : '✕'}
            </span>
          )}
        </span>
        <span className={`max-w-full truncate text-xs font-medium ${nameColor}`}>
          {name}
          {correct !== undefined && <span className="sr-only"> — {correct ? 'correct' : 'incorrect'}</span>}
        </span>
      </div>
    )
  }

  const rule = <div className="mx-auto h-px w-4/5 bg-jade-200" />
  const tierLabel = (text: string, gold = false) => (
    <span
      className={`font-display text-[10px] font-bold uppercase tracking-[0.16em] ${
        gold ? 'text-gold-800' : 'text-gray-500'
      }`}
    >
      {text}
    </span>
  )
  const tier = (label: string, ids: string[], tierSet?: Set<string>) =>
    ids.length > 0 && (
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-2">
          {ids.map((id) => member(id, false, actuals && tierSet ? tierSet.has(id) : undefined))}
        </div>
        {tierLabel(label)}
      </div>
    )

  return (
    <div className="flex flex-col items-center gap-3 py-1">
      {winnerId && (
        <div className="flex flex-col items-center gap-2 pt-1">
          {tierLabel('Winner', true)}
          {member(winnerId, true, actuals ? actuals.winner === winnerId : undefined)}
        </div>
      )}
      {winnerId && finalThree.length > 0 && rule}
      {tier('Final 3', finalThree, actuals?.finalThree)}
      {(winnerId || finalThree.length > 0) && finalFour.length > 0 && rule}
      {tier('Final 4', finalFour, actuals?.finalFour)}
    </div>
  )
}
