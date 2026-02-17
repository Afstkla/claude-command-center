import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Terminal } from './pages/Terminal';
import { Respond } from './pages/Respond';
import { UpdateToast } from './components/UpdateToast';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    fetch('/api/auth/check')
      .then((r) => setAuth(r.ok ? 'ok' : 'denied'))
      .catch(() => setAuth('denied'));
  }, []);

  if (auth === 'loading') return null;
  if (auth === 'denied') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <UpdateToast />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/respond/:requestId" element={<Respond />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/session/:id"
          element={
            <ProtectedRoute>
              <Terminal />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
