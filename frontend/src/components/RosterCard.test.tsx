import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Contestant } from '../types'
import { renderWithApp } from '../test/render'
import { RosterCard } from './RosterCard'

const castaway = (over: Partial<Contestant> = {}): Contestant => ({
  id: 'c-1',
  season_id: 's-1',
  name: 'Kenzie',
  placement: null,
  image_url: null,
  eliminated_in_episode: null,
  tribe_name: null,
  tribe_color: null,
  created_at: '',
  ...over,
})

function card(props: Partial<Parameters<typeof RosterCard>[0]> = {}) {
  const contestant = props.contestant ?? castaway()
  renderWithApp(
    <ul>
      <RosterCard contestantId={contestant.id} bioLink={false} {...props} contestant={contestant} />
    </ul>,
  )
}

// #529: designating your Sole Survivor is a tap on a roster card's ring, which
// replaced the picker box that used to sit above the roster. The ring is only
// ever offered where it would mean something.
describe('RosterCard — Sole Survivor ring', () => {
  it('offers the ring while nobody is designated', () => {
    card({ onSsDesignate: () => {} })
    expect(screen.getByRole('button', { name: 'Name Kenzie your Sole Survivor' })).toBeVisible()
  })

  it('designates on tap', () => {
    const onSsDesignate = vi.fn()
    card({ onSsDesignate })
    screen.getByRole('button', { name: 'Name Kenzie your Sole Survivor' }).click()
    expect(onSsDesignate).toHaveBeenCalledOnce()
  })

  it('does not offer the ring on a castaway who is already out', () => {
    card({ onSsDesignate: () => {}, contestant: castaway({ eliminated_in_episode: 3 }) })
    expect(screen.queryByRole('button', { name: /your Sole Survivor/ })).toBeNull()
  })

  it('does not offer the ring on the castaway already wearing it', () => {
    card({ onSsDesignate: () => {}, isSoleSurvivor: true })
    expect(screen.queryByRole('button', { name: /your Sole Survivor/ })).toBeNull()
  })

  // The whole row is a <button> while it's answering "who do you drop?" or
  // "who do you double?" — a second button inside it would be invalid markup,
  // and mid-decision the tap belongs to the decision being made.
  it('does not offer the ring while the row is answering another question', () => {
    card({ onSsDesignate: () => {}, onSelect: () => {} })
    expect(screen.queryByRole('button', { name: /your Sole Survivor/ })).toBeNull()
  })
})
