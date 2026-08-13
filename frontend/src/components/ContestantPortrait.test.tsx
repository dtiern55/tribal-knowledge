import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContestantPortrait } from './ContestantPortrait'

describe('ContestantPortrait', () => {
  it('provides an accessible initials fallback when a photo is missing', () => {
    render(<ContestantPortrait name="Mary Jane" imageUrl={null} />)
    expect(screen.getByRole('img', { name: 'No photo available for Mary Jane' })).toHaveTextContent('MJ')
  })

  it('falls back when a supplied image cannot load', () => {
    render(<ContestantPortrait name="Q" imageUrl="/broken.jpg" />)
    fireEvent.error(screen.getByRole('img', { name: 'Q portrait' }))
    expect(screen.getByRole('img', { name: 'No photo available for Q' })).toBeInTheDocument()
  })
})
