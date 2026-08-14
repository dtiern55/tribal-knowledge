import { Link } from 'react-router'

export function RuleLink({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <Link
      to={`/rules#${anchor}`}
      className="inline-flex items-center gap-1 text-xs font-semibold text-ocean-700 underline decoration-ocean-300 underline-offset-2 hover:text-ocean-900"
    >
      {children} <span aria-hidden>→</span>
    </Link>
  )
}
