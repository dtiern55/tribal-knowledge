import { Link } from 'react-router'

// Catch-all for unknown URLs (#509). Before this, an unmatched route rendered
// blank inside the app shell.
export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
      <img
        src="/icon-512.webp?v=20260903-locked"
        alt=""
        width={72}
        height={72}
        className="size-[72px] rounded-2xl opacity-90 shadow-sm"
      />
      <p className="mt-6 font-display text-5xl font-bold tracking-wide text-terracotta-600">404</p>
      <h1 className="mt-1 font-display text-2xl tracking-wide text-forest-800">Lost in the jungle</h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        That page isn’t on the map. Let’s get you back to camp.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-jade-600 px-5 py-2 text-sm font-semibold text-white hover:bg-jade-700"
      >
        Back to My Season
      </Link>
    </div>
  )
}
