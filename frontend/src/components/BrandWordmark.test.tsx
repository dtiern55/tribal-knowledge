import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandWordmark } from './BrandWordmark'

describe('BrandWordmark', () => {
  it('matches each word to its icon color role', () => {
    const { container } = render(<BrandWordmark />)
    const wordmark = container.querySelector('[data-wordmark="snakes-and-rats"]')
    const words = wordmark?.querySelectorAll('span')

    expect(wordmark).toHaveTextContent('SNAKES AND RATS')
    expect(words).toHaveLength(3)
    expect(words?.[0]).toHaveClass('text-terracotta-300')
    expect(words?.[1]).toHaveClass('text-gold-300')
    expect(words?.[2]).toHaveClass('text-cream-50')
  })
})
