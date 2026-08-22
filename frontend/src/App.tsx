import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminPage } from './pages/AdminPage'
import { CastPage } from './pages/CastPage'
import { JoinPage } from './pages/JoinPage'
import { ContestantPage } from './pages/ContestantPage'
import { LoginPage } from './pages/LoginPage'
import { MySeasonPage } from './pages/MySeasonPage'
import { RulesPage } from './pages/RulesPage'
import { ProfilePage } from './pages/ProfilePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { StandingsPage } from './pages/StandingsPage'
import { TeamPage } from './pages/TeamPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth screens own the full viewport (camp-at-night, #508) — no app
              shell, header or nav behind them. */}
          <Route path="login" element={<LoginPage />} />
          <Route path="join" element={<JoinPage />} />
          <Route path="reset" element={<ResetPasswordPage />} />
          <Route element={<Layout />}>
            <Route index element={<ProtectedRoute><MySeasonPage /></ProtectedRoute>} />
            {/* Roster, votes and the weekly play live on one page now (#307).
                Old links keep working. */}
            <Route path="my-votes" element={<Navigate to="/" replace />} />
            <Route
              path="standings"
              element={<ProtectedRoute><StandingsPage /></ProtectedRoute>}
            />
            <Route
              path="seasons/:seasonId/team/:userId"
              element={<ProtectedRoute><TeamPage /></ProtectedRoute>}
            />
            <Route
              path="contestants/:contestantId"
              element={<ProtectedRoute><ContestantPage /></ProtectedRoute>}
            />
            <Route path="advantages" element={<Navigate to="/" replace />} />
            <Route
              path="cast"
              element={<ProtectedRoute><CastPage /></ProtectedRoute>}
            />
            <Route
              path="rules"
              element={<ProtectedRoute><RulesPage /></ProtectedRoute>}
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
