import type { Session } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { renderWithApp } from '../test/render'
import { JoinPage } from './JoinPage'
import { LoginPage } from './LoginPage'
import { ProfilePage } from './ProfilePage'
import { ResetPasswordPage } from './ResetPasswordPage'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))
vi.mock('../lib/install', () => ({
  installAvailable: () => false,
  isInstalled: () => false,
  isIos: () => false,
  onInstallAvailable: () => () => undefined,
  promptInstall: vi.fn(),
}))

const memberSession = {
  access_token: 'test-token',
  user: { id: 'user-1', email: 'danny@example.com' },
} as Session

describe('account entry flows', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a password-manager-friendly sign-in form and specific failure feedback', async () => {
    const user = userEvent.setup()
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email or password is incorrect' },
    } as never)

    renderWithApp(<LoginPage />, { auth: { session: null, profile: null } })

    const email = screen.getByRole('textbox', { name: 'Email' })
    const password = screen.getByLabelText('Password')
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(password).toHaveAttribute('autocomplete', 'current-password')

    await user.type(email, 'danny@example.com')
    await user.type(password, 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect')
  })

  it('explains email confirmation and returns account creation to sign in', async () => {
    const user = userEvent.setup()
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: {} as never, session: null },
      error: null,
    })
    renderWithApp(<LoginPage />, { auth: { session: null, profile: null } })

    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }))
    expect(screen.getByText('You’ll need your league’s join code after signing up.')).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    // A dedicated "check your email" moment (#508), not an inline pill.
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(/sent a confirmation link to new@example.com/)
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  it('emails a password reset link from the sign-in form', async () => {
    const user = userEvent.setup()
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null } as never)
    renderWithApp(<LoginPage />, { auth: { session: null, profile: null } })

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'danny@example.com')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'danny@example.com',
      { redirectTo: expect.stringContaining('/reset') },
    )
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(/password reset link to danny@example.com/)
  })

  it('will not send a reset without an email', async () => {
    const user = userEvent.setup()
    renderWithApp(<LoginPage />, { auth: { session: null, profile: null } })

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter your email/)
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('sets a new password from the reset link and continues to My Season', async () => {
    const user = userEvent.setup()
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({ data: { user: {} as never }, error: null })

    renderWithApp(
      <Routes>
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route path="/" element={<p>My Season destination</p>} />
      </Routes>,
      { route: '/reset', auth: { session: memberSession, profile: { id: 'user-1', display_name: 'Danny', is_admin: false } } },
    )

    await user.type(screen.getByLabelText('New password'), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-pass' })
    expect(await screen.findByText('My Season destination')).toBeVisible()
  })

  it('joins with trimmed league identity data and continues to My Season', async () => {
    const user = userEvent.setup()
    const refreshProfile = vi.fn().mockResolvedValue(undefined)
    vi.mocked(api.post).mockResolvedValue({ id: 'user-1', display_name: 'Danny', is_admin: false })

    renderWithApp(
      <Routes>
        <Route path="/join" element={<JoinPage />} />
        <Route path="/" element={<p>My Season destination</p>} />
      </Routes>,
      { route: '/join', auth: { session: memberSession, profile: null, refreshProfile } },
    )

    expect(screen.getByText('danny@example.com')).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), '  Danny  ')
    await user.type(screen.getByRole('textbox', { name: 'Join code' }), '  tribe-51  ')
    expect(screen.getByRole('heading', { name: 'Join your league' })).toBeVisible()
    expect(screen.getByText('This is how you will appear in standings.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Join league' }))

    expect(await screen.findByText('My Season destination')).toBeVisible()
    expect(api.post).toHaveBeenCalledWith('/join', { display_name: 'Danny', join_code: 'tribe-51' })
    expect(refreshProfile).toHaveBeenCalledOnce()
  })

  it('keeps an invalid join code beside the join action and allows retry', async () => {
    const user = userEvent.setup()
    vi.mocked(api.post).mockRejectedValue(new Error('That join code is not valid'))
    renderWithApp(<JoinPage />, {
      auth: { session: memberSession, profile: null, refreshProfile: vi.fn() },
    })

    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Danny')
    await user.type(screen.getByRole('textbox', { name: 'Join code' }), 'wrong-code')
    await user.click(screen.getByRole('button', { name: 'Join league' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That join code is not valid')
    expect(screen.getByRole('button', { name: 'Join league' })).toBeEnabled()
  })

  it('keeps league identity separate from account identity on Profile', async () => {
    const user = userEvent.setup()
    const refreshProfile = vi.fn().mockResolvedValue(undefined)
    vi.mocked(api.patch).mockResolvedValue({ id: 'user-1', display_name: 'Danny', is_admin: false })
    renderWithApp(<ProfilePage />, {
      auth: {
        session: memberSession,
        profile: { id: 'user-1', display_name: 'Test Player', is_admin: false },
        refreshProfile,
      },
    })

    expect(screen.getByRole('heading', { name: 'League profile' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Account identity' })).toBeVisible()
    expect(screen.getByText('danny@example.com')).toBeVisible()

    const displayName = screen.getByRole('textbox', { name: 'Display name' })
    await user.clear(displayName)
    await user.type(displayName, '  Danny  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('League profile saved')
    expect(api.patch).toHaveBeenCalledWith('/me', { display_name: 'Danny' })
  })
})
