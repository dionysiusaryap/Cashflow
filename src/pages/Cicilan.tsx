import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { MdAdd, MdDelete, MdPayment, MdEdit } from 'react-icons/md';

const Cicilan = () => {
  const { installments, totalMonthlyInstallment, totalOutstanding, categories: allCategories, paymentMethods: allPaymentMethods, addInstallment, updateInstallment, deleteInstallment, addExpense } = useAppStore();
  
  const categories = allCategories.filter(c => c.type === 'installment' && c.isActive === 1);
  const paymentMethods = allPaymentMethods.filter(pm => pm.isActive === 1);
  
  const defaultCategory = categories.length > 0 ? categories[0].name : '';
  const defaultPaymentMethod = paymentMethods.length > 0 ? paymentMethods[0].name : '';
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('terbaru');
  const [formData, setFormData] = useState({
    name: '',
    type: defaultCategory,
    initial_amount: '',
    monthly_payment: '',
    tenor: '',
    due_date: new Date().toISOString().split('T')[0],
    payment_method: defaultPaymentMethod,
    notes: ''
  });

  const types = categories.map(c => c.name);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      name: '',
      type: defaultCategory,
      initial_amount: '',
      monthly_payment: '',
      tenor: '',
      due_date: new Date().toISOString().split('T')[0],
      payment_method: defaultPaymentMethod,
      notes: ''
    });
  };

  const openEditModal = (inst: any) => {
    setEditingId(inst.id);
    setFormData({
      name: inst.name,
      type: inst.type,
      initial_amount: inst.initial_amount.toString(),
      monthly_payment: inst.monthly_payment.toString(),
      tenor: inst.tenor.toString(),
      due_date: new Date(inst.due_date).toISOString().split('T')[0],
      payment_method: inst.payment_method,
      notes: inst.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.initial_amount || !formData.monthly_payment || !formData.tenor) return;

    const initialAmount = Number(formData.initial_amount);
    const tenor = Number(formData.tenor);
    const monthlyPayment = Number(formData.monthly_payment);
    
    const typeToSave = formData.type || defaultCategory;
    const paymentMethodToSave = formData.payment_method || defaultPaymentMethod;

    const payload = {
      name: formData.name,
      type: typeToSave,
      initial_amount: initialAmount,
      monthly_payment: monthlyPayment,
      tenor: tenor,
      due_date: new Date(formData.due_date).toISOString(),
      payment_method: paymentMethodToSave,
      notes: formData.notes,
      timestamp: Date.now()
    };

    if (editingId) {
      const existing = installments.find(i => i.id === editingId);
      if (existing) {
        const newRemaining = Math.max(0, tenor - existing.paid_installments);
        const newOutstanding = Math.max(0, initialAmount - (existing.paid_installments * monthlyPayment));
        
        await updateInstallment(editingId, {
          ...payload,
          remaining_installments: newRemaining,
          outstanding: newOutstanding,
          status: newRemaining === 0 ? 'Lunas' : existing.status
        });
      }
    } else {
      await addInstallment({
        ...payload,
        paid_installments: 0,
        remaining_installments: tenor,
        outstanding: initialAmount,
        status: 'Aman'
      });
    }

    closeModal();
  };

  const handlePay = async (inst: any) => {
    if (inst.remaining_installments <= 0) {
      alert('Cicilan ini sudah lunas!');
      return;
    }

    if (window.confirm(`Proses pembayaran cicilan ${inst.name} bulan ini sebesar ${formatCurrency(inst.monthly_payment)}?`)) {
      // 1. Update Installment
      const newPaid = inst.paid_installments + 1;
      const newRemaining = inst.remaining_installments - 1;
      const newOutstanding = Math.max(0, inst.outstanding - inst.monthly_payment);
      const newStatus = newRemaining === 0 ? 'Lunas' : 'Aman';
      
      // Calculate next due date (+1 month)
      const currentDueDate = new Date(inst.due_date);
      currentDueDate.setMonth(currentDueDate.getMonth() + 1);

      await updateInstallment(inst.id, {
        paid_installments: newPaid,
        remaining_installments: newRemaining,
        outstanding: newOutstanding,
        due_date: currentDueDate.toISOString(),
        status: newStatus
      });

      // 2. Add to expenses history
      await addExpense({
        date: new Date().toISOString(),
        category: 'Tagihan & Utilitas',
        payment_method: inst.payment_method,
        owner: 'Bersama', // Cicilan default to joint expense
        amount: inst.monthly_payment,
        description: `Pembayaran Cicilan: ${inst.name} (Bulan ke-${newPaid})`,
        installment_id: inst.id,
        timestamp: Date.now()
      });
      
      alert('Berhasil! Pembayaran cicilan telah dicatat dan otomatis masuk ke daftar pengeluaran.');
    }
  };

  const handleDelete = async (id?: string) => {
    if (id && window.confirm('Apakah Anda yakin ingin menghapus data cicilan ini? (Riwayat pembayaran tidak akan terhapus)')) {
      await deleteInstallment(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Aman': return 'var(--success-color)';
      case 'Segera jatuh tempo': return 'var(--warning-color)';
      case 'Jatuh tempo hari ini': 
      case 'Terlambat': return 'var(--danger-color)';
      case 'Lunas': return 'var(--primary-color)';
      default: return 'var(--text-secondary)';
    }
  };

  const installmentTotalsByType = installments.reduce((acc, inst) => {
    if (!acc[inst.type]) {
      acc[inst.type] = {
        monthly: 0,
        outstanding: 0,
      };
    }
    // Only sum up if there are remaining installments
    if (inst.remaining_installments > 0) {
      acc[inst.type].monthly += inst.monthly_payment;
      acc[inst.type].outstanding += inst.outstanding;
    }
    return acc;
  }, {} as Record<string, { monthly: number, outstanding: number }>);

  return (
    <div>
      <div className="flex justify-between align-center mb-6">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Cicilan</h1>
          <p className="text-secondary">Pantau hutang dan cicilan aktif Anda</p>
        </div>
        <button className="btn btn-warning" onClick={() => { setEditingId(null); setIsModalOpen(true); }} style={{ color: 'white' }}>
          <MdAdd /> Tambah Cicilan
        </button>
      </div>

      <div className="grid grid-cols-2 mb-4">
        <div className="card" style={{ borderColor: 'var(--warning-color)' }}>
          <div className="card-title">Total Tagihan Bulanan</div>
          <div className="card-value text-warning">{formatCurrency(totalMonthlyInstallment)}</div>
        </div>
        <div className="card">
          <div className="card-title">Total Sisa Hutang (Outstanding)</div>
          <div className="card-value">{formatCurrency(totalOutstanding)}</div>
        </div>
      </div>

      {Object.keys(installmentTotalsByType).length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3" style={{ fontSize: '1.1rem' }}>Ringkasan per Jenis Cicilan</h3>
          <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {Object.entries(installmentTotalsByType).map(([type, totals]) => (
              <div key={type} className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--warning-color)' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{type}</div>
                <div style={{ marginBottom: '0.25rem' }}>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Tagihan Bulanan</div>
                  <div className="text-warning" style={{ fontWeight: 700 }}>{formatCurrency(totals.monthly)}</div>
                </div>
                <div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Sisa Hutang</div>
                  <div style={{ fontWeight: 700 }}>{formatCurrency(totals.outstanding)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between align-center mb-4">
          <h3 style={{ margin: 0 }}>Daftar Cicilan Aktif</h3>
          <select className="form-control" style={{ width: 'auto' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="terbaru">Jatuh Tempo Terdekat</option>
            <option value="terlama">Jatuh Tempo Terjauh</option>
            <option value="abjad-a-z">Abjad A-Z</option>
            <option value="abjad-z-a">Abjad Z-A</option>
            <option value="nominal-terbesar">Tagihan Terbesar</option>
            <option value="nominal-terkecil">Tagihan Terkecil</option>
          </select>
        </div>
        
        {installments.length === 0 ? (
          <p className="text-secondary text-center">Tidak ada data cicilan aktif.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama Cicilan</th>
                  <th>Progress</th>
                  <th>Jatuh Tempo</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Tagihan/Bulan</th>
                  <th style={{ textAlign: 'right' }}>Sisa Pokok</th>
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {installments.sort((a, b) => {
                  if (sortBy === 'terbaru') return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                  if (sortBy === 'terlama') return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
                  if (sortBy === 'abjad-a-z') return a.name.localeCompare(b.name);
                  if (sortBy === 'abjad-z-a') return b.name.localeCompare(a.name);
                  if (sortBy === 'nominal-terbesar') return b.monthly_payment - a.monthly_payment;
                  if (sortBy === 'nominal-terkecil') return a.monthly_payment - b.monthly_payment;
                  return 0;
                }).map((inst) => (
                  <tr key={inst.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{inst.name}</div>
                      <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{inst.type}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {inst.paid_installments} / {inst.tenor} bulan
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', marginTop: '4px' }}>
                        <div style={{ 
                          width: `${(inst.paid_installments / inst.tenor) * 100}%`, 
                          height: '100%', 
                          background: 'var(--primary-color)', 
                          borderRadius: '4px' 
                        }}></div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {inst.remaining_installments > 0 ? new Date(inst.due_date).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td>
                      <span className="badge" style={{
                        backgroundColor: 'var(--bg-color)',
                        color: getStatusColor(inst.status),
                        border: `1px solid ${getStatusColor(inst.status)}`
                      }}>
                        {inst.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="text-warning">
                      {formatCurrency(inst.monthly_payment)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {formatCurrency(inst.outstanding)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handlePay(inst)}
                          className="btn btn-primary"
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                          disabled={inst.remaining_installments === 0}
                          title="Bayar Cicilan Bulan Ini"
                        >
                          <MdPayment /> Bayar
                        </button>
                        <button 
                          onClick={() => openEditModal(inst)}
                          style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1.25rem' }}
                          title="Edit"
                        >
                          <MdEdit />
                        </button>
                        <button 
                          onClick={() => handleDelete(inst.id)}
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
              <h2 className="modal-title">{editingId ? 'Edit Cicilan' : 'Tambah Cicilan / Hutang'}</h2>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Nama Cicilan</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Misal: KPR Rumah, Motor"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Jenis</label>
                  <select 
                    className="form-control"
                    value={formData.type || defaultCategory}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    {types.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Total Pinjaman Pokok (Rp)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={formData.initial_amount}
                    onChange={(e) => setFormData({...formData, initial_amount: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tenor (Bulan)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="0"
                    min="1"
                    value={formData.tenor}
                    onChange={(e) => setFormData({...formData, tenor: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Tagihan per Bulan (Rp)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={formData.monthly_payment}
                    onChange={(e) => setFormData({...formData, monthly_payment: e.target.value})}
                    required
                  />
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
              
              <div className="form-group">
                <label className="form-label">Jatuh Tempo Pembayaran Pertama</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.due_date}
                  onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea 
                  className="form-control" 
                  rows={2}
                  placeholder="Opsional"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                ></textarea>
              </div>
              
              <div className="flex justify-between mt-4">
                <button type="button" className="btn btn-outline" onClick={closeModal}>Batal</button>
                <button type="submit" className="btn btn-warning" style={{color: 'white'}}>{editingId ? 'Simpan Perubahan' : 'Simpan Cicilan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cicilan;
