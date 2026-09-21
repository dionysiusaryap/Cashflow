import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Category, PaymentMethod } from '../store/useAppStore';
import { MdAdd, MdDownload, MdUpload, MdWarning, MdEdit, MdDelete, MdArrowUpward, MdArrowDownward } from 'react-icons/md';

const Pengaturan = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { 
    appSettings, categories, paymentMethods, incomes, expenses, installments,
    updateSettings, addCategory, updateCategory, deleteCategory,
    addPaymentMethod, updatePaymentMethod, deletePaymentMethod,
    addIncome, addExpense, addInstallment,
    deleteIncome, deleteExpense, deleteInstallment
  } = useAppStore();

  // Profil Form
  const [profile, setProfile] = useState({
    familyName: appSettings?.familyName || 'Keluarga',
    husbandName: appSettings?.husbandName || 'Suami',
    wifeName: appSettings?.wifeName || 'Istri'
  });

  const [preferences, setPreferences] = useState({
    theme: appSettings?.theme || 'system',
    defaultDashboardPeriod: appSettings?.defaultDashboardPeriod || 'Bulan Ini'
  });

  const [newCategory, setNewCategory] = useState({ name: '', type: 'expense' as 'income' | 'expense' | 'installment' });
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appSettings?.id) {
      await updateSettings(appSettings.id, {
        familyName: profile.familyName,
        husbandName: profile.husbandName,
        wifeName: profile.wifeName
      });
      alert('Profil berhasil disimpan!');
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appSettings?.id) {
      await updateSettings(appSettings.id, {
        theme: preferences.theme as 'light' | 'dark' | 'system',
        defaultDashboardPeriod: preferences.defaultDashboardPeriod
      });
      document.documentElement.setAttribute('data-theme', preferences.theme);
      alert('Preferensi berhasil disimpan!');
    }
  };

  const handleToggleCategory = async (cat: Category) => {
    if (cat.id) {
      await updateCategory(cat.id, { isActive: cat.isActive === 1 ? 0 : 1 });
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.name.trim()) {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
      await addCategory({
        name: newCategory.name.trim(),
        type: newCategory.type,
        isActive: 1,
        order: maxOrder + 1
      });
      setNewCategory({ name: '', type: newCategory.type });
    }
  };

  const handleEditCategory = async (cat: Category) => {
    const newName = window.prompt('Ubah nama kategori:', cat.name);
    if (newName && newName.trim() !== '' && newName !== cat.name && cat.id) {
      await updateCategory(cat.id, { name: newName.trim() });
      alert('Kategori diubah. Catatan lama tetap menggunakan nama lama.');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (window.confirm(`Hapus kategori "${cat.name}"? Peringatan: Disarankan 'Nonaktifkan' saja agar data lama tidak hilang kategorinya.`)) {
      if (cat.id) await deleteCategory(cat.id);
    }
  };

  const handleMoveCategory = async (cat: Category, direction: 'up' | 'down') => {
    const filteredCategories = categories.filter(c => c.type === cat.type);
    const index = filteredCategories.findIndex(c => c.id === cat.id);
    if ((direction === 'up' && index <= 0) || (direction === 'down' && index >= filteredCategories.length - 1)) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const current = filteredCategories[index];
    const target = filteredCategories[targetIndex];
    
    if (current.id && target.id) {
      let currentOrder = current.order ?? categories.findIndex(c => c.id === current.id);
      let targetOrder = target.order ?? categories.findIndex(c => c.id === target.id);
      
      if (currentOrder === targetOrder) {
        targetOrder = direction === 'up' ? currentOrder + 1 : currentOrder - 1;
      }

      await updateCategory(current.id, { order: targetOrder });
      await updateCategory(target.id, { order: currentOrder });
    }
  };

  const handleTogglePaymentMethod = async (pm: PaymentMethod) => {
    if (pm.id) {
      await updatePaymentMethod(pm.id, { isActive: pm.isActive === 1 ? 0 : 1 });
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPaymentMethod.trim()) {
      const maxOrder = paymentMethods.reduce((max, pm) => Math.max(max, pm.order ?? 0), 0);
      await addPaymentMethod({
        name: newPaymentMethod.trim(),
        isActive: 1,
        order: maxOrder + 1
      });
      setNewPaymentMethod('');
    }
  };

  const handleEditPaymentMethod = async (pm: PaymentMethod) => {
    const newName = window.prompt('Ubah metode pembayaran:', pm.name);
    if (newName && newName.trim() !== '' && newName !== pm.name && pm.id) {
      await updatePaymentMethod(pm.id, { name: newName.trim() });
      alert('Metode diubah. Catatan lama tetap menggunakan metode lama.');
    }
  };

  const handleDeletePaymentMethod = async (pm: PaymentMethod) => {
    if (window.confirm(`Hapus metode pembayaran "${pm.name}"?`)) {
      if (pm.id) await deletePaymentMethod(pm.id);
    }
  };

  const handleMovePaymentMethod = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === paymentMethods.length - 1)) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const current = paymentMethods[index];
    const target = paymentMethods[targetIndex];
    
    if (current.id && target.id) {
      let currentOrder = current.order ?? index;
      let targetOrder = target.order ?? targetIndex;
      if (currentOrder === targetOrder) targetOrder = direction === 'up' ? currentOrder + 1 : currentOrder - 1;
      
      await updatePaymentMethod(current.id, { order: targetOrder });
      await updatePaymentMethod(target.id, { order: currentOrder });
    }
  };

  const handleExport = async () => {
    try {
      const data = {
        incomes,
        expenses,
        installments,
        categories,
        paymentMethods,
        appSettings,
        exportDate: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cashflow_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor data.');
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonStr = event.target?.result as string;
        const data = JSON.parse(jsonStr);

        if (!data.incomes || !data.expenses) {
          alert('Format file backup tidak valid atau rusak!');
          return;
        }

        if (window.confirm('PERINGATAN: Mengimpor data akan memakan waktu untuk mengunggahnya ke Firebase. Lanjutkan?')) {
          // Loop over and push to Firebase (we exclude 'id' to create new docs)
          if (data.incomes?.length) {
            for (const item of data.incomes) {
              const { id, ...rest } = item;
              await addIncome(rest);
            }
          }
          if (data.expenses?.length) {
            for (const item of data.expenses) {
              const { id, ...rest } = item;
              await addExpense(rest);
            }
          }
          if (data.installments?.length) {
            for (const item of data.installments) {
              const { id, ...rest } = item;
              await addInstallment(rest);
            }
          }
          
          alert('Import data ke Cloud Firebase berhasil!');
        }
      } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan saat membaca atau memproses file backup.');
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (window.confirm('PERINGATAN KRITIKAL: Semua data di CLOUD akan dihapus. Lanjutkan?')) {
      if (window.confirm('Apakah Anda BENAR-BENAR yakin? Data yang hilang tidak dapat dikembalikan tanpa file backup.')) {
        
        // Delete all data one by one (Firestore requirement)
        for (const item of incomes) if (item.id) await deleteIncome(item.id);
        for (const item of expenses) if (item.id) await deleteExpense(item.id);
        for (const item of installments) if (item.id) await deleteInstallment(item.id);
        
        alert('Database telah dikosongkan.');
      }
    }
  };

  const filteredCategories = categories.filter(c => c.type === newCategory.type);

  return (
    <div>
      <div className="mb-4">
        <h1 className="page-title" style={{ marginBottom: '0' }}>Pengaturan</h1>
        <p className="text-secondary">Kelola profil, referensi, dan preferensi aplikasi</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Kolom Kiri */}
        <div>
          {/* PROFIL */}
          <div className="card mb-4">
            <h3 className="mb-4">👨‍👩‍👧 Profil Keluarga</h3>
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label className="form-label">Nama Keluarga</label>
                <input 
                  type="text" className="form-control" 
                  value={profile.familyName} onChange={e => setProfile({...profile, familyName: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Nama Suami</label>
                  <input 
                    type="text" className="form-control" 
                    value={profile.husbandName} onChange={e => setProfile({...profile, husbandName: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Istri</label>
                  <input 
                    type="text" className="form-control" 
                    value={profile.wifeName} onChange={e => setProfile({...profile, wifeName: e.target.value})}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Simpan Profil</button>
            </form>
          </div>

          {/* PREFERENSI */}
          <div className="card mb-4">
            <h3 className="mb-4">🎨 Preferensi Aplikasi</h3>
            <form onSubmit={handleSavePreferences}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Tema</label>
                  <select 
                    className="form-control" 
                    value={preferences.theme} onChange={e => setPreferences({...preferences, theme: e.target.value as 'light'|'dark'|'system'})}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System Default</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Default Periode Dashboard</label>
                  <select 
                    className="form-control"
                    value={preferences.defaultDashboardPeriod} onChange={e => setPreferences({...preferences, defaultDashboardPeriod: e.target.value})}
                  >
                    <option value="Bulan Ini">Bulan Ini</option>
                    <option value="3 Bulan Terakhir">3 Bulan Terakhir</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Simpan Preferensi</button>
            </form>
          </div>

          {/* DATA & BACKUP */}
          <div className="card">
            <h3 className="mb-4">💾 Data & Backup (Firebase Cloud)</h3>
            <div className="flex gap-2 mb-4">
              <button className="btn btn-outline" onClick={handleExport}>
                <MdDownload /> Export JSON
              </button>
              <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                <MdUpload /> Import JSON ke Cloud
              </button>
              <input 
                type="file" 
                accept=".json"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleImport}
              />
            </div>
            <div style={{ padding: '1rem', background: 'var(--danger-color)', color: 'white', borderRadius: 'var(--radius-md)' }}>
              <h4 className="flex align-center gap-2 mb-2"><MdWarning /> Hapus Semua Data Cloud</h4>
              <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Menghapus seluruh transaksi dari Firebase.</p>
              <button className="btn" style={{ background: 'white', color: 'var(--danger-color)' }} onClick={handleReset}>
                Hapus Semua Data
              </button>
            </div>
          </div>
        </div>

        {/* Kolom Kanan */}
        <div>
          {/* DATA REFERENSI KATEGORI */}
          <div className="card mb-4">
            <h3 className="mb-4">🛒 Kategori Transaksi</h3>
            
            <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
              <input 
                type="text" className="form-control" placeholder="Nama kategori baru" 
                value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} required
              />
              <select className="form-control" style={{ width: 'auto' }} value={newCategory.type} onChange={e => setNewCategory({...newCategory, type: e.target.value as any})}>
                <option value="expense">Pengeluaran</option>
                <option value="income">Pemasukan</option>
                <option value="installment">Cicilan</option>
              </select>
              <button type="submit" className="btn btn-primary"><MdAdd /></button>
            </form>

            <div style={{ maxHeight: '300px', overflowY: 'auto', borderRadius: 'var(--radius-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Tipe</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((cat, index) => (
                    <tr key={cat.id} style={{ opacity: cat.isActive === 1 ? 1 : 0.5 }}>
                      <td>{cat.name}</td>
                      <td>
                        {cat.type === 'expense' ? 'Pengeluaran' : cat.type === 'income' ? 'Pemasukan' : 'Cicilan'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleToggleCategory(cat)}
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', background: cat.isActive === 1 ? 'var(--success-color)' : 'var(--text-secondary)', color: 'white', fontWeight: 600 }}
                        >
                          {cat.isActive === 1 ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => handleMoveCategory(cat, 'up')} disabled={index === 0} style={{ background: 'none', border: 'none', color: index === 0 ? 'var(--border-color)' : 'var(--text-color)', cursor: index === 0 ? 'default' : 'pointer', fontSize: '1.2rem' }} title="Naik">
                            <MdArrowUpward />
                          </button>
                          <button onClick={() => handleMoveCategory(cat, 'down')} disabled={index === filteredCategories.length - 1} style={{ background: 'none', border: 'none', color: index === filteredCategories.length - 1 ? 'var(--border-color)' : 'var(--text-color)', cursor: index === filteredCategories.length - 1 ? 'default' : 'pointer', fontSize: '1.2rem' }} title="Turun">
                            <MdArrowDownward />
                          </button>
                          <button onClick={() => handleEditCategory(cat)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1.2rem' }} title="Edit">
                            <MdEdit />
                          </button>
                          <button onClick={() => handleDeleteCategory(cat)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.2rem' }} title="Hapus">
                            <MdDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DATA REFERENSI METODE PEMBAYARAN */}
          <div className="card">
            <h3 className="mb-4">💳 Metode Pembayaran</h3>
            
            <form onSubmit={handleAddPaymentMethod} className="flex gap-2 mb-4">
              <input 
                type="text" className="form-control" placeholder="Nama metode pembayaran baru" 
                value={newPaymentMethod} onChange={e => setNewPaymentMethod(e.target.value)} required
              />
              <button type="submit" className="btn btn-primary"><MdAdd /></button>
            </form>

            <div style={{ maxHeight: '200px', overflowY: 'auto', borderRadius: 'var(--radius-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentMethods.map((pm, index) => (
                    <tr key={pm.id} style={{ opacity: pm.isActive === 1 ? 1 : 0.5 }}>
                      <td>{pm.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleTogglePaymentMethod(pm)}
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', background: pm.isActive === 1 ? 'var(--success-color)' : 'var(--text-secondary)', color: 'white', fontWeight: 600 }}
                        >
                          {pm.isActive === 1 ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => handleMovePaymentMethod(index, 'up')} disabled={index === 0} style={{ background: 'none', border: 'none', color: index === 0 ? 'var(--border-color)' : 'var(--text-color)', cursor: index === 0 ? 'default' : 'pointer', fontSize: '1.2rem' }} title="Naik">
                            <MdArrowUpward />
                          </button>
                          <button onClick={() => handleMovePaymentMethod(index, 'down')} disabled={index === paymentMethods.length - 1} style={{ background: 'none', border: 'none', color: index === paymentMethods.length - 1 ? 'var(--border-color)' : 'var(--text-color)', cursor: index === paymentMethods.length - 1 ? 'default' : 'pointer', fontSize: '1.2rem' }} title="Turun">
                            <MdArrowDownward />
                          </button>
                          <button onClick={() => handleEditPaymentMethod(pm)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1.2rem' }} title="Edit">
                            <MdEdit />
                          </button>
                          <button onClick={() => handleDeletePaymentMethod(pm)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.2rem' }} title="Hapus">
                            <MdDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Pengaturan;
