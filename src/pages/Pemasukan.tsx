import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, formatPeriodToMonthYear } from '../utils/dateUtils';
import { MdAdd, MdDelete } from 'react-icons/md';

const Pemasukan = () => {
  const { incomes, totalIncome, appSettings, categories, addIncome, deleteIncome } = useAppStore();
  
  const incomeCategories = categories.filter(c => c.type === 'income' && c.isActive === 1);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    source: incomeCategories.length > 0 ? incomeCategories[0].name : '',
    owner: 'Suami',
    amount: '',
    notes: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOwner, setFilterOwner] = useState('Semua');
  const currentMonth = getFinancialPeriod(new Date());
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [sortBy, setSortBy] = useState('terbaru');

  const availableMonths = Array.from(new Set([currentMonth, ...incomes.map(i => getFinancialPeriod(i.date))])).sort().reverse();

  const filteredIncomes = incomes.filter(income => {
    const matchesSearch = income.source.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (income.notes && income.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesOwner = filterOwner === 'Semua' || income.owner === filterOwner;
    
    const incomeMonth = getFinancialPeriod(income.date);
    const matchesMonth = filterMonth === 'Semua' || incomeMonth === filterMonth;

    return matchesSearch && matchesOwner && matchesMonth;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sourceToSave = formData.source || (incomeCategories.length > 0 ? incomeCategories[0].name : '');
    
    if (!sourceToSave || !formData.amount) return;
    await addIncome({
      date: new Date(formData.date).toISOString(),
      source: sourceToSave,
      owner: formData.owner as 'Suami' | 'Istri' | 'Bersama',
      amount: Number(formData.amount),
      notes: formData.notes,
      timestamp: Date.now()
    });

    setIsModalOpen(false);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      source: incomeCategories.length > 0 ? incomeCategories[0].name : '',
      owner: 'Suami',
      amount: '',
      notes: ''
    });
  };

  const handleDelete = async (id?: string) => {
    if (id && window.confirm('Apakah Anda yakin ingin menghapus data pemasukan ini?')) {
      await deleteIncome(id);
    }
  };

  return (
    <div>
      <div className="flex justify-between align-center mb-6">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Pemasukan</h1>
          <p className="text-secondary">Kelola data pemasukan keluarga</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <MdAdd /> Tambah Pemasukan
        </button>
      </div>

      <div className="card mb-4">
        <div className="card-title">Total Pemasukan Bulan Ini</div>
        <div className="card-value text-success">{formatCurrency(totalIncome)}</div>
      </div>

      <div className="card">
        <div className="flex justify-between align-center mb-4">
          <h3 style={{ margin: 0 }}>Daftar Pemasukan</h3>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <input 
            type="text" 
            className="form-control" 
            placeholder="Cari sumber/catatan..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="form-control" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
            <option value="Semua">Semua Pemilik</option>
            <option value="Suami">{appSettings?.husbandName || 'Suami'}</option>
            <option value="Istri">{appSettings?.wifeName || 'Istri'}</option>
            <option value="Bersama">Bersama</option>
          </select>
          <select className="form-control" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="Semua">Semua Riwayat</option>
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
        
        {filteredIncomes.length === 0 ? (
          <p className="text-secondary text-center">Belum ada data pemasukan.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Sumber</th>
                  <th>Pemilik</th>
                  <th>Catatan</th>
                  <th style={{ textAlign: 'right' }}>Jumlah</th>
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncomes.sort((a, b) => {
                  if (sortBy === 'terbaru') return b.timestamp - a.timestamp;
                  if (sortBy === 'terlama') return a.timestamp - b.timestamp;
                  if (sortBy === 'abjad-a-z') return a.source.localeCompare(b.source);
                  if (sortBy === 'abjad-z-a') return b.source.localeCompare(a.source);
                  if (sortBy === 'nominal-terbesar') return b.amount - a.amount;
                  if (sortBy === 'nominal-terkecil') return a.amount - b.amount;
                  return 0;
                }).map((income) => (
                  <tr key={income.id}>
                    <td>{new Date(income.date).toLocaleDateString('id-ID')}</td>
                    <td style={{ fontWeight: 600 }}>{income.source}</td>
                    <td>
                      <span className="badge badge-outline">
                        {income.owner === 'Suami' ? appSettings?.husbandName || 'Suami' : 
                         income.owner === 'Istri' ? appSettings?.wifeName || 'Istri' : 'Bersama'}
                      </span>
                    </td>
                    <td className="text-secondary">{income.notes || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="text-success">
                      {formatCurrency(income.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => handleDelete(income.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.25rem' }}
                        title="Hapus"
                      >
                        <MdDelete />
                      </button>
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
              <h2 className="modal-title">Tambah Pemasukan</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tanggal</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Sumber Pemasukan</label>
                {incomeCategories.length > 0 ? (
                  <select 
                    className="form-control" 
                    value={formData.source || (incomeCategories.length > 0 ? incomeCategories[0].name : '')}
                    onChange={(e) => setFormData({...formData, source: e.target.value})}
                    required
                  >
                    {incomeCategories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Tidak ada kategori aktif, ketik manual"
                    value={formData.source}
                    onChange={(e) => setFormData({...formData, source: e.target.value})}
                    required
                  />
                )}
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
                <label className="form-label">Catatan (Opsional)</label>
                <textarea 
                  className="form-control" 
                  rows={3}
                  placeholder="Tambahkan catatan jika perlu"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                ></textarea>
              </div>
              
              <div className="flex justify-between mt-4">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan Pemasukan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pemasukan;
