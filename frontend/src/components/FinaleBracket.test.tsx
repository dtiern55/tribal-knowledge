import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Contestant } from '../types'
import { renderWithApp } from '../test/render'
import { FinaleBracket, type FinaleActuals } from './FinaleBracket'

const c = (id: string, placement: number | null): Contestant => ({
  id,
  season_id: 's',
  name: id.toUpperCase(),
  placement,
  image_url: null,
  eliminated_in_episode: null,
  tribe_name: null,
  tribe_color: null,
  created_at: '',
})

describe('FinaleBracket', () => {
  it('marks a pick correct or incorrect per tier — the same castaway differs by row', () => {
    const byId = new Map([c('a', 1), c('b', 2), c('c', 3), c('d', 4)].map((x) => [x.id, x]))
    const actuals: FinaleActuals = {
      finalFour: new Set(['a', 'b', 'c', 'd']),
      finalThree: new Set(['a', 'b', 'c']),
      winner: 'a',
    }
    // Called C to win, but C placed 3rd: right as a Final 4/3 pick, wrong as the
    // winner. Only the winner apex misses; every Final 4/3 pick landed.
    renderWithApp(
      <FinaleBracket finalFour={['a', 'b', 'c', 'd']} finalThree={['a', 'b', 'c']} winner="c" byId={byId} actuals={actuals} />,
    )
    expect(screen.getAllByText(/— incorrect/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/— correct/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders no correctness labels when no actuals are given (pre-lock / record view)', () => {
    const byId = new Map([c('a', 1)].map((x) => [x.id, x]))
    renderWithApp(<FinaleBracket finalFour={[]} finalThree={[]} winner="a" byId={byId} />)
    expect(screen.queryAllByText(/— (correct|incorrect)/)).toHaveLength(0)
  })
})
