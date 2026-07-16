import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminPage } from './pages/AdminPage'
import { AdvantagesPage } from './pages/AdvantagesPage'
import { FinalePage } from './pages/FinalePage'
import { JoinPage } from './pages/JoinPage'
import { LoginPage } from './pages/LoginPage'
import { MySeasonPage } from './pages/MySeasonPage'
import { ProfilePage } from './pages/ProfilePage'
import { StandingsPage } from './pages/StandingsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ProtectedRoute><StandingsPage /></ProtectedRoute>} />
            <Route path="login" element={<LoginPage />} />
            <Route path="join" element={<JoinPage />} />
            <Route
              path="my-season"
              element={<ProtectedRoute><MySeasonPage /></ProtectedRoute>}
            />
            <Route
              path="advantages"
              element={<ProtectedRoute><AdvantagesPage /></ProtectedRoute>}
            />
            <Route
              path="finale"
              element={<ProtectedRoute><FinalePage /></ProtectedRoute>}
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
