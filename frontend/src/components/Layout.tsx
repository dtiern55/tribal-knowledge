import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth'

// Primary destinations. On desktop they sit inline in the top bar; on phones
// they become a fixed bottom tab bar (thumb-reachable, can't overflow).
const PRIMARY = [
  { to: '/', label: 'My Season', icon: '🏝️', end: true },
  { to: '/standings', label: 'Standings', icon: '🏆', end: false },
  { to: '/cast', label: 'Cast', icon: '👥', end: false },
  { to: '/advantages', label: 'Advantages', icon: '🎟️', end: false },
]

export function Layout() {
  const { session, profile, signOut } = useAuth()
  const authed = Boolean(session && profile)
  const tabs =
    authed && profile?.is_admin
      ? [...PRIMARY, { to: '/admin', label: 'Admin', icon: '⚙️', end: false }]
      : PRIMARY

  const topLink = ({ isActive }: { isActive: boolean }) =>
    `text-sm ${isActive ? 'text-ocean-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`

  return (
    <div className="min-h-screen bg-sand-50">
      <nav className="bg-white border-b border-sand-200">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-14 gap-6">
          <NavLink
            to="/"
            className="font-display text-lg md:text-xl tracking-wide leading-none shrink-0"
          >
            <span className="text-ocean-700">TRIBAL</span>{' '}
            <span className="text-jungle-600">KNOWLEDGE</span>
          </NavLink>

          {authed && (
            <div className="hidden md:flex items-center gap-6">
              {tabs.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} className={topLink}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-4">
            {authed && (
              <NavLink to="/profile" className={topLink}>
                {profile?.display_name}
              </NavLink>
            )}
            {session ? (
              <button
                onClick={() => void signOut()}
                className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Sign out
              </button>
            ) : (
              <NavLink to="/login" className="text-sm text-ocean-600 font-medium">
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <Outlet />
      </main>

      {authed && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-sand-200 flex">
          {tabs.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                  isActive ? 'text-ocean-700' : 'text-gray-500'
                }`
              }
            >
              <span className="text-lg leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
