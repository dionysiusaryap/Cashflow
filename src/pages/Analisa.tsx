import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { calculateFinancialSummary } from '../utils/financeCalculations';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, getLast6FinancialPeriods, formatPeriodToMonthYear } from '../utils/dateUtils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

const Analisa = () => {
  const { incomes, expenses, installments } = useAppStore();
  
  // Available Months for filter
  const allDates = [...incomes.map(i => i.date), ...expenses.map(e => e.date)].filter(d => d !== 'Semua Bulan');
  const availableMonths = Array.from(new Set(allDates.map(d => getFinancialPeriod(d)))).sort().reverse();
  const currentMonth = availableMonths.length > 0 ? availableMonths[0] : getFinancialPeriod(new Date());
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // 1. Calculate Summary for Selected Month
  const currentSummary = calculateFinancialSummary(incomes, expenses, installments, selectedMonth);

  // 2. Calculate Summary for Previous Month (MoM)
  const selectedDate = new Date(selectedMonth + '-01');
  selectedDate.setMonth(selectedDate.getMonth() - 1);
  const prevMonthStr = selectedDate.toISOString().slice(0, 7);
  const prevSummary = calculateFinancialSummary(incomes, expenses, installments, prevMonthStr);

  // 3. Cash Flow Trend (Last 6 Months)
  const trendData = [];
  const last6Months = getLast6FinancialPeriods(selectedMonth);
  for (const m of last6Months) {
    const s = calculateFinancialSummary(incomes, expenses, installments, m);
    trendData.push({
      name: formatPeriodToMonthYear(m).split(' ')[0], // Tampilkan nama bulannya saja
      Pemasukan: s.totalIncome,
      Pengeluaran: s.dailyExpenseTotal,
      Cicilan: s.installmentPaymentTotal,
      Sisa: s.cashFlow
    });
  }

  // 4. Spending Analysis (Donut Chart)
  const categoryMap = currentSummary.dailyExpensesArr.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.keys(categoryMap).map(key => ({
    name: key,
    value: categoryMap[key]
  })).sort((a, b) => b.value - a.value);
  const topCategories = categoryData.slice(0, 5);

  // 5. MoM Calculation helpers
  const calculateChange = (current: number, prev: number) => {
    if (prev === 0 && current === 0) return { val: 0, text: '→ 0%', type: 'neutral' };
    if (prev === 0) return { val: 100, text: '↑ 100%', type: 'increase' };
    const diff = current - prev;
    const percentage = (diff / prev) * 100;
    if (percentage > 0) return { val: percentage, text: `↑ ${percentage.toFixed(1)}%`, type: 'increase' };
    if (percentage < 0) return { val: percentage, text: `↓ ${Math.abs(percentage).toFixed(1)}%`, type: 'decrease' };
    return { val: 0, text: '→ 0%', type: 'neutral' };
  };

  const incomeChange = calculateChange(currentSummary.totalIncome, prevSummary.totalIncome);
  const expenseChange = calculateChange(currentSummary.dailyExpenseTotal, prevSummary.dailyExpenseTotal);
  const savingRateChange = currentSummary.savingRate - prevSummary.savingRate;

  // 6. Insight Generator
  const generateInsights = () => {
    const insights = [];
    if (savingRateChange > 0) {
      insights.push({ icon: '🟢', text: `Saving rate meningkat ${savingRateChange.toFixed(1)} percentage points dari bulan lalu.` });
    } else if (savingRateChange < 0) {
      insights.push({ icon: '🔴', text: `Saving rate menurun ${Math.abs(savingRateChange).toFixed(1)} percentage points dari bulan lalu.` });
    }

    if (expenseChange.type === 'increase' && expenseChange.val > 10) {
      insights.push({ icon: '🟡', text: `Pengeluaran harian meningkat cukup tajam (${expenseChange.text}) dibanding bulan lalu.` });
    }

    if (topCategories.length > 0) {
      insights.push({ icon: '🔎', text: `${topCategories[0].name} menjadi kategori pengeluaran harian terbesar bulan ini.` });
    }

    if (currentSummary.debtRatio > 35) {
      insights.push({ icon: '⚠️', text: `Beban cicilan mengambil ${currentSummary.debtRatio.toFixed(1)}% dari pemasukan. Hati-hati dalam menambah utang baru.` });
    }
    return insights;
  };

  // 7. Recommendations Generator
  const generateRecommendations = () => {
    const recs = [];
    if (currentSummary.dailyExpenseTotal > prevSummary.dailyExpenseTotal) {
      recs.push(`Pengeluaran harian naik ${formatCurrency(currentSummary.dailyExpenseTotal - prevSummary.dailyExpenseTotal)}. Evaluasi apakah ada pembelanjaan impulsif yang bisa ditekan bulan depan.`);
    }
    if (currentSummary.cashFlow > 0 && currentSummary.savingRate >= 20) {
      recs.push(`Sisa uang cukup sehat (${formatCurrency(currentSummary.cashFlow)}). Alokasikan ke tabungan darurat atau investasi sebelum terpakai.`);
    }
    if (currentSummary.debtRatio > 40) {
      recs.push(`Fokuslah melunasi cicilan dengan bunga terbesar atau saldo terkecil terlebih dahulu, hindari penggunaan paylater/kartu kredit tambahan.`);
    }
    if (recs.length === 0) {
      recs.push("Pertahankan kondisi finansial Anda yang sudah stabil saat ini.");
    }
    return recs;
  };

  const insights = generateInsights();
  const recommendations = generateRecommendations();

  return (
    <div>
      <div className="flex justify-between align-center mb-4">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Analisa Keuangan</h1>
          <p className="text-secondary">Laporan & Evaluasi Bulanan</p>
        </div>
        <select 
          className="form-control" 
          style={{ width: 'auto', minWidth: '150px' }}
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          {availableMonths.length === 0 ? (
            <option value={currentMonth}>{formatPeriodToMonthYear(currentMonth)}</option>
          ) : (
            availableMonths.map(m => <option key={m} value={m}>{formatPeriodToMonthYear(m)}</option>)
          )}
        </select>
      </div>

      {/* Bagian 1: Financial Summary */}
      <h3 className="mb-4">1. Ringkasan Keuangan ({formatPeriodToMonthYear(selectedMonth)})</h3>
      <div className="grid grid-cols-5 gap-2 mb-4">
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Pemasukan</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>{formatCurrency(currentSummary.totalIncome)}</div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Pengeluaran Harian</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>{formatCurrency(currentSummary.dailyExpenseTotal)}</div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Cicilan Dibayar</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>{formatCurrency(currentSummary.installmentPaymentTotal)}</div>
        </div>
        <div className="card" style={{ padding: '1rem', borderTop: `4px solid ${currentSummary.cashFlow >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}` }}>
          <div className="card-title">Sisa Cash Flow</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>{formatCurrency(currentSummary.cashFlow)}</div>
        </div>
        <div className="card" style={{ padding: '1rem', borderTop: `4px solid ${currentSummary.savingRate >= 20 ? 'var(--success-color)' : 'var(--warning-color)'}` }}>
          <div className="card-title">Saving Rate</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>{currentSummary.savingRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Bagian 2: Trend & Bagian 5: MoM */}
      <div className="grid grid-cols-2 mb-4">
        <div className="card">
          <h3 className="mb-4">2. Tren Arus Kas (6 Bulan)</h3>
          {trendData.length > 0 ? (
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(val) => `Rp${(val/1000000).toFixed(0)}Jt`} />
                  <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                  <Legend />
                  <Bar dataKey="Pemasukan" fill="var(--success-color)" />
                  <Bar dataKey="Pengeluaran" fill="var(--danger-color)" stackId="out" />
                  <Bar dataKey="Cicilan" fill="var(--warning-color)" stackId="out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
             <p className="text-secondary text-center">Data tidak cukup</p>
          )}
        </div>

        <div className="card">
           <h3 className="mb-4">5. Perbandingan (Bulan vs Bulan Lalu)</h3>
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <tbody>
               <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                 <td style={{ padding: '0.75rem' }}>Pemasukan</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(currentSummary.totalIncome)}</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', color: incomeChange.type === 'decrease' ? 'var(--danger-color)' : 'var(--success-color)' }}>
                   {incomeChange.text}
                 </td>
               </tr>
               <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                 <td style={{ padding: '0.75rem' }}>Pengeluaran Harian</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(currentSummary.dailyExpenseTotal)}</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', color: expenseChange.type === 'increase' ? 'var(--warning-color)' : 'var(--success-color)' }}>
                   {expenseChange.text}
                 </td>
               </tr>
               <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                 <td style={{ padding: '0.75rem' }}>Expense Ratio</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{currentSummary.expenseRatio.toFixed(1)}%</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                   Bulan lalu: {prevSummary.expenseRatio.toFixed(1)}%
                 </td>
               </tr>
               <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                 <td style={{ padding: '0.75rem' }}>Saving Rate</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{currentSummary.savingRate.toFixed(1)}%</td>
                 <td style={{ padding: '0.75rem', textAlign: 'right', color: savingRateChange >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                   {savingRateChange >= 0 ? '↑' : '↓'} {Math.abs(savingRateChange).toFixed(1)} pp
                 </td>
               </tr>
             </tbody>
           </table>
        </div>
      </div>

      {/* Bagian 3 & 4: Spending & Debt */}
      <div className="grid grid-cols-2 mb-4">
         <div className="card">
            <h3 className="mb-4">3. Analisa Pengeluaran Harian</h3>
            <div className="flex gap-4">
              <div style={{ width: '50%', height: 200 }}>
                {categoryData.length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value">
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-secondary text-center mt-4">Belum ada pengeluaran</p>}
              </div>
              <div style={{ width: '50%' }}>
                <h4 className="text-secondary mb-2" style={{ fontSize: '0.875rem' }}>Top 5 Kategori</h4>
                {topCategories.map((c, i) => (
                  <div key={i} className="flex justify-between mb-2" style={{ fontSize: '0.875rem' }}>
                    <span>{c.name}</span>
                    <strong className="text-danger">{formatCurrency(c.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
         </div>

         <div className="card">
            <h3 className="mb-4">4. Analisa Cicilan & Utang</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div style={{ padding: '0.5rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Total Cicilan Bulanan</div>
                <div style={{ fontWeight: 600 }}>{formatCurrency(currentSummary.totalMonthlyInstallment)}</div>
              </div>
              <div style={{ padding: '0.5rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Debt-to-Income Ratio</div>
                <div style={{ fontWeight: 600, color: currentSummary.debtRatio > 35 ? 'var(--danger-color)' : 'var(--success-color)' }}>
                  {currentSummary.debtRatio.toFixed(1)}%
                </div>
              </div>
            </div>
            <div style={{ padding: '0.5rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
              <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Sisa Total Outstanding (Seluruh Utang)</div>
              <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>{formatCurrency(currentSummary.totalOutstanding)}</div>
            </div>
         </div>
      </div>

      {/* Bagian 6 & 7: Insight & Recommendation */}
      <div className="grid grid-cols-2">
        <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
          <h3 className="mb-4">6. Insight Otomatis</h3>
          {insights.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {insights.map((ins, i) => (
                <li key={i} className="mb-3 flex gap-2">
                  <span>{ins.icon}</span>
                  <span style={{ fontSize: '0.9rem' }}>{ins.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary">Belum cukup data untuk menghasilkan insight bulan ini.</p>
          )}
        </div>
        
        <div className="card" style={{ background: 'var(--surface-color)' }}>
          <h3 className="mb-4">7. Yang Perlu Diperhatikan (Rekomendasi)</h3>
          <ul style={{ paddingLeft: '1.25rem' }}>
            {recommendations.map((rec, i) => (
              <li key={i} className="mb-2" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      </div>

    </div>
  );
};

export default Analisa;
