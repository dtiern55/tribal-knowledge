import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ContestantPerformance } from '../types'
import { renderWithApp } from '../test/render'
import { RosterBreakdown } from './RosterBreakdown'

const perf = {
  name: 'Kenzie',
  image_url: null,
  placement: null,
  eliminated_in_episode: null,
  tribe_name: null,
  tribe_color: null,
  age: null,
  occupation: null,
  hometown: null,
  bio: null,
  total_points: 12,
  episodes: [
    {
      episode_number: 2,
      points: 12,
      events: [{ label: 'Won immunity', points: 12, token_value: 0, quantity: 1 }],
      eliminated_type: null,
    },
  ],
} as ContestantPerformance

function render(episodeTitles?: Map<number, string | null>) {
  renderWithApp(
    <RosterBreakdown
      perf={perf}
      activeFrom={1}
      activeUntil={null}
      doubledByEp={new Map()}
      episodeTitles={episodeTitles}
    />,
  )
}

describe('RosterBreakdown', () => {
  // #539: this row kept its own two-line treatment with a fixed max-w truncate
  // after #530 consolidated everywhere else. It routes through EpisodeLabel now,
  // so the title shares the number's line and takes the squeeze itself.
  it('names the episode on one line, title included', () => {
    render(new Map([[2, 'A Very Long Episode Title Indeed']]))

    expect(screen.getByText('Ep 2')).toBeVisible()
    const title = screen.getByText('· A Very Long Episode Title Indeed')
    expect(title).toHaveClass('truncate')
    expect(title).toHaveClass('min-w-0')
  })

  it('falls back to the number when the caller passes no titles', () => {
    render()

    expect(screen.getByText('Ep 2')).toBeVisible()
    expect(screen.queryByText(/·/)).toBeNull()
  })
})
