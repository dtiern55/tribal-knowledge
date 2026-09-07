import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOADER_DELAY_MS, PageLoader } from './PageLoader'

afterEach(() => vi.useRealTimers())

describe('PageLoader', () => {
  it('hands off to the loader that replaces it, so a cold open is one loading screen (#698)', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <div key="guard">
        <PageLoader label="Restoring your session…" />
      </div>,
    )
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    const first = screen.getByRole('status', { name: 'Restoring your session…' })
    expect(first.parentElement).toHaveClass('tk-loader-fade')
    const quote = first.querySelector('blockquote')?.textContent

    // The route guard is done; the page mounts its own loader in the same commit.
    rerender(
      <div key="page">
        <PageLoader />
      </div>,
    )
    const second = screen.getByRole('status', { name: 'Loading' })
    expect(second.querySelector('blockquote')?.textContent).toBe(quote)
    expect(second.parentElement).not.toHaveClass('tk-loader-fade')
  })

  it('starts fresh when nothing was loading', () => {
    vi.useFakeTimers()
    render(<PageLoader />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    expect(screen.getByRole('status').parentElement).toHaveClass('tk-loader-fade')
  })
})
