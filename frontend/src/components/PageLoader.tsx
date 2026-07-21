import { Torch } from './Torch'

/**
 * Full-page loading state (#56): a flickering lit torch instead of plain
 * "Loading…" grey text — the last generic surface in the app. The flicker
 * is CSS (.torch-flicker) and respects prefers-reduced-motion.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <Torch lit className="torch-flicker w-10 h-14" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
