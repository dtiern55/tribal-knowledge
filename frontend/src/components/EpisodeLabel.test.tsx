import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithApp } from '../test/render'
import { EpisodeLabel } from './EpisodeLabel'

const ep = (title: string | null) => ({ episode_number: 3, title })

describe('EpisodeLabel', () => {
  it('names the episode with its title', () => {
    renderWithApp(<EpisodeLabel episode={ep('You Get What You Give')} />)
    expect(screen.getByText('Ep 3')).toBeVisible()
    expect(screen.getByText('· You Get What You Give')).toBeVisible()
  })

  it('falls back to the number alone when no title is set', () => {
    renderWithApp(<EpisodeLabel episode={ep(null)} />)
    expect(screen.getByText('Ep 3')).toBeVisible()
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('keeps a status suffix beside the number', () => {
    renderWithApp(<EpisodeLabel episode={ep('Kindergarten Camp')} suffix="locked" />)
    expect(screen.getByText('Ep 3 · locked')).toBeVisible()
  })

  // These labels sit in uppercase eyebrows (the record header, the locked and
  // watch-only states). The number wears that type; the title is prose and must
  // not, or #530's shared component reintroduces the inconsistency it removed.
  it('does not let an uppercase caller reach the title', () => {
    renderWithApp(<EpisodeLabel episode={ep('Kindergarten Camp')} className="uppercase" />)
    const title = screen.getByText('· Kindergarten Camp')
    expect(title).toHaveClass('normal-case')
    expect(title).toHaveClass('tracking-normal')
  })

  // The point of the component (#530): a long title truncates instead of
  // wrapping the label onto a second line, so the number never gets pushed off.
  it('truncates the title rather than letting it wrap', () => {
    renderWithApp(<EpisodeLabel episode={ep('A Very Long Episode Title Indeed')} />)
    const title = screen.getByText('· A Very Long Episode Title Indeed')
    expect(title).toHaveClass('truncate')
    expect(title).toHaveClass('min-w-0')
    expect(screen.getByText('Ep 3')).toHaveClass('shrink-0')
  })
})
