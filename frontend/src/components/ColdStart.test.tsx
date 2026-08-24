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
    // #526: the commissioner now has somewhere to go. Before the create-season
    // form existed this was deliberately a dead end.
    expect(screen.getByRole('link', { name: 'Create the first season' })).toHaveAttribute(
      'href',
      '/admin',
    )
  })

  it('gives a player no call to action, because there is none', () => {
    renderWithApp(<ColdStart />)
    expect(screen.queryByRole('link', { name: 'Create the first season' })).toBeNull()
  })
})
