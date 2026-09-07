import type { Session } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { renderWithApp } from '../test/render'
import { ProtectedRoute } from './ProtectedRoute'

const session = { access_token: 'test-token' } as Session

function renderGuard(profileError: boolean) {
  return renderWithApp(
    <Routes>
      <Route path="/" element={<ProtectedRoute><p>home</p></ProtectedRoute>} />
      <Route path="/join" element={<p>join page</p>} />
    </Routes>,
    { auth: { session, profile: null, profileError } },
  )
}

describe('ProtectedRoute', () => {
  it('sends a signed-in user with no profile to Join', () => {
    renderGuard(false)
    expect(screen.getByText('join page')).toBeInTheDocument()
  })

  it('offers a retry instead of Join when the profile could not be fetched', () => {
    renderGuard(true)
    expect(screen.queryByText('join page')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
