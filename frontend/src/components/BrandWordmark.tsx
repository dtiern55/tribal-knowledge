export function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span data-wordmark="snakes-and-rats" className={className}>
      <span className="text-terracotta-300">SNAKES</span>{' '}
      <span className="text-gold-500">AND</span>{' '}
      <span className="text-cream-50">RATS</span>
    </span>
  )
}
