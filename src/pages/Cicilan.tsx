import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { formatDateShort, getDaysRemaining, getCurrentTimestamp } from '../utils/dateUtils';
import { calculateCashProjection } from '../utils/financeCalculations';
import type { Installment, DebtStatement } from '../types/finance';
import { 
  MdAdd, 
  MdDelete, 
  MdPayment, 
  MdEdit, 
  MdHistory, 
  MdCalendarToday, 
  MdCreditCard, 
  MdCheckCircle,
  MdWarning,
  MdInfo
} from 'react-icons/md';

const Cicilan = () => {
  const { 
    installments, 
    totalMonthlyInstallment, 
    totalOutstanding, 
    categories: allCategories, 
    paymentMethods: allPaymentMethods, 
    financialAccounts,
    debtStatements,
    expenses,
    incomes,
    addInstallment, 
    updateInstallment, 
    deleteInstallment, 
    payInstallment,
    addDebtStatement,
    payDebtStatement,
    deleteDebtStatement
  } = useAppStore();

  const categories = allCategories.filter(c => c.type === 'installment' && c.isActive === 1);
  const paymentMethods = allPaymentMethods.filter(pm => pm.isActive === 1);

  const defaultCategory = categories.length > 0 ? categories[0].name : '';
  const defaultPaymentMethod = paymentMethods.length > 0 ? paymentMethods[0].name : '';

  // Active Tab: 'loans' | 'statements' | 'calendar'
  const [activeTab, setActiveTab] = useState<'loans' | 'statements' | 'calendar'>('loans');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('Semua');
  const [sortBy, setSortBy] = useState('terbaru');
  
  // Payment Modal States
  const [payingInst, setPayingInst] = useState<Installment | null>(null);
  const [paymentSourceAccount, setPaymentSourceAccount] = useState<string>('');
  const [customPayAmount, setCustomPayAmount] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);

  // History Modal States
  const [historyInst, setHistoryInst] = useState<Installment | null>(null);

  // Statement Modal States
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementFormData, setStatementFormData] = useState({
    debt_account_id: 'Kartu Kredit',
    statement_period: new Date().toISOString().slice(0, 7),
    statement_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    closing_balance: '',
    minimum_payment: ''
  });

  const [payingStatement, setPayingStatement] = useState<DebtStatement | null>(null);
  const [stmtPayAmount, setStmtPayAmount] = useState<string>('');
  const [stmtSourceAccount, setStmtSourceAccount] = useState<string>('');

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

  const uniqueTypes = Array.from(new Set(installments.map(i => i.type))).filter(Boolean);
  const types = Array.from(new Set([...categories.map(c => c.name), ...uniqueTypes]));

  const filteredInstallments = installments.filter(inst => {
    return filterType === 'Semua' || inst.type === filterType;
  });

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

  const openEditModal = (inst: Installment) => {
    if (!inst.id) return;
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
      timestamp: getCurrentTimestamp()
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

  // Open Payment Confirmation Modal
  const openPayModal = (inst: Installment) => {
    if (inst.remaining_installments <= 0) {
      alert('Cicilan ini sudah lunas!');
      return;
    }
    setPayingInst(inst);
    setCustomPayAmount(inst.monthly_payment.toString());
    const defaultAcc = financialAccounts.find(a => a.type === 'Bank' || a.type === 'Cash');
    setPaymentSourceAccount(defaultAcc ? defaultAcc.id : '');
  };

  // Execute Payment via Central Domain Service
  const handleConfirmPayment = async () => {
    if (!payingInst || isPaying) return;
    setIsPaying(true);

    try {
      const amount = Number(customPayAmount) || payingInst.monthly_payment;
      const selectedAcc = financialAccounts.find(a => a.id === paymentSourceAccount);
      const method = selectedAcc ? selectedAcc.name : payingInst.payment_method;

      await payInstallment(payingInst, method, paymentSourceAccount || undefined, amount);
      alert(`Pembayaran cicilan ${payingInst.name} berhasil dicatat.`);
      setPayingInst(null);
    } catch (err: any) {
      alert(`Gagal memproses pembayaran: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsPaying(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (id && window.confirm('Apakah Anda yakin ingin menghapus data cicilan ini? (Riwayat pembayaran yang sudah ada tidak akan terhapus)')) {
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

  // Statement Handlers
  const handleCreateStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statementFormData.closing_balance) return;

    await addDebtStatement({
      debt_account_id: statementFormData.debt_account_id,
      statement_period: statementFormData.statement_period,
      statement_date: statementFormData.statement_date,
      due_date: statementFormData.due_date,
      opening_balance: 0,
      new_charges: Number(statementFormData.closing_balance),
      installment_charges: 0,
      interest_and_fees: 0,
      payments_received: 0,
      closing_balance: Number(statementFormData.closing_balance),
      minimum_payment: Number(statementFormData.minimum_payment) || (Number(statementFormData.closing_balance) * 0.1),
      paid_amount: 0,
      status: 'Unpaid',
      timestamp: Date.now()
    });

    setIsStatementModalOpen(false);
    setStatementFormData({
      debt_account_id: 'Kartu Kredit',
      statement_period: new Date().toISOString().slice(0, 7),
      statement_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      closing_balance: '',
      minimum_payment: ''
    });
  };

  const handlePayStatementSubmit = async () => {
    if (!payingStatement) return;
    const amount = Number(stmtPayAmount);
    if (!amount || amount <= 0) {
      alert('Masukkan nominal pembayaran yang valid.');
      return;
    }

    const selectedAcc = financialAccounts.find(a => a.id === stmtSourceAccount);
    const method = selectedAcc ? selectedAcc.name : 'Transfer Bank';

    await payDebtStatement(payingStatement, amount, method, stmtSourceAccount || undefined);
    alert('Pembayaran tagihan kartu kredit berhasil dicatat.');
    setPayingStatement(null);
  };

  // Cash Projection Data
  const liquidCash = financialAccounts
    .filter(a => a.isActive === 1 && (a.type === 'Cash' || a.type === 'Bank' || a.type === 'E-Wallet'))
    .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  const confirmedIncome = incomes
    .filter(i => i.date !== 'Semua Bulan')
    .reduce((sum, i) => sum + i.amount, 0);

  const projection = calculateCashProjection(
    liquidCash,
    confirmedIncome,
    0,
    installments,
    debtStatements,
    expenses
  );

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between align-center mb-6">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Kewajiban & Pinjaman</h1>
          <p className="text-secondary">Kelola utang, cicilan, kartu kredit, dan kalender kewajiban</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'loans' && (
            <button className="btn btn-warning" onClick={() => { setEditingId(null); setIsModalOpen(true); }} style={{ color: 'white' }}>
              <MdAdd /> Tambah Cicilan
            </button>
          )}
          {activeTab === 'statements' && (
            <button className="btn btn-primary" onClick={() => setIsStatementModalOpen(true)}>
              <MdAdd /> Catat Tagihan CC
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 mb-6" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn ${activeTab === 'loans' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('loans')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <MdPayment /> Cicilan & Pinjaman ({installments.filter(i => i.remaining_installments > 0).length})
        </button>
        <button
          className={`btn ${activeTab === 'statements' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('statements')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <MdCreditCard /> Tagihan CC & PayLater ({debtStatements.filter(s => s.status !== 'Paid').length})
        </button>
        <button
          className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('calendar')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <MdCalendarToday /> Kalender Kewajiban & Proyeksi ({projection.obligations.length})
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card" style={{ borderColor: 'var(--warning-color)' }}>
          <div className="card-title">Angsuran Pinjaman Bulanan</div>
          <div className="card-value text-warning">{formatCurrency(totalMonthlyInstallment)}</div>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Total kewajiban angsuran rutin</div>
        </div>
        <div className="card">
          <div className="card-title">Total Sisa Pokok Pinjaman</div>
          <div className="card-value">{formatCurrency(totalOutstanding)}</div>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Total sisa pokok pinjaman aktif</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
          <div className="card-title">Kewajiban Tagihan Mendatang (30 Hari)</div>
          <div className="card-value text-primary">{formatCurrency(projection.upcomingObligations30Days)}</div>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Jatuh tempo dalam 30 hari ke depan</div>
        </div>
      </div>

      {/* TAB 1: PINJAMAN & ANGSURAN */}
      {activeTab === 'loans' && (
        <div className="card">
          <div className="flex justify-between align-center mb-4">
            <h3 style={{ margin: 0 }}>Daftar Pinjaman & Cicilan Aktif</h3>
            <div className="flex gap-2">
              <select className="form-control" style={{ width: 'auto' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="Semua">Semua Jenis</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="form-control" style={{ width: 'auto' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="terbaru">Jatuh Tempo Terdekat</option>
                <option value="terlama">Jatuh Tempo Terjauh</option>
                <option value="nominal-terbesar">Angsuran Terbesar</option>
                <option value="nominal-terkecil">Angsuran Terkecil</option>
              </select>
            </div>
          </div>

          {filteredInstallments.length === 0 ? (
            <p className="text-secondary text-center py-8">Belum ada data cicilan pinjaman.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama Pinjaman</th>
                    <th>Progress Angsuran</th>
                    <th>Jatuh Tempo</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Angsuran/Bulan</th>
                    <th style={{ textAlign: 'right' }}>Sisa Pokok</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstallments.map((inst) => {
                    const daysLeft = getDaysRemaining(inst.due_date);
                    return (
                      <tr key={inst.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{inst.name}</div>
                          <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{inst.type} • {inst.payment_method}</div>
                        </td>
                        <td style={{ minWidth: '140px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            {inst.paid_installments} / {inst.tenor} bulan
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '4px', marginTop: '4px' }}>
                            <div style={{
                              width: `${Math.min(100, (inst.paid_installments / (inst.tenor || 1)) * 100)}%`,
                              height: '100%',
                              background: 'var(--primary-color)',
                              borderRadius: '4px'
                            }}></div>
                          </div>
                        </td>
                        <td>
                          {inst.remaining_installments > 0 ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{formatDateShort(inst.due_date)}</div>
                              <span style={{ fontSize: '0.75rem', color: daysLeft < 0 ? 'var(--danger-color)' : daysLeft <= 7 ? 'var(--warning-color)' : 'var(--text-secondary)' }}>
                                {daysLeft < 0 ? `Terlambat ${Math.abs(daysLeft)} hari` : daysLeft === 0 ? 'Hari ini' : `${daysLeft} hari lagi`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-secondary">-</span>
                          )}
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
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => openPayModal(inst)}
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                              disabled={inst.remaining_installments === 0}
                              title="Bayar Cicilan Bulan Ini"
                            >
                              <MdPayment /> Bayar
                            </button>
                            <button
                              onClick={() => setHistoryInst(inst)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
                              title="Lihat Histori Pembayaran"
                            >
                              <MdHistory />
                            </button>
                            <button
                              onClick={() => openEditModal(inst)}
                              style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1.2rem' }}
                              title="Edit"
                            >
                              <MdEdit />
                            </button>
                            <button
                              onClick={() => handleDelete(inst.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.2rem' }}
                              title="Hapus"
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
      )}

      {/* TAB 2: TAGIHAN KARTU KREDIT & PAYLATER */}
      {activeTab === 'statements' && (
        <div className="card">
          <div className="flex justify-between align-center mb-4">
            <h3 style={{ margin: 0 }}>Daftar Tagihan Kartu Kredit & PayLater</h3>
          </div>

          {debtStatements.length === 0 ? (
            <p className="text-secondary text-center py-8">Belum ada data tagihan kartu kredit atau PayLater. Klik tombol "Catat Tagihan CC" untuk menambahkan.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Instrumen / Akun</th>
                    <th>Periode Tagihan</th>
                    <th>Jatuh Tempo</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total Tagihan</th>
                    <th style={{ textAlign: 'right' }}>Terbayar</th>
                    <th style={{ textAlign: 'right' }}>Sisa Tagihan</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {debtStatements.map(stmt => {
                    const remaining = Math.max(0, stmt.closing_balance - stmt.paid_amount);
                    return (
                      <tr key={stmt.id}>
                        <td style={{ fontWeight: 600 }}>{stmt.debt_account_id}</td>
                        <td>{stmt.statement_period}</td>
                        <td>{formatDateShort(stmt.due_date)}</td>
                        <td>
                          <span className={`badge ${stmt.status === 'Paid' ? 'badge-success' : 'badge-danger'}`}>
                            {stmt.status === 'Paid' ? 'Lunas' : stmt.status === 'Partially Paid' ? 'Dibayar Sebagian' : 'Belum Lunas'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(stmt.closing_balance)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--success-color)' }}>{formatCurrency(stmt.paid_amount)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }} className="text-danger">{formatCurrency(remaining)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="flex justify-center gap-2">
                            {stmt.status !== 'Paid' && (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setPayingStatement(stmt);
                                  setStmtPayAmount(remaining.toString());
                                  const defAcc = financialAccounts.find(a => a.type === 'Bank');
                                  setStmtSourceAccount(defAcc ? defAcc.id : '');
                                }}
                              >
                                <MdPayment /> Bayar
                              </button>
                            )}
                            <button
                              style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }}
                              onClick={() => deleteDebtStatement(stmt.id)}
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
      )}

      {/* TAB 3: KALENDER KEWAJIBAN & PROYEKSI KAS */}
      {activeTab === 'calendar' && (
        <div>
          {/* Card Status Proyeksi */}
          <div className={`card mb-6 ${projection.isDeficitProjected ? 'card-danger' : ''}`} style={{
            borderLeft: `5px solid ${projection.isDeficitProjected ? 'var(--danger-color)' : 'var(--success-color)'}`
          }}>
            <div className="flex justify-between align-center">
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {projection.isDeficitProjected ? <MdWarning className="text-danger" /> : <MdCheckCircle className="text-success" />}
                  {projection.isDeficitProjected ? 'Peringatan: Potensi Defisit Kas Terdeteksi!' : 'Proyeksi Kas Sehat dan Terkendali'}
                </h3>
                <p className="text-secondary" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                  {projection.isDeficitProjected 
                    ? `Perkiraan kebutuhan kas melebihi saldo likuid tersedia sebesar ${formatCurrency(projection.deficitAmount)}. Pertimbangkan alokasi dana tambahan.`
                    : 'Saldo kas likuid mencukupi untuk memenuhi seluruh kewajiban yang akan jatuh tempo.'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Proyeksi Kas Akhir Periode</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: projection.isDeficitProjected ? 'var(--danger-color)' : 'var(--success-color)' }}>
                  {formatCurrency(projection.projectedEndingCash)}
                </div>
              </div>
            </div>
          </div>

          {/* Agenda Kewajiban Mendatang */}
          <div className="card">
            <h3 className="mb-4">Agenda Kewajiban Berdasarkan Waktu Jatuh Tempo</h3>
            {projection.obligations.length === 0 ? (
              <p className="text-secondary text-center py-6">Tidak ada kewajiban tertunda saat ini.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kewajiban</th>
                      <th>Jenis</th>
                      <th>Jatuh Tempo</th>
                      <th>Sisa Waktu</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.obligations.map(item => {
                      const days = getDaysRemaining(item.due_date);
                      return (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600 }}>{item.title}</td>
                          <td>
                            <span className="badge badge-outline">{item.type}</span>
                          </td>
                          <td>{formatDateShort(item.due_date)}</td>
                          <td>
                            <span style={{
                              fontWeight: 600,
                              color: days < 0 ? 'var(--danger-color)' : days <= 7 ? 'var(--warning-color)' : 'var(--text-secondary)'
                            }}>
                              {days < 0 ? `Terlambat ${Math.abs(days)} hari` : days === 0 ? 'Hari ini' : `${days} hari lagi`}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${days < 0 ? 'badge-danger' : days <= 7 ? 'badge-warning' : 'badge-outline'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {formatCurrency(item.remaining_amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI PEMBAYARAN CICILAN (ANTI-DOUBLE CLICK & ATOMIC) */}
      {payingInst && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Konfirmasi Pembayaran Cicilan</h2>
              <button className="close-btn" onClick={() => setPayingInst(null)} disabled={isPaying}>&times;</button>
            </div>

            <div className="p-2">
              <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pinjaman</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{payingInst.name} ({payingInst.type})</div>
                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pembayaran Angsuran:</span>
                  <strong>Bulan ke-{(payingInst.paid_installments || 0) + 1} dari {payingInst.tenor}</strong>
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Nominal Pembayaran (Rp)</label>
                <input
                  type="number"
                  className="form-control"
                  value={customPayAmount}
                  onChange={(e) => setCustomPayAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Potong dari Rekening / Sumber Dana</label>
                <select
                  className="form-control"
                  value={paymentSourceAccount}
                  onChange={(e) => setPaymentSourceAccount(e.target.value)}
                >
                  <option value="">Pilih Sumber Dana (Opsional)</option>
                  {financialAccounts.filter(a => a.isActive === 1 && (a.type === 'Bank' || a.type === 'Cash' || a.type === 'E-Wallet')).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (Saldo: {formatCurrency(acc.current_balance)})
                    </option>
                  ))}
                </select>
                <small className="text-secondary" style={{ display: 'block', marginTop: '0.25rem' }}>
                  Jika dipilih, saldo rekening akan dipotong secara otomatis.
                </small>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.08)', padding: '0.75rem', borderRadius: '0.375rem' }}>
                <MdInfo style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                Pembayaran ini akan langsung dicatat ke pengeluaran dan saldo sisa pokok pinjaman akan berkurang sebesar {formatCurrency(Number(customPayAmount) || 0)}.
              </div>

              <div className="flex justify-between">
                <button type="button" className="btn btn-outline" onClick={() => setPayingInst(null)} disabled={isPaying}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmPayment}
                  disabled={isPaying}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {isPaying ? 'Memproses...' : 'Konfirmasi Bayar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTORI PEMBAYARAN PINJAMAN */}
      {historyInst && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Histori Pembayaran: {historyInst.name}</h2>
              <button className="close-btn" onClick={() => setHistoryInst(null)}>&times;</button>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {(() => {
                const historyPayments = expenses.filter(e => e.installment_id === historyInst.id);
                if (historyPayments.length === 0) {
                  return <p className="text-secondary text-center py-6">Belum ada riwayat pembayaran yang tercatat untuk cicilan ini.</p>;
                }
                return (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th>Keterangan</th>
                        <th>Metode</th>
                        <th style={{ textAlign: 'right' }}>Nominal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPayments.map(hp => (
                        <tr key={hp.id}>
                          <td>{formatDateShort(hp.date)}</td>
                          <td>{hp.description || 'Pembayaran Cicilan'}</td>
                          <td><span className="badge badge-outline">{hp.payment_method}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(hp.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATAT TAGIHAN CC */}
      {isStatementModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Catat Tagihan Kartu Kredit / PayLater</h2>
              <button className="close-btn" onClick={() => setIsStatementModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreateStatement}>
              <div className="form-group mb-3">
                <label className="form-label">Nama Kartu / Layanan</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Misal: BCA Visa Platinum, SPaylater"
                  value={statementFormData.debt_account_id}
                  onChange={(e) => setStatementFormData({ ...statementFormData, debt_account_id: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="form-group">
                  <label className="form-label">Periode Tagihan</label>
                  <input
                    type="month"
                    className="form-control"
                    value={statementFormData.statement_period}
                    onChange={(e) => setStatementFormData({ ...statementFormData, statement_period: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tanggal Jatuh Tempo</label>
                  <input
                    type="date"
                    className="form-control"
                    value={statementFormData.due_date}
                    onChange={(e) => setStatementFormData({ ...statementFormData, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-group mb-4">
                <label className="form-label">Total Tagihan (Closing Balance Rp)</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="0.00"
                  value={statementFormData.closing_balance}
                  onChange={(e) => setStatementFormData({ ...statementFormData, closing_balance: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-between">
                <button type="button" className="btn btn-outline" onClick={() => setIsStatementModalOpen(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan Tagihan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BAYAR TAGIHAN CC (SETTLEMENT) */}
      {payingStatement && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Pelunasan Tagihan Kartu Kredit</h2>
              <button className="close-btn" onClick={() => setPayingStatement(null)}>&times;</button>
            </div>
            <div className="p-2">
              <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Kartu: {payingStatement.debt_account_id}</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Periode {payingStatement.statement_period}</div>
                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Sisa Tagihan:</span>
                  <strong className="text-danger">{formatCurrency(payingStatement.closing_balance - payingStatement.paid_amount)}</strong>
                </div>
              </div>
              <div className="form-group mb-3">
                <label className="form-label">Nominal Pembayaran (Rp)</label>
                <input
                  type="number"
                  className="form-control"
                  value={stmtPayAmount}
                  onChange={(e) => setStmtPayAmount(e.target.value)}
                  required
                />
              </div>
              <div className="form-group mb-4">
                <label className="form-label">Potong dari Rekening</label>
                <select
                  className="form-control"
                  value={stmtSourceAccount}
                  onChange={(e) => setStmtSourceAccount(e.target.value)}
                >
                  <option value="">Pilih Rekening Sumber</option>
                  {financialAccounts.filter(a => a.isActive === 1 && (a.type === 'Bank' || a.type === 'Cash')).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} (Saldo: {formatCurrency(acc.current_balance)})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between">
                <button type="button" className="btn btn-outline" onClick={() => setPayingStatement(null)}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={handlePayStatementSubmit}>Konfirmasi Pelunasan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT CICILAN */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Edit Cicilan' : 'Tambah Cicilan / Pinjaman'}</h2>
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
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Jenis</label>
                  <select
                    className="form-control"
                    value={formData.type || defaultCategory}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, initial_amount: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, tenor: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, monthly_payment: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Metode Pembayaran</label>
                  <select
                    className="form-control"
                    value={formData.payment_method || defaultPaymentMethod}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    {paymentMethods.map(method => <option key={method.id} value={method.name}>{method.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Jatuh Tempo Pembayaran</label>
                <input
                  type="date"
                  className="form-control"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                ></textarea>
              </div>

              <div className="flex justify-between mt-4">
                <button type="button" className="btn btn-outline" onClick={closeModal}>Batal</button>
                <button type="submit" className="btn btn-warning" style={{ color: 'white' }}>{editingId ? 'Simpan Perubahan' : 'Simpan Cicilan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cicilan;
