import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithApp } from '../test/render'
import { ColdStart } from './ColdStart'

describe('ColdStart', () => {
  it('tells a player the commissioner has not started a season', () => {
    renderWithApp(<ColdStart />)
    expect(screen.getByRole('heading', { name: 'Camp isn’t set up yet' })).toBeVisible()
  })

  it('tells the commissioner a season has to exist first', () => {
    renderWithApp(<ColdStart />, {
      auth: { profile: { id: 'user-1', display_name: 'Test Player', is_admin: true } },
    })
    expect(screen.getByRole('heading', { name: 'No season yet' })).toBeVisible()
  })
})
