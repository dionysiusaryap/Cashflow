import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, formatPeriodToMonthYear } from '../utils/dateUtils';
import { MdAdd, MdDelete, MdEdit } from 'react-icons/md';

const Pengeluaran = () => {
  const { expenses, dailyExpenseTotal, appSettings, categories: allCategories, paymentMethods: allPaymentMethods, addExpense, deleteExpense, updateExpense } = useAppStore();
  
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
    description: ''
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
  const uniqueDescriptions = Array.from(new Set(expenses.map(e => e.description).filter(Boolean))) as string[];

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: defaultCategory,
      payment_method: defaultPaymentMethod,
      owner: 'Bersama',
      amount: '',
      description: ''
    });
  };

  const openEditModal = (expense: any) => {
    setEditingId(expense.id);
    setFormData({
      date: expense.date === 'Semua Bulan' ? 'Semua Bulan' : new Date(expense.date).toISOString().split('T')[0],
      category: expense.category,
      payment_method: expense.payment_method,
      owner: expense.owner,
      amount: expense.amount.toString(),
      description: expense.description || ''
    });
    setIsModalOpen(true);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const desc = e.target.value;
    let newCategory = formData.category;

    const lowerDesc = desc.toLowerCase();
    
    const categoryMapping = [
      { category: 'Biaya Admin & Transaksi', keywords: ['admin', 'notification', 'transaction', 'fee', 'biaya transfer', 'pajak', 'potongan'] },
      { category: 'Makanan & Minuman', keywords: ['makan', 'minum', 'snack', 'gofood', 'grabfood', 'kopi', 'nasi', 'indomaret', 'alfamart', 'belanja bulanan', 'pasar'] },
      { category: 'Transportasi', keywords: ['bensin', 'parkir', 'tol', 'gojek', 'grab', 'kereta', 'bus', 'krl', 'ojek'] },
      { category: 'Tagihan & Utilitas', keywords: ['listrik', 'token', 'air', 'pdam', 'internet', 'wifi', 'indihome', 'bpjs', 'pulsa', 'kuota'] },
      { category: 'Kesehatan', keywords: ['obat', 'dokter', 'rumah sakit', 'klinik', 'apotek', 'vitamin'] },
      { category: 'Belanja Pribadi', keywords: ['baju', 'celana', 'sepatu', 'skincare', 'makeup', 'salon', 'cukur'] }
    ];

    for (const mapping of categoryMapping) {
      if (mapping.keywords.some(keyword => lowerDesc.includes(keyword))) {
        if (activeCategoryNames.includes(mapping.category)) {
          newCategory = mapping.category;
          break;
        }
      }
    }

    setFormData({ ...formData, description: desc, category: newCategory });
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

    const payload = {
      date: formData.date === 'Semua Bulan' ? 'Semua Bulan' : new Date(formData.date).toISOString(),
      category: categoryToSave,
      payment_method: paymentMethodToSave,
      owner: formData.owner as 'Suami' | 'Istri' | 'Bersama',
      amount: Number(formData.amount),
      description: formData.description,
      timestamp: Date.now()
    };

    if (editingId) {
      await updateExpense(editingId, payload);
    } else {
      await addExpense(payload);
    }

    closeModal();
  };

  const handleDelete = async (id?: string) => {
    if (id && window.confirm('Apakah Anda yakin ingin menghapus data pengeluaran ini?')) {
      await deleteExpense(id);
    }
  };

  return (
    <div>
      <div className="flex justify-between align-center mb-6">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Pengeluaran</h1>
          <p className="text-secondary">Kelola data pengeluaran dan belanja</p>
        </div>
        <button className="btn btn-danger" onClick={() => { setEditingId(null); setFormData({
          date: new Date().toISOString().split('T')[0],
          category: defaultCategory,
          payment_method: defaultPaymentMethod,
          owner: 'Bersama',
          amount: '',
          description: ''
        }); setIsModalOpen(true); }}>
          <MdAdd /> Tambah Pengeluaran
        </button>
      </div>

      <div className="card mb-4">
        <div className="card-title">Total Pengeluaran Bulan Ini</div>
        <div className="card-value text-danger">{formatCurrency(dailyExpenseTotal)}</div>
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
          <p className="text-secondary text-center">Belum ada data pengeluaran.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kategori</th>
                  <th>Metode</th>
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
                }).map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.date === 'Semua Bulan' ? 'Semua Bulan' : new Date(expense.date).toLocaleDateString('id-ID')}</td>
                    <td style={{ fontWeight: 600 }}>{expense.category}</td>
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
                          onClick={() => handleDelete(expense.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.25rem' }}
                          title="Hapus"
                        >
                          <MdDelete />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</h2>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label flex justify-between">
                  <span>Tanggal</span>
                  <label style={{ fontWeight: 'normal', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={formData.date === 'Semua Bulan'}
                      onChange={(e) => setFormData({...formData, date: e.target.checked ? 'Semua Bulan' : new Date().toISOString().split('T')[0]})}
                    /> Berlaku Semua Bulan
                  </label>
                </label>
                {formData.date !== 'Semua Bulan' && (
                  <input 
                    type="date" 
                    className="form-control" 
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    required
                  />
                )}
                {formData.date === 'Semua Bulan' && (
                  <input type="text" className="form-control" value="Semua Bulan" disabled />
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select 
                    className="form-control"
                    value={formData.category || defaultCategory}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                  >
                    {activeCategoryNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Metode Pembayaran</label>
                  <select 
                    className="form-control"
                    value={formData.payment_method || defaultPaymentMethod}
                    onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                  >
                    {paymentMethods.map(method => <option key={method.id} value={method.name}>{method.name}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Jumlah (Rp)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Pemilik</label>
                  <select 
                    className="form-control"
                    value={formData.owner}
                    onChange={(e) => setFormData({...formData, owner: e.target.value})}
                  >
                    <option value="Suami">{appSettings?.husbandName || 'Suami'}</option>
                    <option value="Istri">{appSettings?.wifeName || 'Istri'}</option>
                    <option value="Bersama">Bersama</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Keterangan</label>
                <input 
                  type="text" 
                  className="form-control" 
                  list="expense-descriptions"
                  placeholder="Contoh: Beli Token Listrik, Belanja Mingguan..."
                  value={formData.description}
                  onChange={handleDescriptionChange}
                />
                <datalist id="expense-descriptions">
                  {uniqueDescriptions.map((desc, i) => (
                    <option key={i} value={desc} />
                  ))}
                </datalist>
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
