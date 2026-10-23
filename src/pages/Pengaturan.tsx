import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Category, PaymentMethod, FinancialAccount, AccountType } from '../types/finance';
import { formatCurrency } from '../utils/format';
import { prepareBackupImport, resolveForeignKey } from '../utils/backupRestore';
import { 
  MdAdd, 
  MdDownload, 
  MdUpload, 
  MdWarning, 
  MdEdit, 
  MdDelete, 
  MdAccountBalance,
  MdCheckCircle
} from 'react-icons/md';

const Pengaturan = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { 
    appSettings, 
    categories, 
    paymentMethods, 
    incomes, 
    expenses, 
    installments,
    financialAccounts,
    debtStatements,
    transfers,
    updateSettings, 
    addCategory, 
    updateCategory, 
    deleteCategory,
    addPaymentMethod, 
    updatePaymentMethod, 
    deletePaymentMethod,
    addIncome, 
    addExpense, 
    addInstallment,
    addFinancialAccount,
    updateFinancialAccount,
    deleteFinancialAccount
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

  // Akun Keuangan Form
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'Bank' as AccountType,
    owner: 'Bersama' as 'Suami' | 'Istri' | 'Bersama',
    current_balance: '',
    credit_limit: ''
  });

  // Import Preview State
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appSettings?.id) {
      await updateSettings(appSettings.id, {
        familyName: profile.familyName,
        husbandName: profile.husbandName,
        wifeName: profile.wifeName
      });
      alert('Profil keluarga berhasil disimpan!');
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

  // Kategori Handlers
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
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (window.confirm(`Hapus kategori "${cat.name}"? Disarankan cukup non-aktifkan agar riwayat lama tetap jelas.`)) {
      if (cat.id) await deleteCategory(cat.id);
    }
  };


  // Payment Method Handlers
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

  const handleDeletePaymentMethod = async (pm: PaymentMethod) => {
    if (window.confirm(`Hapus metode pembayaran "${pm.name}"?`)) {
      if (pm.id) await deletePaymentMethod(pm.id);
    }
  };

  // Akun Keuangan Handlers
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.name.trim()) return;

    try {
      const accountName = newAccount.name.trim();
      await addFinancialAccount({
        name: accountName,
        type: newAccount.type,
        owner: newAccount.owner,
        currency: 'IDR',
        opening_balance: Number(newAccount.current_balance) || 0,
        current_balance: Number(newAccount.current_balance) || 0,
        credit_limit: newAccount.credit_limit ? Number(newAccount.credit_limit) : undefined,
        isActive: 1,
        timestamp: Date.now()
      });

      alert(`✓ Akun "${accountName}" berhasil ditambahkan!`);

      setNewAccount({
        name: '',
        type: 'Bank',
        owner: 'Bersama',
        current_balance: '',
        credit_limit: ''
      });
    } catch (err: any) {
      console.error(err);
      alert(`Gagal menambahkan akun: ${err.message || 'Error tidak diketahui'}`);
    }
  };

  const handleEditAccountBalance = async (acc: FinancialAccount) => {
    const input = window.prompt(`Update saldo saat ini untuk "${acc.name}" (Rp):`, acc.current_balance.toString());
    if (input !== null) {
      const cleanInput = input.replace(/[^0-9.-]/g, '');
      const newBalance = Number(cleanInput);

      if (isNaN(newBalance)) {
        alert('Nominal yang dimasukkan tidak valid. Harap masukkan angka yang benar.');
        return;
      }

      try {
        await updateFinancialAccount(acc.id, { current_balance: newBalance });
        alert(`✓ Sukses! Saldo "${acc.name}" berhasil diperbarui menjadi ${formatCurrency(newBalance)}.`);
      } catch (err: any) {
        console.error(err);
        alert(`Gagal memperbarui saldo: ${err.message || 'Periksa koneksi atau izin akses'}`);
      }
    }
  };

  // Backup & Restore
  const handleExport = async () => {
    try {
      const data = {
        version: "2.0.0",
        app: "Cashflow",
        exportDate: new Date().toISOString(),
        incomes,
        expenses,
        installments,
        categories,
        paymentMethods,
        appSettings,
        financialAccounts,
        debtStatements,
        transfers
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cashflow_Backup_v2_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor data.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonStr = event.target?.result as string;
        const data = JSON.parse(jsonStr);

        if (!data.incomes && !data.expenses && !data.installments) {
          alert('Format file backup tidak valid atau tidak memiliki data yang dikenali.');
          return;
        }

        setImportPreview(data);
      } catch (err) {
        console.error(err);
        alert('File JSON tidak valid atau rusak.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview || isImporting) return;
    setIsImporting(true);

    try {
      const plan = prepareBackupImport(importPreview, {
        incomes,
        expenses,
        installments,
        financialAccounts
      });

      const accountIdMap = new Map<string, string>(plan.existingAccountMap);
      const installmentIdMap = new Map<string, string>(plan.existingInstallmentMap);

      let importedCount = 0;

      // 1. Import New Accounts
      for (const acc of plan.accounts) {
        const newId = await addFinancialAccount(acc.item);
        if (acc.originalId) {
          accountIdMap.set(acc.originalId, newId);
        }
        importedCount++;
      }

      // 2. Import New Installments
      const knownExistingAccountIds = new Set(
        financialAccounts.map(a => a.id).filter((id): id is string => Boolean(id))
      );

      for (const inst of plan.installments) {
        const mappedInst = { ...inst.item };
        if (mappedInst.linked_account_id) {
          mappedInst.linked_account_id = resolveForeignKey(
            mappedInst.linked_account_id,
            accountIdMap,
            knownExistingAccountIds
          );
        }
        const newId = await addInstallment(mappedInst);
        if (inst.originalId) {
          installmentIdMap.set(inst.originalId, newId);
        }
        importedCount++;
      }

      // 3. Import Incomes
      for (const inc of plan.incomes) {
        await addIncome(inc.item);
        importedCount++;
      }

      // 4. Import Expenses (with remapped relations)
      const knownInstallmentIds = new Set(
        installments.map(i => i.id).filter((id): id is string => Boolean(id))
      );
      const knownAccountIds = new Set(
        financialAccounts.map(a => a.id).filter((id): id is string => Boolean(id))
      );

      for (const exp of plan.expenses) {
        const mappedExp = { ...exp.item };
        if (mappedExp.installment_id) {
          mappedExp.installment_id = resolveForeignKey(
            mappedExp.installment_id,
            installmentIdMap,
            knownInstallmentIds
          );
        }
        if (mappedExp.source_account_id) {
          mappedExp.source_account_id = resolveForeignKey(
            mappedExp.source_account_id,
            accountIdMap,
            knownAccountIds
          );
        }
        await addExpense(mappedExp);
        importedCount++;
      }

      let msg = `Sukses! ${importedCount} data berhasil diimpor dan disinkronkan ke Firebase.`;
      if (plan.duplicatesCount > 0) {
        msg += ` (${plan.duplicatesCount} data duplikat diabaikan demi menjaga integritas saldo).`;
      }
      alert(msg);
      setImportPreview(null);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal saat proses impor: ${err.message || 'Error tidak diketahui'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredCategories = categories.filter(c => c.type === newCategory.type);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title" style={{ marginBottom: '0' }}>Pengaturan Sistem</h1>
        <p className="text-secondary">Kelola akun keuangan, kategori transaksi, profil, serta backup dan restore data</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Form Profil Keluarga */}
        <div className="card">
          <h3 className="mb-4">Profil Keluarga</h3>
          <form onSubmit={handleSaveProfile}>
            <div className="form-group mb-3">
              <label className="form-label">Nama Keluarga / Brankas</label>
              <input
                type="text"
                className="form-control"
                value={profile.familyName}
                onChange={(e) => setProfile({ ...profile, familyName: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="form-group">
                <label className="form-label">Nama Suami</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.husbandName}
                  onChange={(e) => setProfile({ ...profile, husbandName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nama Istri</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.wifeName}
                  onChange={(e) => setProfile({ ...profile, wifeName: e.target.value })}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Simpan Profil</button>
          </form>
        </div>

        {/* Preferensi Tampilan */}
        <div className="card">
          <h3 className="mb-4">Preferensi Tampilan</h3>
          <form onSubmit={handleSavePreferences}>
            <div className="form-group mb-4">
              <label className="form-label">Tema Aplikasi</label>
              <select
                className="form-control"
                value={preferences.theme}
                onChange={(e) => setPreferences({ ...preferences, theme: e.target.value as 'light' | 'dark' | 'system' })}
              >
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
                <option value="system">Sesuai Sistem Operasi</option>
              </select>
            </div>
            <button type="submit" className="btn btn-outline" style={{ width: '100%' }}>Simpan Preferensi</button>
          </form>
        </div>
      </div>

      {/* MANAJEMEN AKUN KEUANGAN (FINANCIAL ACCOUNTS) */}
      <div className="card mb-6">
        <div className="flex justify-between align-center mb-4">
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MdAccountBalance className="text-primary" /> Akun Keuangan & Rekening
            </h3>
            <p className="text-secondary" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
              Kelola dompet tunai, rekening bank, kartu kredit, dan e-wallet untuk melacak saldo likuid riil
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {financialAccounts.map(acc => (
            <div key={acc.id} className="card" style={{ padding: '1rem', borderLeft: `4px solid ${acc.type === 'Credit Card' ? 'var(--warning-color)' : 'var(--primary-color)'}` }}>
              <div className="flex justify-between align-center mb-1">
                <strong>{acc.name}</strong>
                <span className="badge badge-outline">{acc.type}</span>
              </div>
              <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Saldo Berjalan</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                {formatCurrency(acc.current_balance)}
              </div>
              <div className="flex justify-between align-center mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => handleEditAccountBalance(acc)}
                >
                  Sesuaikan Saldo
                </button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }}
                  onClick={() => deleteFinancialAccount(acc.id)}
                >
                  <MdDelete />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Form Tambah Akun Baru */}
        <form onSubmit={handleAddAccount} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>Tambah Akun Keuangan Baru</div>
          <div className="grid grid-cols-4 gap-3">
            <input
              type="text"
              className="form-control"
              placeholder="Nama Akun (e.g. BCA Tabungan)"
              value={newAccount.name}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              required
            />
            <select
              className="form-control"
              value={newAccount.type}
              onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as AccountType })}
            >
              <option value="Bank">Bank</option>
              <option value="Cash">Cash / Dompet</option>
              <option value="E-Wallet">E-Wallet</option>
              <option value="Credit Card">Credit Card</option>
              <option value="PayLater">PayLater</option>
            </select>
            <input
              type="number"
              className="form-control"
              placeholder="Saldo Awal (Rp)"
              value={newAccount.current_balance}
              onChange={(e) => setNewAccount({ ...newAccount, current_balance: e.target.value })}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
              <MdAdd /> Tambah Akun
            </button>
          </div>
        </form>
      </div>

      {/* KATEGORI & METODE PEMBAYARAN */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Kategori */}
        <div className="card">
          <h3 className="mb-3">Kategori Transaksi</h3>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              className={`btn ${newCategory.type === 'expense' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={() => setNewCategory({ ...newCategory, type: 'expense' })}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              className={`btn ${newCategory.type === 'income' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={() => setNewCategory({ ...newCategory, type: 'income' })}
            >
              Pemasukan
            </button>
            <button
              type="button"
              className={`btn ${newCategory.type === 'installment' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={() => setNewCategory({ ...newCategory, type: 'installment' })}
            >
              Cicilan
            </button>
          </div>

          <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
            <input
              type="text"
              className="form-control"
              placeholder={`Tambah kategori ${newCategory.type}...`}
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              required
            />
            <button type="submit" className="btn btn-primary"><MdAdd /></button>
          </form>

          <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {filteredCategories.map(cat => (
              <div key={cat.id} className="flex justify-between align-center py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ opacity: cat.isActive === 1 ? 1 : 0.4 }}>{cat.name}</span>
                <div className="flex gap-1 align-center">
                  <button
                    onClick={() => handleToggleCategory(cat)}
                    className={`btn ${cat.isActive === 1 ? 'btn-outline' : 'btn-primary'}`}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                  >
                    {cat.isActive === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button onClick={() => handleEditCategory(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><MdEdit /></button>
                  <button onClick={() => handleDeleteCategory(cat)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }}><MdDelete /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metode Pembayaran */}
        <div className="card">
          <h3 className="mb-3">Metode Pembayaran</h3>
          <form onSubmit={handleAddPaymentMethod} className="flex gap-2 mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="Tambah metode bayar..."
              value={newPaymentMethod}
              onChange={(e) => setNewPaymentMethod(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary"><MdAdd /></button>
          </form>

          <div style={{ maxHeight: '290px', overflowY: 'auto' }}>
            {paymentMethods.map(pm => (
              <div key={pm.id} className="flex justify-between align-center py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ opacity: pm.isActive === 1 ? 1 : 0.4 }}>{pm.name}</span>
                <div className="flex gap-1 align-center">
                  <button
                    onClick={() => handleTogglePaymentMethod(pm)}
                    className={`btn ${pm.isActive === 1 ? 'btn-outline' : 'btn-primary'}`}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                  >
                    {pm.isActive === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button onClick={() => handleDeletePaymentMethod(pm)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }}><MdDelete /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BACKUP & RESTORE JSON */}
      <div className="card">
        <h3 className="mb-3">Backup & Restore Cloud Data</h3>
        <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Ekspor seluruh data keuangan Anda ke dalam format file JSON aman, atau pulihkan data dari file cadangan sebelumnya.
        </p>

        <div className="flex gap-4">
          <button className="btn btn-primary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MdDownload /> Ekspor Backup JSON (v2.0)
          </button>
          <label className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <MdUpload /> Impor File Cadangan
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".json"
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* MODAL PREVIEW RESTORE DATA (PROTEKSI DUPLIKAT & PRATINJAU) */}
      {importPreview && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Pratinjau Pemulihan Data</h2>
              <button className="close-btn" onClick={() => setImportPreview(null)} disabled={isImporting}>&times;</button>
            </div>
            <div className="p-2">
              <p style={{ fontSize: '0.9rem' }}>
                File cadangan terdeteksi valid. Rincian data yang akan diunggah ke Firebase:
              </p>
              <ul style={{ background: 'var(--bg-color)', padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', margin: '1rem 0' }}>
                <li>Pemasukan: <strong>{importPreview.incomes?.length || 0}</strong> rekaman</li>
                <li>Pengeluaran: <strong>{importPreview.expenses?.length || 0}</strong> rekaman</li>
                <li>Cicilan Pinjaman: <strong>{importPreview.installments?.length || 0}</strong> rekaman</li>
                <li>Akun Keuangan: <strong>{importPreview.financialAccounts?.length || 0}</strong> akun</li>
              </ul>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                <MdWarning className="text-warning" style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                Data akan ditambahkan secara aman tanpa merusak struktur relasi cicilan.
              </div>
              <div className="flex justify-between">
                <button type="button" className="btn btn-outline" onClick={() => setImportPreview(null)} disabled={isImporting}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <MdCheckCircle /> {isImporting ? 'Mengunggah...' : 'Konfirmasi Impor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pengaturan;
