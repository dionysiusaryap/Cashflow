import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, formatPeriodToMonthYear, getCurrentTimestamp } from '../utils/dateUtils';
import type { Expense, ExpenseType } from '../types/finance';
import { MdAdd, MdDelete, MdEdit } from 'react-icons/md';

const Pengeluaran = () => {
  const { 
    expenses, 
    dailyExpenseTotal, 
    economicExpense,
    appSettings, 
    categories: allCategories, 
    paymentMethods: allPaymentMethods, 
    financialAccounts,
    addExpense, 
    deleteExpenseWithReversal, 
    updateExpense,
    updateExpenseWithAdjustment
  } = useAppStore();
  
  const categories = allCategories.filter(c => c.type === 'expense' && c.isActive === 1);
  const paymentMethods = allPaymentMethods.filter(pm => pm.isActive === 1);
  
  const defaultCategory = categories.length > 0 ? categories[0].name : '';
  const defaultPaymentMethod = paymentMethods.length > 0 ? paymentMethods[0].name : '';
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: defaultCategory,
    payment_method: defaultPaymentMethod,
    owner: 'Bersama',
    amount: '',
    description: '',
    expense_type: 'Daily' as ExpenseType,
    source_account_id: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');
  const currentMonth = getFinancialPeriod(new Date());
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [sortBy, setSortBy] = useState('terbaru');

  const availableMonths = Array.from(new Set([
    currentMonth, 
    ...expenses.filter(e => e.date !== 'Semua Bulan').map(e => getFinancialPeriod(e.date))
  ])).sort().reverse();

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'Semua' || expense.category === filterCategory;
    
    const expenseMonth = expense.date === 'Semua Bulan' ? 'Semua Bulan' : getFinancialPeriod(expense.date);
    
    let matchesMonth = false;
    if (filterMonth === 'All') {
      matchesMonth = true;
    } else if (filterMonth === 'Semua Bulan') {
      matchesMonth = expense.date === 'Semua Bulan';
    } else {
      matchesMonth = expenseMonth === filterMonth || expense.date === 'Semua Bulan';
    }

    return (matchesSearch || !searchQuery) && matchesCategory && matchesMonth;
  });

  const activeCategoryNames = categories.map(c => c.name);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: defaultCategory,
      payment_method: defaultPaymentMethod,
      owner: 'Bersama',
      amount: '',
      description: '',
      expense_type: 'Daily',
      source_account_id: ''
    });
  };

  const openEditModal = (expense: Expense) => {
    if (!expense.id) return;
    setEditingId(expense.id);
    setFormData({
      date: expense.date === 'Semua Bulan' ? 'Semua Bulan' : new Date(expense.date).toISOString().split('T')[0],
      category: expense.category,
      payment_method: expense.payment_method,
      owner: expense.owner,
      amount: expense.amount.toString(),
      description: expense.description || '',
      expense_type: expense.expense_type || 'Daily',
      source_account_id: expense.source_account_id || ''
    });
    setIsModalOpen(true);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const desc = e.target.value;
    let newCategory = formData.category;
    let newExpenseType = formData.expense_type;

    const lowerDesc = desc.toLowerCase();
    
    const categoryMapping = [
      { category: 'Biaya Admin & Transaksi', keywords: ['admin', 'notification', 'transaction', 'fee', 'biaya transfer', 'pajak', 'potongan'] },
      { category: 'Makanan & Minuman', keywords: ['makan', 'minum', 'snack', 'gofood', 'grabfood', 'kopi', 'nasi', 'indomaret', 'alfamart', 'belanja bulanan', 'pasar'] },
      { category: 'Transportasi', keywords: ['bensin', 'parkir', 'tol', 'gojek', 'grab', 'kereta', 'bus', 'krl', 'ojek'] },
      { category: 'Tagihan & Utilitas', keywords: ['listrik', 'token', 'air', 'pdam', 'internet', 'wifi', 'indihome', 'bpjs', 'pulsa', 'kuota'] },
      { category: 'Kesehatan', keywords: ['obat', 'dokter', 'rumah sakit', 'klinik', 'apotek', 'vitamin'] },
      { category: 'Pembayaran Tagihan CC/SPaylater', keywords: ['bayar tagihan cc', 'pelunasan cc', 'bayar spaylater', 'tagihan kartu kredit'] }
    ];

    for (const mapping of categoryMapping) {
      if (mapping.keywords.some(keyword => lowerDesc.includes(keyword))) {
        if (activeCategoryNames.includes(mapping.category) || mapping.category === 'Pembayaran Tagihan CC/SPaylater') {
          newCategory = mapping.category;
          if (mapping.category === 'Pembayaran Tagihan CC/SPaylater') {
            newExpenseType = 'BillSettlement';
          }
          break;
        }
      }
    }

    setFormData({ ...formData, description: desc, category: newCategory, expense_type: newExpenseType });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount) return;

    const categoryToSave = formData.category || defaultCategory;
    const paymentMethodToSave = formData.payment_method || defaultPaymentMethod;

    if (!categoryToSave || !paymentMethodToSave) {
      alert('Kategori atau Metode Pembayaran belum tersedia.');
      return;
    }

    const payload: Omit<Expense, 'id'> = {
      date: formData.date === 'Semua Bulan' ? 'Semua Bulan' : new Date(formData.date).toISOString(),
      category: categoryToSave,
      payment_method: paymentMethodToSave,
      owner: formData.owner as 'Suami' | 'Istri' | 'Bersama',
      amount: Number(formData.amount),
      description: formData.description,
      expense_type: formData.expense_type,
      timestamp: getCurrentTimestamp()
    };

    if (formData.source_account_id) {
      payload.source_account_id = formData.source_account_id;
    }

    if (editingId) {
      const oldExpense = expenses.find(e => e.id === editingId);
      if (oldExpense) {
        await updateExpenseWithAdjustment(editingId, oldExpense, payload);
      } else {
        await updateExpense(editingId, payload);
      }
    } else {
      await addExpense(payload);
    }

    closeModal();
  };

  // Safe deletion with automatic reversal of debt and accounts
  const handleDelete = async (expense: Expense) => {
    if (!expense.id) return;
    const confirmMessage = expense.installment_id
      ? 'PERINGATAN: Pengeluaran ini adalah bagian dari pembayaran cicilan. Menghapusnya akan otomatis mengembalikan saldo pokok utang dan tenor cicilan terkait. Lanjutkan?'
      : 'Apakah Anda yakin ingin menghapus data pengeluaran ini?';

    if (window.confirm(confirmMessage)) {
      await deleteExpenseWithReversal(expense);
    }
  };

  return (
    <div>
      <div className="flex justify-between align-center mb-6">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Pengeluaran</h1>
          <p className="text-secondary">Kelola data pengeluaran, belanja kartu kredit, dan pelunasan tagihan</p>
        </div>
        <button className="btn btn-danger" onClick={() => { setEditingId(null); setIsModalOpen(true); }}>
          <MdAdd /> Tambah Pengeluaran
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-title">Beban Konsumsi Ekonomi Bulan Ini</div>
          <div className="card-value text-danger">{formatCurrency(economicExpense || dailyExpenseTotal)}</div>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Konsumsi belanja riil (Kas + Kartu Kredit), di luar pelunasan utang
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Pengeluaran Kas/Debit</div>
          <div className="card-value">{formatCurrency(dailyExpenseTotal)}</div>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Belanja harian non-kredit bulan berjalan
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between align-center mb-4">
          <h3 style={{ margin: 0 }}>Daftar Pengeluaran</h3>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <input 
            type="text" 
            className="form-control" 
            placeholder="Cari keterangan..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="form-control" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="Semua">Semua Kategori</option>
            {activeCategoryNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select className="form-control" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="All">Semua Riwayat</option>
            <option value="Semua Bulan">Pengeluaran Rutin</option>
            {availableMonths.map(m => <option key={m} value={m}>{formatPeriodToMonthYear(m)}</option>)}
          </select>
          <select className="form-control" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="terbaru">Tanggal Terbaru</option>
            <option value="terlama">Tanggal Terlama</option>
            <option value="abjad-a-z">Abjad A-Z</option>
            <option value="abjad-z-a">Abjad Z-A</option>
            <option value="nominal-terbesar">Nominal Terbesar</option>
            <option value="nominal-terkecil">Nominal Terkecil</option>
          </select>
        </div>
        
        {filteredExpenses.length === 0 ? (
          <p className="text-secondary text-center py-6">Belum ada data pengeluaran.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kategori</th>
                  <th>Metode / Tipe</th>
                  <th>Keterangan</th>
                  <th>Pemilik</th>
                  <th style={{ textAlign: 'right' }}>Jumlah</th>
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.sort((a, b) => {
                  if (sortBy === 'terbaru') return b.timestamp - a.timestamp;
                  if (sortBy === 'terlama') return a.timestamp - b.timestamp;
                  if (sortBy === 'abjad-a-z') return (a.description || a.category).localeCompare(b.description || b.category);
                  if (sortBy === 'abjad-z-a') return (b.description || b.category).localeCompare(a.description || a.category);
                  if (sortBy === 'nominal-terbesar') return b.amount - a.amount;
                  if (sortBy === 'nominal-terkecil') return a.amount - b.amount;
                  return 0;
                }).map((expense) => {
                  const isInstallment = !!expense.installment_id;
                  const isSettlement = expense.expense_type === 'BillSettlement' || expense.category === 'Pembayaran Tagihan CC/SPaylater';

                  return (
                    <tr key={expense.id}>
                      <td>{expense.date === 'Semua Bulan' ? 'Semua Bulan' : new Date(expense.date).toLocaleDateString('id-ID')}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{expense.category}</span>
                        {isInstallment && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)' }}>[Cicilan Pinjaman]</div>
                        )}
                        {isSettlement && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--success-color)' }}>[Pelunasan Tagihan]</div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-outline">
                          {expense.payment_method}
                        </span>
                      </td>
                      <td className="text-secondary">{expense.description || '-'}</td>
                      <td>
                        <span className="badge badge-outline">
                          {expense.owner === 'Suami' ? appSettings?.husbandName || 'Suami' : 
                           expense.owner === 'Istri' ? appSettings?.wifeName || 'Istri' : 'Bersama'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }} className="text-danger">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex justify-center gap-2">
                          <button 
                            onClick={() => openEditModal(expense)}
                            style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1.25rem' }}
                            title="Edit"
                          >
                            <MdEdit />
                          </button>
                          <button 
                            onClick={() => handleDelete(expense)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.25rem' }}
                            title={isInstallment ? "Hapus dan Rollback Cicilan" : "Hapus"}
                          >
                            <MdDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah / Edit Pengeluaran */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</h2>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Tanggal</label>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      className="form-control" 
                      value={formData.date === 'Semua Bulan' ? '' : formData.date} 
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      disabled={formData.date === 'Semua Bulan'}
                      required={formData.date !== 'Semua Bulan'}
                    />
                    <button 
                      type="button" 
                      className={`btn ${formData.date === 'Semua Bulan' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setFormData({ ...formData, date: formData.date === 'Semua Bulan' ? new Date().toISOString().split('T')[0] : 'Semua Bulan' })}
                      style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                    >
                      Rutin
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Jenis Beban / Transaksi</label>
                  <select
                    className="form-control"
                    value={formData.expense_type}
                    onChange={(e) => setFormData({ ...formData, expense_type: e.target.value as ExpenseType })}
                  >
                    <option value="Daily">Belanja Harian (Kas/Debit/Transfer)</option>
                    <option value="CreditPurchase">Belanja Kartu Kredit / PayLater</option>
                    <option value="BillSettlement">Pelunasan Tagihan CC / PayLater</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select 
                    className="form-control" 
                    value={formData.category || defaultCategory}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                    <option value="Pembayaran Tagihan CC/SPaylater">Pembayaran Tagihan CC/SPaylater</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Metode Pembayaran</label>
                  <select 
                    className="form-control" 
                    value={formData.payment_method || defaultPaymentMethod}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    {paymentMethods.map(pm => (
                      <option key={pm.id} value={pm.name}>{pm.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rekening Sumber Kas */}
              {financialAccounts.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Rekening / Akun Sumber (Opsional)</label>
                  <select
                    className="form-control"
                    value={formData.source_account_id}
                    onChange={(e) => setFormData({ ...formData, source_account_id: e.target.value })}
                  >
                    <option value="">Pilih Akun Sumber Dana (Opsional)</option>
                    {financialAccounts.filter(a => a.isActive === 1).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.type}) - Saldo: {formatCurrency(acc.current_balance)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Nominal (Rp)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="0.00" 
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Alokasi Pemilik</label>
                  <select 
                    className="form-control" 
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value as any })}
                  >
                    <option value="Bersama">Bersama</option>
                    <option value="Suami">{appSettings?.husbandName || 'Suami'}</option>
                    <option value="Istri">{appSettings?.wifeName || 'Istri'}</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Keterangan Belanja</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Misal: Belanja Sayur di Pasar"
                  value={formData.description}
                  onChange={handleDescriptionChange}
                />
              </div>

              <div className="flex justify-between mt-4">
                <button type="button" className="btn btn-outline" onClick={closeModal}>Batal</button>
                <button type="submit" className="btn btn-danger">{editingId ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pengeluaran;
