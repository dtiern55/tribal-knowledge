const styles = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-ocean-200 bg-ocean-50 text-ocean-900',
  success: 'border-jungle-200 bg-jungle-50 text-jungle-800',
  neutral: 'border-sand-200 bg-white text-gray-600',
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
