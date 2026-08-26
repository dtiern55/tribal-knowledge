import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuffPairIcon, PalmIcon, RankedTorchesIcon } from './icons'
import { DoubleBadge } from './DoubleBadge'
import { VoteMark } from './VoteMark'

describe('approved icon system', () => {
  it('renders the Double Castaway Points idol as a sized, labelled image', () => {
    const { container, getByRole, rerender } = render(<DoubleBadge />)

    const badge = getByRole('img')
    expect(badge).toHaveAttribute('aria-label', 'Double Castaway Points this episode')
    expect(badge).toHaveStyle({ width: '22px', height: '22px' })
    // The artwork itself is decorative — the label lives on the wrapper.
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true')

    rerender(<DoubleBadge size={60} title="Play your advantage" />)
    const big = getByRole('img')
    expect(big).toHaveAttribute('aria-label', 'Play your advantage')
    expect(big).toHaveStyle({ width: '60px', height: '60px' })
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

  it('keeps primary navigation symbols decorative beside their text labels', () => {
    const { container } = render(
      <>
        <PalmIcon />
        <RankedTorchesIcon />
        <BuffPairIcon />
      </>,
    )

    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(2)

    const palm = icons[0]
    expect(palm).toHaveAttribute('aria-hidden', 'true')
    expect(palm).toHaveAttribute('viewBox', '0 0 24 24')
    expect(palm).toHaveAttribute('stroke', 'currentColor')

    const torches = icons[1]
    expect(torches).toHaveAttribute('aria-hidden', 'true')
    expect(torches).toHaveAttribute('viewBox', '0 0 24 24')
    expect(torches).toHaveAttribute('fill', 'currentColor')

    const cast = container.querySelector('span[aria-hidden="true"]')
    expect(cast).toHaveClass('inline-block', 'h-5', 'w-5')
    expect(cast?.getAttribute('style')).toContain('background-color: currentcolor')
    expect(cast?.getAttribute('style')).toContain('mask-image: url(')
    expect(cast?.getAttribute('style')).toContain('mask-size: 128%')
  })
})
