import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import PublicNavbar from './components/PublicNavbar.jsx';
import CommandCenter from './pages/CommandCenter.jsx';
import BiodiversityHub from './pages/BiodiversityHub.jsx';
import ActionBoard from './pages/ActionBoard.jsx';
import ManageArborists from './pages/ManageArborists.jsx';
import PermitsLog from './pages/PermitsLog.jsx';
import BiodiversityDashboard from './pages/BiodiversityDashboard.jsx';
import AboutUs from './pages/public/AboutUs.jsx';
import PublicDashboard from './pages/public/PublicDashboard.jsx';
import PublicMap from './pages/public/PublicMap.jsx';
import WikiTrees from './pages/public/WikiTrees.jsx';
import NotFound from './pages/NotFound.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import { supabase } from './supabaseClient.js';

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
        <Outlet />
      </main>
    </div>
  );
}

function PublicShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
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
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={session ? <Navigate to="/biodiversity-dashboard" replace /> : <Login />} />
      <Route path="/signup" element={session ? <Navigate to="/biodiversity-dashboard" replace /> : <Signup />} />

      {/* Public-facing routes with PublicNavbar */}
      <Route element={<PublicShell />}>
        <Route index element={<Navigate to="/biodiversity" replace />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/biodiversity" element={<PublicDashboard />} />
        <Route path="/public-map" element={<PublicMap />} />
        <Route path="/wiki-trees" element={<WikiTrees />} />
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
  );
}
