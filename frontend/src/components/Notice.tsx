const styles = {
  error: 'border-terracotta-200 bg-terracotta-50 text-terracotta-800',
  info: 'border-forest-200 bg-forest-50 text-forest-900',
  success: 'border-jade-200 bg-jade-50 text-jade-800',
  neutral: 'border-cream-200 bg-white text-gray-600',
}

export function Notice({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode
  tone?: keyof typeof styles
  title?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${styles[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  )
}
