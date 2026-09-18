import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HubBallotMark } from './HubPlayMarks'

describe('HubBallotMark', () => {
  it('keeps Power Vote gold and uses fill only for a correct pick on dark recaps', () => {
    const { rerender } = render(
      <HubBallotMark name="Kenzie" power dark />,
    )

    const miss = screen.getByTitle('Power Vote on this vote')
    expect(miss.className).toContain('border-dotted')
    expect(miss.className).toContain('text-gold-300')
    expect(miss.className).not.toContain('bg-gold-300/25')

    rerender(<HubBallotMark name="Kenzie" power correct dark />)

    const hit = screen.getByTitle('Power Vote on this vote')
    expect(hit.className).not.toContain('border-dotted')
    expect(hit.className).toContain('bg-gold-300/25')
    expect(hit).toHaveTextContent('Correct')
  })
})
