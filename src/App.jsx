import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import PublicNavbar from './components/PublicNavbar.jsx';
import AboutUs from './pages/public/AboutUs.jsx';
import PublicFooter from './components/PublicFooter.jsx';
import { supabase } from './supabaseClient.js';

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
const Signup = lazy(() => import('./pages/Signup.jsx'));
const CommandCenter = lazy(() => import('./pages/CommandCenter.jsx'));
const BiodiversityHub = lazy(() => import('./pages/BiodiversityHub.jsx'));
const ActionBoard = lazy(() => import('./pages/ActionBoard.jsx'));
const ManageArborists = lazy(() => import('./pages/ManageArborists.jsx'));
const PermitsLog = lazy(() => import('./pages/PermitsLog.jsx'));
const BiodiversityDashboard = lazy(() => import('./pages/BiodiversityDashboard.jsx'));
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
  const mainClassName = isMapRoute
    ? 'flex-1 overflow-auto'
    : 'flex-1 overflow-auto p-6';
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <main className={mainClassName}>
        {/* Inside the shell, so the header stays while a page arrives. */}
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

function PublicShell() {
  const location = useLocation();
  // The map fills the screen and carries its own controls down to the bottom
  // edge; a footer under it only competes for the attention it needs.
  const hideFooter = location.pathname === '/public-map';

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNavbar />
      <main className="flex-1">
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

function ProtectedRoute({ session }) {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Shell />;
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = no session

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
      <Route path="/signup" element={session ? <Navigate to="/biodiversity-dashboard" replace /> : <Signup />} />

      {/* Public-facing routes with PublicNavbar */}
      <Route element={<PublicShell />}>
        <Route index element={<Navigate to="/about" replace />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/biodiversity" element={<PublicDashboard />} />
        <Route path="/public-map" element={<PublicMap />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute session={session} />}>
        <Route path="map" element={<CommandCenter />} />
        <Route path="inventory" element={<BiodiversityHub />} />
        <Route path="action-board" element={<ActionBoard />} />
        <Route path="arborists" element={<ManageArborists />} />
        <Route path="permits" element={<PermitsLog />} />
        <Route path="biodiversity-dashboard" element={<BiodiversityDashboard />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      </Routes>
      </Suspense>
    </>
  );
}
