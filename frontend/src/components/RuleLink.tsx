import { Link } from 'react-router'

export function RuleLink({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <Link
      to={`/rules#${anchor}`}
      className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700 underline decoration-forest-300 underline-offset-2 hover:text-forest-900"
    >
      {children} <span aria-hidden>→</span>
    </Link>
  )
}
