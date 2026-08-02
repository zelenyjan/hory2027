import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './lib/session';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { SetPasswordGate } from './pages/SetPasswordGate';
import { AboutPage } from './pages/AboutPage';
import { ChatPage } from './pages/ChatPage';
import { VotingPage } from './pages/VotingPage';
import { PlacesPage } from './pages/PlacesPage';
import { PlaceDetailPage } from './pages/PlaceDetailPage';
import { LinksPage } from './pages/LinksPage';
import { AdminPage } from './pages/AdminPage';
import { Spinner } from './components/ui';

export function App() {
  const { data: user, isPending } = useMe();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (user.mustSetPassword) return <SetPasswordGate />;

  return (
    <Routes>
      <Route path="/about" element={<AboutPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout user={user} />}>
        <Route path="/" element={<ChatPage />} />
        <Route path="/voting" element={<VotingPage />} />
        <Route path="/places" element={<PlacesPage />} />
        <Route path="/places/:id" element={<PlaceDetailPage />} />
        <Route path="/links" element={<LinksPage />} />
        <Route
          path="/admin"
          element={user.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
