import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth'

const navItems = [
  { to: '/', label: 'Standings' },
  { to: '/roster', label: 'My Roster' },
  { to: '/picks', label: 'Picks' },
  { to: '/finale', label: 'Finale' },
]

export function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-14 gap-6">
          <span className="font-semibold text-gray-900 mr-2">Tribal Knowledge</span>
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `text-sm ${isActive ? 'text-indigo-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
              }
            >
              {label}
            </NavLink>
          ))}
          <div className="ml-auto">
            {session ? (
              <button
                onClick={() => void signOut()}
                className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Sign out
              </button>
            ) : (
              <NavLink to="/login" className="text-sm text-indigo-600 font-medium">
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
