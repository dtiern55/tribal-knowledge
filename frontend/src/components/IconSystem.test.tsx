import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuffPairIcon, PalmIcon, RankedTorchesIcon } from './icons'
import { Torch } from './Torch'
import { VoteMark } from './VoteMark'

describe('approved icon system', () => {
  it('uses the same single-name ballot strip for actions and confirmations', () => {
    const { container, rerender } = render(<VoteMark className="h-5 w-5" />)
    let ballot = container.querySelector('svg')

    expect(ballot).toHaveAttribute('viewBox', '0 0 64 40')
    expect(ballot).toHaveAttribute('data-mark', 'ballot')
    expect(ballot).toHaveAttribute('aria-hidden', 'true')
    expect(ballot?.querySelectorAll('path')).toHaveLength(2)

    rerender(<VoteMark className="h-10 w-10" />)
    ballot = container.querySelector('svg')
    expect(ballot).toHaveClass('h-10', 'w-10')
    expect(ballot?.querySelectorAll('path')).toHaveLength(2)
  })

  it('distinguishes lit and snuffed states on the same carved torch', () => {
    const { container, rerender } = render(<Torch lit />)
    let torch = container.querySelector('svg')

    expect(torch).toHaveAttribute('data-state', 'lit')
    expect(torch).toHaveAttribute('aria-hidden', 'true')
    expect(torch?.querySelectorAll('[data-part="flame"]')).toHaveLength(1)
    expect(torch?.querySelectorAll('[data-part="smoke"]')).toHaveLength(0)

    rerender(<Torch lit={false} />)
    torch = container.querySelector('svg')
    expect(torch).toHaveAttribute('data-state', 'snuffed')
    expect(torch?.querySelectorAll('[data-part="flame"]')).toHaveLength(0)
    expect(torch?.querySelectorAll('[data-part="smoke"]')).toHaveLength(2)
  })

  it('keeps primary navigation symbols decorative beside their text labels', () => {
    const { container } = render(
      <>
        <PalmIcon />
        <RankedTorchesIcon />
        <BuffPairIcon />
      </>,
    )

    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(3)
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
