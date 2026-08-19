export function PageHeader({
  title,
  eyebrow,
  description,
  meta,
  actions,
}: {
  title: string
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-terracotta-700">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl tracking-wide text-forest-800 md:text-4xl">
            {title}
          </h1>
          {description && (
            <div className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
              {description}
            </div>
          )}
        </div>
        {(meta || actions) && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm text-gray-500">
            {meta}
            {actions}
          </div>
        )}
      </div>
      <div className="tribal-border mt-5" aria-hidden="true" />
    </header>
  )
}
