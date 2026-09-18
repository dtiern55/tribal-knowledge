import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RosterCard } from './RosterCard'
import type { Contestant } from '../types'

const contestant = {
  id: 'cast-1',
  name: 'Maya',
  nickname: null,
  image_url: '/maya.png',
  tribe_color: '#ca5b39',
  tribe_name: 'Vatu',
  eliminated_in_episode: null,
} as Contestant

function renderCard(overrides: Partial<ComponentProps<typeof RosterCard>> = {}) {
  return render(
    <ul>
      <RosterCard
        contestantId={contestant.id}
        contestant={contestant}
        isSoleSurvivor
        bioLink={false}
        {...overrides}
      />
    </ul>,
  )
}

describe('RosterCard Sole Survivor torch', () => {
  it('leads the name with a lit torch, and none for anyone else', () => {
    const { container, rerender } = renderCard()
    expect(container.querySelector('.sole-survivor-torch')).toBeInTheDocument()
    expect(screen.getByText(/Sole Survivor/)).toHaveClass('sr-only')

    rerender(
      <ul>
        <RosterCard contestantId={contestant.id} contestant={contestant} bioLink={false} />
      </ul>,
    )
    expect(container.querySelector('.sole-survivor-torch')).not.toBeInTheDocument()
  })

  it('snuffs the torch when the designee has been eliminated', () => {
    const { container } = renderCard({ contestant: { ...contestant, eliminated_in_episode: 8 } })
    const torch = container.querySelector('.sole-survivor-torch')!
    expect(torch.querySelector('[fill="#e85d2a"]')).toBeNull()
  })
})
