import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuffPairIcon, PalmIcon, RankedTorchesIcon } from './icons'
import { DoubleBadge } from './DoubleBadge'
import { Torch } from './Torch'
import { VoteMark } from './VoteMark'

describe('approved icon system', () => {
  it('steps the carved Double Roster Points pendant down at small sizes', () => {
    const { container, rerender } = render(<DoubleBadge />)
    let idol = container.querySelector('[data-mark="double-idol"]')

    expect(idol).toHaveAttribute('viewBox', '0 0 48 52')
    expect(idol).toHaveAttribute('data-detail', 'carved')
    expect(idol).toHaveTextContent('×2')
    expect(idol?.querySelector('[data-part="idol"]')).toBeInTheDocument()
    expect(idol?.querySelector('[data-part="cord"]')).toBeInTheDocument()
    expect(idol?.querySelector('[data-part="cord-hole"]')).toBeInTheDocument()
    expect(idol?.querySelector('[data-part="carved-grooves"]')).toBeInTheDocument()
    expect(idol?.querySelector('[data-part="carved-notches"]')).not.toBeInTheDocument()

    rerender(<DoubleBadge size={15} />)
    idol = container.querySelector('[data-mark="double-idol"]')
    expect(idol).toHaveAttribute('data-detail', 'compact')
    expect(idol?.querySelector('[data-part="compact-mark"]')).toBeInTheDocument()
    expect(idol?.querySelector('[data-part="cord"]')).not.toBeInTheDocument()
    expect(idol?.querySelector('[data-part="cord-hole"]')).not.toBeInTheDocument()
    expect(idol?.querySelector('[data-part="carved-grooves"]')).not.toBeInTheDocument()

    rerender(<DoubleBadge size={28} />)
    idol = container.querySelector('[data-mark="double-idol"]')
    expect(idol?.querySelector('[data-part="carved-notches"]')).toBeInTheDocument()
  })

  it('marks a cast ballot with a clean, decorative slip-and-check icon', () => {
    const { container, rerender } = render(<VoteMark className="h-5 w-5" />)
    let ballot = container.querySelector('svg')

    expect(ballot).toHaveAttribute('viewBox', '0 0 24 24')
    expect(ballot).toHaveAttribute('data-mark', 'ballot')
    expect(ballot).toHaveAttribute('aria-hidden', 'true')
    expect(ballot?.querySelectorAll('rect')).toHaveLength(1)
    expect(ballot?.querySelectorAll('path')).toHaveLength(1)

    rerender(<VoteMark className="h-10 w-10" />)
    ballot = container.querySelector('svg')
    expect(ballot).toHaveClass('h-10', 'w-10')
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
