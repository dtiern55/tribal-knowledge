export function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span data-wordmark="snakes-and-rats" className={className}>
      <span className="text-brand-snake">SNAKES</span>{' '}
      <span className="text-brand-flame">AND</span>{' '}
      <span className="text-brand-rat">RATS</span>
    </span>
  )
}
