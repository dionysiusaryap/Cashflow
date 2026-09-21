import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, getLast6FinancialPeriods, formatPeriodToMonthYear } from '../utils/dateUtils';
import { calculateFinancialSummary } from '../utils/financeCalculations';
import { Link } from 'react-router-dom';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#64748b'];

const Dashboard = () => {
  const { 
    incomes,
    expenses, 
    installments,
    categories,
    appSettings
  } = useAppStore();

  const allDates = [...incomes.map(i => i.date), ...expenses.map(e => e.date)].filter(d => d !== 'Semua Bulan');
  const availableMonths = Array.from(new Set(allDates.map(d => getFinancialPeriod(d)))).sort().reverse();
  const currentMonthStr = availableMonths.length > 0 ? availableMonths[0] : getFinancialPeriod(new Date());
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  const summary = calculateFinancialSummary(incomes, expenses, installments, selectedMonth);

  const periodExpenses = expenses.filter(e => getFinancialPeriod(e.date) === selectedMonth || e.date === 'Semua Bulan');
  const validDailyExpenses = periodExpenses.filter(e => 
    !e.installment_id && 
    !(e.description?.includes('Pembayaran Cicilan:') && e.category === 'Tagihan & Utilitas') &&
    e.category !== 'Pembayaran Tagihan CC/SPaylater'
  );

  // Top spending category for daily expenses
  const expenseByCategory = validDailyExpenses.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.keys(expenseByCategory).map(key => ({
    name: key,
    value: expenseByCategory[key]
  })).sort((a, b) => b.value - a.value).slice(0, 5);

  const last6Months = getLast6FinancialPeriods(currentMonthStr);
  const trendData = last6Months.map(m => {
    const s = calculateFinancialSummary(incomes, expenses, installments, m);
    return { 
      name: formatPeriodToMonthYear(m).split(' ')[0], 
      Pengeluaran: s.dailyExpenseTotal 
    };
  });

  // --- Kebutuhan Card Ringkasan Tagihan & Kewajiban Bulan Ini ---

  const installmentCategories = new Set(categories.filter(c => c.type === 'installment').map(c => c.name));
  const allGroups = new Set<string>();
  
  // Ambil semua jenis cicilan yang aktif
  installments.filter(i => (Number(i.remaining_installments) || 0) > 0).forEach(i => {
    if (i.type) allGroups.add(i.type);
  });
  
  // Ambil semua metode pembayaran dari pengeluaran berjalan yang TERMASUK kategori cicilan/kredit
  validDailyExpenses.forEach(e => {
    const key = e.payment_method || '';
    if (installmentCategories.has(key)) {
      allGroups.add(key);
    }
  });

  const groupedBills: { name: string; instSum: number; expSum: number; total: number }[] = [];
  
  allGroups.forEach(group => {
    const instSum = installments
      .filter(i => (Number(i.remaining_installments) || 0) > 0 && i.type === group)
      .reduce((sum, i) => sum + (Number(i.monthly_payment) || 0), 0);
      
    // Hitung seluruh pengeluaran (baik bulan ini maupun rutin/Semua Bulan) yang pakai metode kredit ini
    const expSum = validDailyExpenses
      .filter(e => (e.payment_method || '') === group)
      .reduce((sum, e) => sum + e.amount, 0);
      
    const total = instSum + expSum;
    if (total > 0) {
      groupedBills.push({ name: group, instSum, expSum, total });
    }
  });

  groupedBills.sort((a, b) => b.total - a.total);

  // Pengeluaran Rutin (Semua Bulan) - HANYA yang tidak menggunakan metode kredit/cicilan
  const recurringExpenses = validDailyExpenses.filter(e => e.date === 'Semua Bulan' && !installmentCategories.has(e.payment_method || ''));
  const totalRecurring = recurringExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <div className="flex justify-between align-center mb-6 dashboard-header">
        <div>
          <h1 className="page-title" style={{marginBottom: '0'}}>Good Morning, {appSettings?.husbandName || 'Alex'}! 👋</h1>
          <p className="text-secondary">Here's what's happening with your finances today.</p>
        </div>
        <div className="flex gap-2 align-center">
           <select 
             style={{background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', color: 'inherit', cursor: 'pointer'}}
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

      <div className="grid grid-cols-4 mb-6">
        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#f3e8ff', color: '#8b5cf6', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>↓</div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Total Expenses</div>
          </div>
          <div className="card-value mb-1">{formatCurrency(summary.dailyExpenseTotal)}</div>
          <div className="text-secondary" style={{fontSize: '0.75rem'}}><span className="text-danger">↗</span> Daily expenses this month</div>
        </div>

        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#d1fae5', color: '#10b981', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>↑</div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Total Income</div>
          </div>
          <div className="card-value mb-1">{formatCurrency(summary.totalIncome)}</div>
          <div className="text-secondary" style={{fontSize: '0.75rem'}}><span className="text-success">↗</span> Income this month</div>
        </div>

        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#fef3c7', color: '#f59e0b', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>💰</div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Net Savings</div>
          </div>
          <div className="card-value mb-1">{formatCurrency(summary.cashFlow)}</div>
          <div className="text-secondary" style={{fontSize: '0.75rem'}}><span className="text-success">↗</span> Remaining cash flow</div>
        </div>

        <div className="card">
          <div className="flex align-center gap-2 mb-2">
             <div style={{background: '#e0e7ff', color: '#3b82f6', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>📈</div>
             <div className="text-secondary" style={{fontSize: '0.875rem', fontWeight: 600}}>Saving Rate</div>
          </div>
          <div className="card-value mb-1">{summary.savingRate.toFixed(1)}%</div>
          <div style={{width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 8}}>
            <div style={{width: `${Math.max(0, Math.min(summary.savingRate, 100))}%`, height: '100%', background: '#3b82f6', borderRadius: 3}}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 mb-6">
        <div className="card">
           <div className="flex justify-between align-center mb-4">
             <h3 style={{fontSize: '1rem', margin: 0}}>Expenses by Category</h3>
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
             <h3 style={{fontSize: '1rem', margin: 0}}>Expenses Trend</h3>
           </div>
           <div style={{width: '100%', height: 200}}>
             {trendData.length > 0 ? (
               <ResponsiveContainer>
                 <LineChart data={trendData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} width={40} />
                   <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                   <Line type="monotone" dataKey="Pengeluaran" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                 </LineChart>
               </ResponsiveContainer>
             ) : <p className="text-secondary text-center mt-4">Belum ada data</p>}
           </div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between align-center mb-4">
          <h3 style={{fontSize: '1rem', margin: 0}}>Ringkasan Tagihan & Kewajiban Bulan Ini</h3>
          <Link to="/cicilan" style={{fontSize: '0.85rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600}}>View All</Link>
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
