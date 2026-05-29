import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import SmoothScroll from './components/SmoothScroll'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import LandingPage from './pages/LandingPage'
import SetPassword from './pages/SetPassword'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import GuestPortal from './pages/GuestPortal'
import FreelancerPortal from './pages/FreelancerPortal'
import EmployeePortal from './pages/EmployeePortal'
import Careers from './pages/Careers'
import Application from './pages/Application'
import { ADMIN_DASHBOARD_PATH } from './config/brand'

/** Old bookmarks: /admin or /techbank → /skillvault (keep query string). */
function LegacyDashboardRedirect({ fromPrefix }) {
  const { pathname, search } = useLocation()
  const tail = pathname.slice(fromPrefix.length)
  const to =
    ADMIN_DASHBOARD_PATH +
    (tail.startsWith('/') ? tail : tail ? `/${tail}` : '') +
    search
  return <Navigate to={to} replace />
}

/** Separate Vite dev servers behind /guest, /freelancer, /employee (see vite.config.portal.js). */
function PortalOnlyRoutes({ portal }) {
  const Page =
    portal === 'guest'
      ? GuestPortal
      : portal === 'freelancer'
        ? FreelancerPortal
        : EmployeePortal
  return (
    <Routes>
      <Route path="/" element={<Page />} />
      {/* Portals redirect here; without this route the catch-all sent users back to "/" → blank / loop */}
      <Route path="/application" element={<Application />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/Careers" element={<Navigate to="/careers" replace />} />
      <Route path="/careers.html" element={<Navigate to="/careers" replace />} />
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function resolvePortalMode() {
  const mode = import.meta.env.MODE
  if (!mode.startsWith('portal-')) return null
  let rest = mode.slice('portal-'.length)
  if (rest.endsWith('-proxy')) rest = rest.slice(0, -'-proxy'.length)
  if (rest === 'guest' || rest === 'freelancer' || rest === 'employee') return rest
  return null
}

function AppRoutes() {
  const portal = resolvePortalMode()
  if (portal) {
    return <PortalOnlyRoutes portal={portal} />
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/guest" element={<GuestPortal />} />
      <Route path="/freelancer" element={<FreelancerPortal />} />
      <Route path="/employee" element={<EmployeePortal />} />
      {/* Careers: support /careers, /Careers, and /careers.html so reload always stays on careers */}
      <Route path="/careers" element={<Careers />} />
      <Route path="/Careers" element={<Navigate to="/careers" replace />} />
      <Route path="/careers.html" element={<Navigate to="/careers" replace />} />
      <Route path="/application" element={<Application />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/admin/*" element={<LegacyDashboardRedirect fromPrefix="/admin" />} />
      <Route path="/techbank/*" element={<LegacyDashboardRedirect fromPrefix="/techbank" />} />
      <Route
        path={`${ADMIN_DASHBOARD_PATH}/*`}
        element={
          <ProtectedRoute adminOnly={true}>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  console.log('📱 App component rendering...')

  try {
    return (
      <AppProvider>
        <SmoothScroll>
          <AppRoutes />
        </SmoothScroll>
      </AppProvider>
    )
  } catch (error) {
    console.error('❌ Error in App component:', error)
    return (
      <div style={{ padding: '20px', color: 'red', fontFamily: 'Arial' }}>
        <h1>Error in App Component</h1>
        <p>{error.message}</p>
        <pre>{error.stack}</pre>
      </div>
    )
  }
}

export default App

