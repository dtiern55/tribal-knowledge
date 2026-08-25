import type { Episode } from '../types'

/**
 * The one way an episode is named across the app (#530).
 *
 * Titles arrived in #450 and got wired into a handful of places by #536, but
 * each site invented its own presentation — inline `· title` here, a separate
 * `font-display` line there — and TeamPage's fixed `max-w-[16rem]` still let a
 * long title wrap onto a second line on a narrow phone.
 *
 * The number (plus any status word) is pinned and the title absorbs the
 * squeeze, so the label is always exactly one line. `Ep` rather than `Episode`
 * per the issue: the four characters are the difference between fitting and
 * truncating on an SE-class screen.
 *
 * `Ep N` is the form for a label, a chip, an eyebrow, an accordion row —
 * anywhere the episode sits beside other metadata rather than inside a
 * sentence. Running prose spells the word out ("Results appear here after
 * Episode 4 is scored.", "Swaps close at Episode 9."), and so does the admin's
 * Open Episode button. That is the whole rule (#539); reach for the full word
 * only when you are writing a sentence.
 *
 * The number inherits the caller's type — these labels sit in uppercase
 * eyebrows — but an episode title is prose and is never uppercased or
 * letterspaced, so the title run resets both. `titleClassName` is for tone,
 * not for case.
 */
export function EpisodeLabel({
  episode,
  suffix,
  className = '',
  titleClassName = '',
}: {
  episode: Pick<Episode, 'episode_number' | 'title'>
  /** Status word shown beside the number, e.g. "locked", "watch only". */
  suffix?: string
  className?: string
  /** Extra classes for the title run — usually a lighter tone. */
  titleClassName?: string
}) {
  return (
    <span className={`flex min-w-0 items-baseline gap-1 ${className}`}>
      <span className="shrink-0">
        Ep {episode.episode_number}
        {suffix && ` · ${suffix}`}
      </span>
      {episode.title && (
        <span className={`min-w-0 truncate normal-case tracking-normal ${titleClassName}`}>
          · {episode.title}
        </span>
      )}
    </span>
  )
}
