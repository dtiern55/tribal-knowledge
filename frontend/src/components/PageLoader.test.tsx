import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOADER_DELAY_MS, PageLoader } from './PageLoader'
import { LOADER_HANDOFF_MS } from './SlidePuzzleLoader'

afterEach(() => {
  // Unmount first, then let the handoff window expire, so one test's loader
  // is never still "live" when the next one mounts.
  cleanup()
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers()
  vi.useRealTimers()
  document.documentElement.classList.remove('locked-night')
})

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
    expect(first.innerHTML).toContain('/puzzle-unlocked-teak.webp?v=20260913')
    expect(first.innerHTML).toContain('/wood-teak-dark.webp?v=20260915')
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

  it('continues across a gap, so a page that re-enters loading does not restart the screen', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <div key="page">
        <PageLoader />
      </div>,
    )
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    const quote = screen.getByRole('status').querySelector('blockquote')?.textContent

    // The page lands and immediately goes back to loading a commit later —
    // what a lock flip does, since the open episode moves under it.
    rerender(<div key="page" />)
    act(() => vi.advanceTimersByTime(LOADER_HANDOFF_MS - 100))
    rerender(
      <div key="page">
        <PageLoader />
      </div>,
    )

    const resumed = screen.getByRole('status')
    // Straight back up: no second hold, no second fade, same quote and board.
    expect(resumed.parentElement).not.toHaveClass('tk-loader-fade')
    expect(resumed.querySelector('blockquote')?.textContent).toBe(quote)
  })

  it('starts fresh once the handoff window has passed', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <div key="page">
        <PageLoader />
      </div>,
    )
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    rerender(<div key="page" />)
    act(() => vi.advanceTimersByTime(LOADER_HANDOFF_MS + 100))

    rerender(
      <div key="page">
        <PageLoader />
      </div>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    expect(screen.getByRole('status').parentElement).toHaveClass('tk-loader-fade')
  })

  it('starts fresh when nothing was loading', () => {
    vi.useFakeTimers()
    render(<PageLoader />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    expect(screen.getByRole('status').parentElement).toHaveClass('tk-loader-fade')
  })

  it('uses Birch tiles and a Maple board after lock', () => {
    vi.useFakeTimers()
    document.documentElement.classList.add('locked-night')
    render(<PageLoader />)
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))

    const loader = screen.getByRole('status', { name: 'Loading' })
    expect(loader.innerHTML).toContain('/puzzle-locked-birch.webp?v=20260913')
    expect(loader.innerHTML).toContain('/wood-maple.webp?v=20260915')
  })

  it('cross-fades to the other wood when the shell flips mid-load', async () => {
    vi.useFakeTimers()
    render(<PageLoader />)
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS))
    const loader = screen.getByRole('status')
    expect(loader.innerHTML).toContain('/puzzle-unlocked-teak.webp?v=20260913')

    await act(async () => {
      document.documentElement.classList.add('locked-night')
      await Promise.resolve()
    })

    // Both boards are on screen: the Birch one underneath, the Teak one
    // stacked over it and dissolving away.
    expect(loader.innerHTML).toContain('/puzzle-locked-birch.webp?v=20260913')
    expect(loader.querySelector('.tk-puzzle-crossfade')?.innerHTML).toContain(
      '/puzzle-unlocked-teak.webp?v=20260913',
    )

    act(() => vi.advanceTimersByTime(1000))
    expect(loader.querySelector('.tk-puzzle-crossfade')).toBeNull()
    expect(loader.innerHTML).not.toContain('/puzzle-unlocked-teak.webp?v=20260913')
  })
})
