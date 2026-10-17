import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import PublicNavbar from './components/PublicNavbar.jsx';
import AccountBlocked from './components/AccountBlocked.jsx';
import AdminFooter from './components/AdminFooter.jsx';
import DesktopNotice from './components/DesktopNotice.jsx';
import TrainingBanner from './components/TrainingBanner.jsx';
import AboutUs from './pages/public/AboutUs.jsx';
import PublicFooter from './components/PublicFooter.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { accessFor, isPgenro } from './lib/roles.js';

/**
 * Every page but the landing one is fetched when it is first opened.
 *
 * The whole site used to be one 2.5 MB file, so a resident opening the map on
 * a phone downloaded the permit forms, the arborist management screens, the
 * certificate printer and the charting library along with it — none of which
 * they can even reach without signing in.
 *
 * AboutUs stays loaded up front because "/" redirects to it: making the
 * landing page wait for a second request would trade one problem for another.
 */
const PublicDashboard = lazy(() => import('./pages/public/PublicDashboard.jsx'));
const PublicMap = lazy(() => import('./pages/public/PublicMap.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Activate = lazy(() => import('./pages/Activate.jsx'));
const Accounts = lazy(() => import('./pages/pgenro/Accounts.jsx'));
const MapLayersPage = lazy(() => import('./pages/pgenro/MapLayersPage.jsx'));
const MenroMap = lazy(() => import('./pages/MenroMap.jsx'));
const BiodiversityHub = lazy(() => import('./pages/BiodiversityHub.jsx'));
const ActionBoard = lazy(() => import('./pages/ActionBoard.jsx'));
const MapSheet = lazy(() => import('./pages/MapSheet.jsx'));
const Settings = lazy(() => import('./pages/settings/Settings.jsx'));
const ManageArborists = lazy(() => import('./pages/ManageArborists.jsx'));
const PermitsLog = lazy(() => import('./pages/PermitsLog.jsx'));
const OfficeBioDashboard = lazy(() => import('./pages/OfficeBioDashboard.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/** Shown for the moment a page's code is in flight. */
function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Starts every page at the top.
 *
 * A router swaps the page without touching the scroll position, so following a
 * link from the foot of a long page lands on the foot of the next one — which
 * is how the BioDashboard opened on its own footer with the charts above the
 * fold.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    globalThis.scrollTo?.({ top: 0, left: 0, behavior: reduceMotion ? 'auto' : 'instant' });
  }, [pathname]);

  return null;
}

function Shell() {
  const location = useLocation();
  const isMapRoute = location.pathname === '/map';
  // The map fills the space between header and footer exactly; `relative`
  // so its panels and controls are placed against it, not the window.
  const mainClassName = isMapRoute
    ? 'relative flex-1 overflow-hidden'
    // relative: what a page positions absolutely (a hint's pop-up, say) is
    // placed against this scrolling area, not the window, which it otherwise
    // stretched far below the footer.
    : 'relative flex-1 overflow-auto p-6';
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <TrainingBanner />
      <DesktopNotice />
      <main className={mainClassName}>
        {/* Inside the shell, so the header stays while a page arrives. */}
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <AdminFooter />
    </div>
  );
}

function PublicShell() {
  const location = useLocation();
  // The map fills the screen and carries its own controls down to the bottom
  // edge; a footer under it only competes for the attention it needs.
  const hideFooter = location.pathname === '/public-map';

  // The map is exactly one screen under the navbar, and the window never
  // scrolls on it: a panel sliding in from the edge gave the browser
  // somewhere to scroll to, and it did.
  return (
    <div className={hideFooter ? 'flex h-[100dvh] flex-col overflow-hidden' : 'min-h-screen flex flex-col'}>
      <PublicNavbar />
      <main className={hideFooter ? 'min-h-0 flex-1' : 'flex-1'}>
        {/* Inside the shell, not around it: a page arriving should not take
            the navigation away while it does. */}
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      {!hideFooter && <PublicFooter />}
    </div>
  );
}

/**
 * The signed-in side, for the people it is for.
 *
 * Signed in is not enough any more. A field officer has an account but works
 * from the mobile app; a locked or archived account has a session but no
 * business using it. Each is told which, instead of being handed a dashboard
 * the database would then refuse to fill.
 */
function ProtectedRoute({ bare = false }) {
  const { session, profile } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (profile === undefined) return <PageLoading />;

  const access = accessFor(profile);
  if (access.kind !== 'web') {
    return <AccountBlocked access={access} email={session.user?.email} />;
  }
  return bare ? <BareShell /> : <Shell />;
}

/**
 * A page that is its own piece of work in its own tab — the map sheet — with
 * no navigation to wander off by: it brings its own bar and a Close.
 */
function BareShell() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

/** PGENRO's pages. Anyone else gets the same Not Found an unknown page would. */
function PgenroOnly({ children }) {
  const { profile } = useAuth();
  return isPgenro(profile) ? children : <NotFound />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { session } = useAuth();

  // Show nothing while checking auth state
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoading />}>
      <Routes>
      {/* Auth routes */}
      <Route path="/login" element={session ? <Navigate to="/biodiversity-dashboard" replace /> : <Login />} />
      {/* No open sign-up any more: an LGU account is set up with a code from
          PGENRO, and field officers register from the mobile app. The old
          address still lands somewhere useful. */}
      <Route path="/activate" element={session ? <Navigate to="/biodiversity-dashboard" replace /> : <Activate />} />
      <Route path="/signup" element={<Navigate to="/activate" replace />} />

      {/* Public-facing routes with PublicNavbar */}
      <Route element={<PublicShell />}>
        <Route index element={<Navigate to="/about" replace />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/biodiversity" element={<PublicDashboard />} />
        <Route path="/public-map" element={<PublicMap />} />
      </Route>

      {/* Protected routes */}
      {/* Opened in its own tab from the map, and closed back to it. */}
      <Route element={<ProtectedRoute bare />}>
        <Route path="map-sheet" element={<MapSheet />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="accounts" element={<PgenroOnly><Accounts /></PgenroOnly>} />
        <Route path="map-layers" element={<PgenroOnly><MapLayersPage /></PgenroOnly>} />
        <Route path="map" element={<MenroMap />} />
        <Route path="settings" element={<Settings />} />
        <Route path="inventory" element={<BiodiversityHub />} />
        <Route path="action-board" element={<ActionBoard />} />
        <Route path="arborists" element={<ManageArborists />} />
        <Route path="permits" element={<PermitsLog />} />
        <Route path="biodiversity-dashboard" element={<OfficeBioDashboard />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      </Routes>
      </Suspense>
    </>
  );
}
