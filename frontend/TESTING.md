# Frontend testing

Run the unit and component suite with:

```bash
npm test
```

Vitest, Testing Library, and jsdom cover pure UI logic and component behavior.
Use `src/test/render.tsx` for deterministic routing and authenticated state,
and mock `src/lib/api.ts` at the module boundary for components that fetch.
Frontend tests must not connect to production Supabase.

Backend API and database integration remain in pytest. Full-browser smoke
tests should stay focused on a small number of critical cross-stack flows
rather than duplicating every component test.
