import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

// Placeholder Pages
import Pemasukan from './pages/Pemasukan';
import Pengeluaran from './pages/Pengeluaran';
import Cicilan from './pages/Cicilan';
import Analisa from './pages/Analisa';

import Pengaturan from './pages/Pengaturan';

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
        <Route path="/" element={<Layout />}>
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
