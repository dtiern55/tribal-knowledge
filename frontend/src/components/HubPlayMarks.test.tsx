import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HubBallotMark } from './HubPlayMarks'

describe('HubBallotMark', () => {
  it('stamps the Power Vote with the idol and fills only a correct pick (#849)', () => {
    const { rerender } = render(<HubBallotMark name="Kenzie" power dark />)

    const miss = screen.getByText('Kenzie')
    expect(miss).toContainElement(screen.getByLabelText('Power Vote on this vote'))
    expect(miss.className).not.toContain('gold')
    expect(miss.className).not.toContain('bg-')

    rerender(<HubBallotMark name="Kenzie" power correct dark />)

    const hit = screen.getByText('Kenzie')
    expect(hit.className).toContain('bg-jade-300/30')
    expect(hit).toHaveTextContent('Correct')
  })
})
