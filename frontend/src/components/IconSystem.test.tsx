import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuffPairIcon, PalmIcon, RankedTorchesIcon, TeamBuffPairIcon } from './icons'
import { DoubleBadge } from './DoubleBadge'
import { VoteMark } from './VoteMark'

describe('approved icon system', () => {
  it('renders the Double Castaway Points idol as a sized, labelled image', () => {
    const { getByRole, rerender } = render(<DoubleBadge />)

    const badge = getByRole('img')
    expect(badge).toHaveAttribute('aria-label', 'Double Castaway Points this episode')
    expect(badge).toHaveStyle({ width: '22px', height: '22px' })
    // Per-season art arrives via --advantage-idol; the skull is the fallback (#642).
    expect(badge.style.backgroundImage).toContain('var(--advantage-idol, url(')

    rerender(<DoubleBadge size={60} title="Play your advantage" />)
    const big = getByRole('img')
    expect(big).toHaveAttribute('aria-label', 'Play your advantage')
    expect(big).toHaveStyle({ width: '60px', height: '60px' })
  })

  it('marks a cast ballot with a decorative written-slip icon', () => {
    const { container, rerender } = render(<VoteMark className="h-5 w-5" />)
    let ballot = container.querySelector('[data-mark="ballot"]')

    // Painted rather than drawn (#552) — an alpha mask filled with the
    // surrounding colour, so it still themes and is still decorative.
    expect(ballot).toHaveAttribute('aria-hidden', 'true')
    expect(ballot).toHaveClass('h-5', 'w-5')
    expect(ballot?.getAttribute('style')).toContain('background-color: currentcolor')
    expect(ballot?.getAttribute('style')).toContain('mask-image: url(')

    rerender(<VoteMark className="h-10 w-10" />)
    ballot = container.querySelector('[data-mark="ballot"]')
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

    // All three are painted masks (#552). The Cast buffs were the only icon
    // drawn this way and the only one that read at 20px; the rest now match.
    const icons = container.querySelectorAll('span[aria-hidden="true"]')
    expect(icons).toHaveLength(3)

    for (const icon of icons) {
      expect(icon).toHaveClass('inline-block', 'h-5', 'w-5')
      expect(icon.getAttribute('style')).toContain('background-color: currentcolor')
      expect(icon.getAttribute('style')).toContain('mask-image: url(')
    }

    // The Cast mask was drawn with more margin than the generated ones, so it
    // alone is scaled up to sit at the same optical size.
    expect(icons[0].getAttribute('style')).toContain('mask-size: 100%')
    expect(icons[1].getAttribute('style')).toContain('mask-size: 100%')
    expect(icons[2].getAttribute('style')).toContain('mask-size: 128%')
  })

  it('uses the recovered buff-pair drawing for the My Team lane', () => {
    const { container } = render(<TeamBuffPairIcon />)

    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24')
    expect(icon).toHaveAttribute('stroke', 'currentColor')
    expect(icon).toHaveAttribute('stroke-width', '1.8')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon?.querySelectorAll('path')).toHaveLength(4)
  })
})
