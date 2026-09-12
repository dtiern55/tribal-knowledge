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
        showSoleSurvivorHalo
        bioLink={false}
        {...overrides}
      />
    </ul>,
  )
}

describe('RosterCard Sole Survivor halo', () => {
  it('adds the prominent halo only when My Season opts into it', () => {
    const { rerender } = renderCard({ prominent: true })
    expect(screen.getByAltText('Maya').parentElement).toHaveClass(
      'sole-survivor-halo',
      'sole-survivor-halo--prominent',
    )

    rerender(
      <ul>
        <RosterCard
          contestantId={contestant.id}
          contestant={contestant}
          isSoleSurvivor
          bioLink={false}
        />
      </ul>,
    )
    expect(screen.getByAltText('Maya').parentElement).not.toHaveClass('sole-survivor-halo')
  })

  it('snuffs the halo when the designee has been eliminated', () => {
    renderCard({ contestant: { ...contestant, eliminated_in_episode: 8 } })
    expect(screen.getByAltText('Maya').parentElement).toHaveClass('sole-survivor-halo--snuffed')
  })
})
