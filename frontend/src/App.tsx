import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminPage } from './pages/AdminPage'
import { AdvantagesPage } from './pages/AdvantagesPage'
import { CastPage } from './pages/CastPage'
import { JoinPage } from './pages/JoinPage'
import { ContestantPage } from './pages/ContestantPage'
import { LoginPage } from './pages/LoginPage'
import { MySeasonPage } from './pages/MySeasonPage'
import { ProfilePage } from './pages/ProfilePage'
import { StandingsPage } from './pages/StandingsPage'
import { TeamPage } from './pages/TeamPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ProtectedRoute><MySeasonPage /></ProtectedRoute>} />
            <Route path="login" element={<LoginPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route
              path="standings"
              element={<ProtectedRoute><StandingsPage /></ProtectedRoute>}
            />
            <Route
              path="my-season"
              element={<ProtectedRoute><MySeasonPage /></ProtectedRoute>}
            />
            <Route
              path="seasons/:seasonId/team/:userId"
              element={<ProtectedRoute><TeamPage /></ProtectedRoute>}
            />
            <Route
              path="contestants/:contestantId"
              element={<ProtectedRoute><ContestantPage /></ProtectedRoute>}
            />
            <Route
              path="advantages"
              element={<ProtectedRoute><AdvantagesPage /></ProtectedRoute>}
            />
            <Route
              path="cast"
              element={<ProtectedRoute><CastPage /></ProtectedRoute>}
            />
            <Route
              path="profile"
              element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
            />
            <Route
              path="admin"
              element={<ProtectedRoute><AdminPage /></ProtectedRoute>}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
