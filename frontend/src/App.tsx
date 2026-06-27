import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { FinalePage } from './pages/FinalePage'
import { LoginPage } from './pages/LoginPage'
import { PicksPage } from './pages/PicksPage'
import { RosterPage } from './pages/RosterPage'
import { StandingsPage } from './pages/StandingsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<StandingsPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route
              path="roster"
              element={<ProtectedRoute><RosterPage /></ProtectedRoute>}
            />
            <Route
              path="picks"
              element={<ProtectedRoute><PicksPage /></ProtectedRoute>}
            />
            <Route
              path="finale"
              element={<ProtectedRoute><FinalePage /></ProtectedRoute>}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
