import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, getLast6FinancialPeriods, formatPeriodToMonthYear } from '../utils/dateUtils';
import { calculateFinancialSummary, calculateCashProjection } from '../utils/financeCalculations';
import { Link } from 'react-router-dom';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { MdWarning, MdSavings, MdTrendingUp } from 'react-icons/md';

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#64748b', '#ef4444', '#14b8a6', '#84cc16', '#f97316'];

const Dashboard = () => {
  const { 
    incomes,
    expenses, 
    installments,
    financialAccounts,
    debtStatements,
    categories,
    appSettings
  } = useAppStore();

  const allDates = [...incomes.map(i => i.date), ...expenses.map(e => e.date)].filter(d => d !== 'Semua Bulan');
  const availableMonths = Array.from(new Set(allDates.map(d => getFinancialPeriod(d)))).sort().reverse();
  const currentMonthStr = availableMonths.length > 0 ? availableMonths[0] : getFinancialPeriod(new Date());
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  const summary = calculateFinancialSummary(incomes, expenses, installments, selectedMonth, {
    accounts: financialAccounts,
    statements: debtStatements
  });

  const periodExpenses = expenses.filter(e => getFinancialPeriod(e.date) === selectedMonth || e.date === 'Semua Bulan');
  const validDailyExpenses = periodExpenses.filter(e => 
    !e.installment_id && 
    !(e.description?.includes('Pembayaran Cicilan:') && e.category === 'Tagihan & Utilitas') &&
    e.category !== 'Pembayaran Tagihan CC/SPaylater'
  );

  // Mengelompokkan pengeluaran harian berdasarkan kategori
  const expenseByCategory = validDailyExpenses.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);

  // Menambahkan tagihan cicilan aktif ke dalam kategori agar total Pie Chart sinkron
  installments.filter(i => (Number(i.remaining_installments) || 0) > 0 && i.status !== 'Lunas').forEach(i => {
    const categoryName = i.type || 'Cicilan Lainnya';
    expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + (Number(i.monthly_payment) || 0);
  });

  const categoryData = Object.keys(expenseByCategory).map(key => ({
    name: key,
    value: expenseByCategory[key]
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  const last6Months = getLast6FinancialPeriods(currentMonthStr);
  const trendData = last6Months.map(m => {
    const s = calculateFinancialSummary(incomes, expenses, installments, m, {
      accounts: financialAccounts,
      statements: debtStatements
    });
    return { 
      name: formatPeriodToMonthYear(m).split(' ')[0], 
      Pengeluaran: s.economicExpense || s.totalActualExpense 
    };
  });

  // Kebutuhan Card Ringkasan Tagihan & Kewajiban Bulan Ini
  const installmentCategories = new Set(categories.filter(c => c.type === 'installment').map(c => c.name));
  const allGroups = new Set<string>();
  
  installments.filter(i => (Number(i.remaining_installments) || 0) > 0 && i.status !== 'Lunas').forEach(i => {
    if (i.type) allGroups.add(i.type);
  });
  
  validDailyExpenses.forEach(e => {
    const key = e.payment_method || '';
    if (installmentCategories.has(key)) {
      allGroups.add(key);
    }
  });

  const groupedBills: { name: string; instSum: number; expSum: number; total: number }[] = [];
  
  allGroups.forEach(group => {
    const instSum = installments
      .filter(i => (Number(i.remaining_installments) || 0) > 0 && i.type === group && i.status !== 'Lunas')
      .reduce((sum, i) => sum + (Number(i.monthly_payment) || 0), 0);
      
    const expSum = validDailyExpenses
      .filter(e => (e.payment_method || '') === group)
      .reduce((sum, e) => sum + e.amount, 0);
      
    const total = instSum + expSum;
    if (total > 0) {
      groupedBills.push({ name: group, instSum, expSum, total });
    }
  });

  groupedBills.sort((a, b) => b.total - a.total);

  const recurringExpenses = validDailyExpenses.filter(e => e.date === 'Semua Bulan' && !installmentCategories.has(e.payment_method || ''));
  const totalRecurring = recurringExpenses.reduce((sum, e) => sum + e.amount, 0);

  const liquidCash = financialAccounts
    .filter(a => a.isActive !== 0 && (
      a.type?.toLowerCase() === 'cash' || 
      a.type?.toLowerCase() === 'bank' || 
      a.type?.toLowerCase() === 'e-wallet'
    ))
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
      {/* Header Dashboard */}
      <div className="flex justify-between align-center mb-6 dashboard-header">
        <div>
          <h1 className="page-title" style={{marginBottom: '0'}}>Selamat Datang, {appSettings?.husbandName || 'Keluarga'}! 👋</h1>
          <p className="text-secondary">Ringkasan kondisi arus kas, beban konsumsi, dan kewajiban finansial Anda.</p>
        </div>
        <div className="flex gap-2 align-center">
           <select 
             style={{
               background: 'var(--surface-color)', 
               border: '1px solid var(--border-color)', 
               borderRadius: 'var(--radius-md)', 
               padding: '0.5rem 1rem', 
               fontSize: '0.875rem', 
               fontWeight: 600, 
               fontFamily: 'inherit', 
               color: 'inherit', 
               cursor: 'pointer'
             }}
             value={selectedMonth}
             onChange={(e) => setSelectedMonth(e.target.value)}
           >
             {availableMonths.length === 0 ? (
               <option value={currentMonthStr}>{formatPeriodToMonthYear(currentMonthStr)}</option>
             ) : (
               availableMonths.map(m => <option key={m} value={m}>{formatPeriodToMonthYear(m)}</option>)
             )}
           </select>
        </div>
      </div>

      {/* Banner Peringatan Defisit Jika Ada */}
      {projection.isDeficitProjected && (
        <div className="card mb-6" style={{ background: 'rgba(239, 68, 68, 0.08)', borderLeft: '5px solid var(--danger-color)', padding: '1rem 1.25rem' }}>
          <div className="flex align-center gap-3">
            <MdWarning className="text-danger" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
            <div>
              <strong className="text-danger">Peringatan Likuiditas: Potensi Defisit Kas Terdeteksi</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Kewajiban angsuran dan tagihan 30 hari ke depan melebihi saldo kas likuid tersedia sebesar <strong>{formatCurrency(projection.deficitAmount)}</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Baris 1: KPI Arus Kas & Beban Konsumsi */}
      <div className="grid grid-cols-4 mb-4">
        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#d1fae5', color: '#10b981', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
               <MdTrendingUp />
             </div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Total Pemasukan</div>
          </div>
          <div className="card-value mb-1">{formatCurrency(summary.totalIncome)}</div>
          <div className="text-secondary" style={{fontSize: '0.75rem'}} title="Seluruh pemasukan aktual periode berjalan">
            Penghasilan periode ini
          </div>
        </div>

        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#fee2e2', color: '#ef4444', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
               ↓
             </div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Beban Konsumsi</div>
          </div>
          <div className="card-value mb-1 text-danger">{formatCurrency(summary.economicExpense || summary.dailyExpenseTotal)}</div>
          <div className="text-secondary" style={{fontSize: '0.75rem'}} title="Belanja tunai + belanja kartu kredit (tanpa double-count cicilan)">
            Konsumsi belanja riil
          </div>
        </div>

        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#fef3c7', color: '#f59e0b', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
               <MdSavings />
             </div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Net Cash Flow</div>
          </div>
          <div className={`card-value mb-1 ${summary.netCashflow >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(summary.netCashflow)}
          </div>
          <div className="text-secondary" style={{fontSize: '0.75rem'}} title="Arus Kas Masuk - Arus Kas Keluar Riil">
            Perubahan kas riil
          </div>
        </div>

        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#e0e7ff', color: '#3b82f6', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
               %
             </div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Saving Rate</div>
          </div>
          <div className="card-value mb-1">{summary.savingRate.toFixed(1)}%</div>
          <div style={{width: '100%', height: 6, background: 'var(--border-color)', borderRadius: 3, marginTop: 8}}>
            <div style={{width: `${Math.max(0, Math.min(summary.savingRate, 100))}%`, height: '100%', background: summary.savingRate >= 20 ? 'var(--success-color)' : 'var(--warning-color)', borderRadius: 3}}></div>
          </div>
        </div>
      </div>

      {/* Baris 2: Saldo Kas, Sisa Utang, Tagihan Mendatang, & Proyeksi */}
      <div className="grid grid-cols-4 mb-6">
        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--success-color)' }}>
          <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Kas Likuid Tersedia (Saldo Bank & Kas)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatCurrency(summary.availableLiquidCash || liquidCash)}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Aset tunai & rekening bank aktif</div>
        </div>

        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--warning-color)' }}>
          <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Total Sisa Pokok Utang</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatCurrency(summary.totalOutstandingDebt || summary.totalOutstanding)}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Outstanding pinjaman & kredit</div>
        </div>

        <div className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--primary-color)' }}>
          <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Jatuh Tempo (30 Hari)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.25rem' }}>
            {formatCurrency(projection.upcomingObligations30Days)}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Kewajiban 30 hari ke depan</div>
        </div>

        <div className="card" style={{ padding: '1rem', borderLeft: `4px solid ${projection.isDeficitProjected ? 'var(--danger-color)' : 'var(--success-color)'}` }}>
          <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Proyeksi Kas Akhir</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: projection.isDeficitProjected ? 'var(--danger-color)' : 'var(--success-color)', marginTop: '0.25rem' }}>
            {formatCurrency(projection.projectedEndingCash)}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
            {projection.isDeficitProjected ? 'Potensi defisit' : 'Saldo diproyeksikan aman'}
          </div>
        </div>
      </div>

      {/* Visualisasi Grafik */}
      <div className="grid grid-cols-2 mb-6">
        <div className="card">
           <div className="flex justify-between align-center mb-4">
             <h3 style={{fontSize: '1rem', margin: 0}}>Komposisi Pengeluaran per Kategori</h3>
           </div>
           <div className="flex align-center gap-4 chart-layout">
             <div style={{width: '50%', height: 200}}>
                {categoryData.length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-secondary text-center mt-4">Belum ada data</p>}
             </div>
             <div style={{width: '50%'}}>
                {categoryData.map((c, i) => (
                  <div key={i} className="flex justify-between align-center mb-2" style={{fontSize: '0.85rem'}}>
                    <div className="flex align-center gap-2">
                      <div style={{width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length]}}></div>
                      {c.name}
                    </div>
                    <div style={{fontWeight: 600}}>{formatCurrency(c.value)}</div>
                  </div>
                ))}
             </div>
           </div>
        </div>

        <div className="card">
           <div className="flex justify-between align-center mb-4">
             <h3 style={{fontSize: '1rem', margin: 0}}>Tren Beban Pengeluaran (6 Bulan)</h3>
           </div>
           <div style={{width: '100%', height: 200}}>
             {trendData.length > 0 ? (
               <ResponsiveContainer>
                 <LineChart data={trendData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-secondary)', fontSize: 12}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-secondary)', fontSize: 12}} tickFormatter={(val) => `${(val/1000000).toFixed(1)}Jt`} width={45} />
                   <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                   <Line type="monotone" dataKey="Pengeluaran" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                 </LineChart>
               </ResponsiveContainer>
             ) : <p className="text-secondary text-center mt-4">Belum ada data</p>}
           </div>
        </div>
      </div>

      {/* Ringkasan Tagihan & Kewajiban Bulan Ini */}
      <div className="card">
        <div className="flex justify-between align-center mb-4">
          <h3 style={{fontSize: '1rem', margin: 0}}>Ringkasan Tagihan & Kewajiban Bulan Ini</h3>
          <Link to="/cicilan" style={{fontSize: '0.85rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600}}>Lihat Semua</Link>
        </div>
        
        <div className="grid grid-cols-1">
          {groupedBills.map((group, index) => (
            <div key={group.name} className="flex justify-between align-center" style={{padding: '1rem 0', borderBottom: index < groupedBills.length - 1 || totalRecurring > 0 ? '1px solid var(--border-color)' : 'none'}}>
              <div className="flex align-center gap-4">
                 <div style={{background: COLORS[index % COLORS.length] + '20', color: COLORS[index % COLORS.length], width: 40, height: 40, minWidth: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold'}}>
                   {group.name.charAt(0)}
                 </div>
                 <div>
                   <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{group.name}</div>
                   <div className="text-secondary" style={{fontSize: '0.75rem'}}>Tagihan & Kewajiban</div>
                 </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{fontWeight: 700, color: 'var(--danger-color)'}}>{formatCurrency(group.total)}</div>
                <div className="text-secondary" style={{fontSize: '0.75rem'}}>{group.instSum > 0 ? 'Ada cicilan aktif' : 'Pengeluaran berjalan'}</div>
              </div>
            </div>
          ))}
          
          {totalRecurring > 0 && (
            <div className="flex justify-between align-center" style={{padding: '1rem 0'}}>
              <div className="flex align-center gap-4">
                 <div style={{background: '#d1fae5', color: '#10b981', width: 40, height: 40, minWidth: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold'}}>
                   R
                 </div>
                 <div>
                   <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>Pengeluaran Rutin</div>
                   <div className="text-secondary" style={{fontSize: '0.75rem'}}>Langganan otomatis bulanan</div>
                 </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{fontWeight: 700, color: 'var(--danger-color)'}}>{formatCurrency(totalRecurring)}</div>
                <div className="text-secondary" style={{fontSize: '0.75rem'}}>Semua Bulan</div>
              </div>
            </div>
          )}

          {groupedBills.length === 0 && totalRecurring === 0 && (
            <div className="text-center text-secondary py-4">Belum ada data tagihan atau pengeluaran rutin.</div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
