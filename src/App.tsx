import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

// Pages
import Pemasukan from './pages/Pemasukan';
import Pengeluaran from './pages/Pengeluaran';
import Cicilan from './pages/Cicilan';
import Analisa from './pages/Analisa';
import Pengaturan from './pages/Pengaturan';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, authLoaded } = useAppStore();
  const location = useLocation();

  if (!authLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2>Memuat Cashflow...</h2>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

function App() {
  const appSettings = useAppStore(state => state.appSettings);

  useEffect(() => {
    if (appSettings?.theme) {
      document.documentElement.setAttribute('data-theme', appSettings.theme);
    }
  }, [appSettings?.theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="pemasukan" element={<Pemasukan />} />
          <Route path="pengeluaran" element={<Pengeluaran />} />
          <Route path="cicilan" element={<Cicilan />} />
          <Route path="analisa" element={<Analisa />} />
          <Route path="pengaturan" element={<Pengaturan />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
