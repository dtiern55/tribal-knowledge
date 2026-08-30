import type { CSSProperties, ReactNode } from 'react'
import { SUE_HAWK_QUOTE } from '../lib/quotes'

// Camp-at-night front door (#508): the full-bleed dark canvas scene borrowed
// from the loader, the embroidered mark glowing over it, and a floating cream
// card. Shared by LoginPage and JoinPage so the two screens stay identical.
const CAMP: CSSProperties = {
  backgroundColor: '#0e1f19',
  backgroundImage: [
    // canvas weave
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)',
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 3px)',
    // firelight in the corner + the night ground — same values as the loader's
    // locked scene, so the front door and the app read as one place.
    'radial-gradient(circle at 78% 8%, rgba(196,84,50,0.18), transparent 520px)',
    'linear-gradient(180deg, #132e25, #0e1f19)',
  ].join(', '),
}

export function AuthScene({
  children,
  eyebrow = 'Private Survivor league',
}: {
  children: ReactNode
  eyebrow?: string
}) {
  return (
    <div style={CAMP} className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <img
            src="/icon-512.webp?v=20260830"
            alt=""
            width={92}
            height={92}
            className="size-[92px] rounded-2xl shadow-[0_0_54px_-10px_rgba(196,84,50,0.55)] ring-1 ring-white/10"
          />
          <h1 className="mt-5 font-brand text-2xl font-bold leading-none tracking-wide">
            <span className="text-cream-50">SNAKES</span>{' '}
            <span className="text-terracotta-500">AND RATS</span>
          </h1>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-terracotta-200">
            {eyebrow}
          </p>
          {/* The app's namesake, on its own front door. */}
          <figure className="mx-auto mt-5 max-w-[19rem]">
            <blockquote className="text-pretty text-sm italic leading-snug text-cream-100/85">
              &ldquo;{SUE_HAWK_QUOTE.text}&rdquo;
            </blockquote>
            <figcaption className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-terracotta-200/75">
              {SUE_HAWK_QUOTE.who}
              {SUE_HAWK_QUOTE.season ? ` · ${SUE_HAWK_QUOTE.season}` : ''}
            </figcaption>
          </figure>
        </div>
        <div className="mt-7 rounded-2xl bg-cream-50/95 p-5 shadow-2xl ring-1 ring-black/10 backdrop-blur-sm sm:p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
