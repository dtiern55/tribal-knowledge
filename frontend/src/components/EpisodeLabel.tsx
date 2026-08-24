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
        <span className={`min-w-0 truncate ${titleClassName}`}>· {episode.title}</span>
      )}
    </span>
  )
}
