import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { auth } from './db/firebase';
import { signOut } from 'firebase/auth';

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

  const allowedEmails = ['dionysiusaryap@gmail.com', 'marialaksmiparahita@gmail.com'];
  if (user.email && !allowedEmails.includes(user.email)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', textAlign: 'center', padding: '2rem' }}>
        <h2 style={{color: 'red'}}>Akses Ditolak 🛑</h2>
        <p>Email <strong>{user.email}</strong> tidak memiliki izin untuk membuka brankas Cashflow ini.</p>
        <button onClick={() => signOut(auth)} style={{marginTop: '1rem', padding: '0.75rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600}}>
          Logout & Gunakan Akun Lain
        </button>
      </div>
    );
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
