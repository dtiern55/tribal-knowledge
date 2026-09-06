/** A compact ×2 mark for where an advantage was played — legible where the
 *  carved idol turns to mush at small sizes (#490). */
export function Times2({ title }: { title: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 items-center rounded bg-gold-400 px-1 text-[10px] font-bold leading-tight tabular-nums text-forest-950"
    >
      ×2
    </span>
  )
}
