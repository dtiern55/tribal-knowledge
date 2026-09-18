import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no matchMedia; code that checks prefers-reduced-motion needs it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// jsdom has no ResizeObserver either. It is baseline in every browser the app
// targets, so the stub belongs here rather than as a guard in the source.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// `lib/supabase` builds a client at import, from env this suite has no reason
// to carry. Page tests began loading it the moment they started mocking
// `lib/api` partially, which passed locally off a gitignored .env.local and
// failed in CI. One stub here beats env vars in the workflow: a unit test has
// no business opening a client at all.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  // The ballot's room light is a class on <html>; a test that unmounts
  // mid-fade would otherwise leak it into the next one.
  document.documentElement.classList.remove('ballot-room', 'ballot-room--leaving', 'page-loading')
})
