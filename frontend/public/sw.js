// Minimal service worker: exists to satisfy PWA installability (#107).
// No caching — the app is small and scores are live; a stale shell would
// be worse than a moment of network.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // Intentionally empty: default network handling for everything.
})
