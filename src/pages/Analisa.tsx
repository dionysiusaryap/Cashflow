import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { calculateFinancialSummary } from '../utils/financeCalculations';
import { formatCurrency } from '../utils/format';
import { getFinancialPeriod, getLast6FinancialPeriods, formatPeriodToMonthYear } from '../utils/dateUtils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { MdSecurity, MdLightbulbOutline } from 'react-icons/md';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

const Analisa = () => {
  const { incomes, expenses, installments, financialAccounts, debtStatements } = useAppStore();
  
  const allDates = [...incomes.map(i => i.date), ...expenses.map(e => e.date)].filter(d => d !== 'Semua Bulan');
  const availableMonths = Array.from(new Set(allDates.map(d => getFinancialPeriod(d)))).sort().reverse();
  const currentMonth = availableMonths.length > 0 ? availableMonths[0] : getFinancialPeriod(new Date());
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // 1. Calculate Summary for Selected Month
  const currentSummary = calculateFinancialSummary(incomes, expenses, installments, selectedMonth, {
    accounts: financialAccounts,
    statements: debtStatements
  });

  // 2. Calculate Summary for Previous Month (MoM)
  const [yearStr, monthStr] = (selectedMonth || '2026-10').split('-');
  let prevYear = parseInt(yearStr, 10);
  let prevMonth = parseInt(monthStr, 10) - 1;
  if (prevMonth <= 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevMonthStr = `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
  const prevSummary = calculateFinancialSummary(incomes, expenses, installments, prevMonthStr, {
    accounts: financialAccounts,
    statements: debtStatements
  });

  // 3. Trend Data (Last 6 Months)
  const trendData = [];
  const last6Months = getLast6FinancialPeriods(selectedMonth);
  for (const m of last6Months) {
    const s = calculateFinancialSummary(incomes, expenses, installments, m, {
      accounts: financialAccounts,
      statements: debtStatements
    });
    trendData.push({
      name: formatPeriodToMonthYear(m).split(' ')[0],
      Pemasukan: s.totalIncome,
      BebanKonsumsi: s.economicExpense || s.dailyExpenseTotal,
      KasKeluar: s.cashOutflow,
      ArusKasBersih: s.netCashflow
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
  const expenseChange = calculateChange(currentSummary.economicExpense, prevSummary.economicExpense);
  const savingRateChange = currentSummary.savingRate - prevSummary.savingRate;

  // 6. Insight Generator Berdasarkan Data Valid
  const generateInsights = () => {
    const insights = [];
    if (savingRateChange > 0) {
      insights.push({ icon: '🟢', text: `Saving rate meningkat ${savingRateChange.toFixed(1)}% dibandingkan periode sebelumnya.` });
    } else if (savingRateChange < 0) {
      insights.push({ icon: '🔴', text: `Saving rate menurun ${Math.abs(savingRateChange).toFixed(1)}% dibandingkan periode sebelumnya.` });
    }

    if (expenseChange.type === 'increase' && expenseChange.val > 10) {
      insights.push({ icon: '🟡', text: `Beban konsumsi belanja meningkat ${expenseChange.text} dibanding bulan lalu.` });
    }

    if (topCategories.length > 0) {
      insights.push({ icon: '🔎', text: `Kategori "${topCategories[0].name}" merupakan pos pengeluaran terbesar (${formatCurrency(topCategories[0].value)}).` });
    }

    if (currentSummary.installmentDebtRatio > 35) {
      insights.push({ icon: '⚠️', text: `Rasio cicilan (${currentSummary.installmentDebtRatio.toFixed(1)}%) melebihi ambang batas ideal (30% dari pemasukan).` });
    } else if (currentSummary.totalIncome > 0 && currentSummary.installmentDebtRatio <= 30) {
      insights.push({ icon: '✅', text: `Rasio cicilan (${currentSummary.installmentDebtRatio.toFixed(1)}%) berada dalam batas aman finansial (< 30%).` });
    }

    return insights;
  };

  // 7. Recommendations Generator
  const generateRecommendations = () => {
    const recs = [];
    if (currentSummary.netCashflow < 0) {
      recs.push(`Arus kas bersih periode ini mengalami defisit sebesar ${formatCurrency(Math.abs(currentSummary.netCashflow))}. Evaluasi pengeluaran non-primer atau gunakan dana cadangan.`);
    } else if (currentSummary.netCashflow > 0 && currentSummary.savingRate >= 20) {
      recs.push(`Sisa arus kas sangat sehat (${formatCurrency(currentSummary.netCashflow)}). Prioritaskan untuk menambah dana darurat atau investasi berkala.`);
    }

    if (currentSummary.installmentDebtRatio > 35) {
      recs.push(`Hindari mengambil fasilitas cicilan atau pinjaman baru sebelum angsuran yang ada terselesaikan.`);
    }

    if (recs.length === 0) {
      recs.push("Kondisi finansial Anda stabil dan terkendali. Pertahankan pola pencatatan disiplin ini.");
    }
    return recs;
  };

  const insights = generateInsights();
  const recommendations = generateRecommendations();

  return (
    <div>
      <div className="flex justify-between align-center mb-6">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0' }}>Analisa Finansial</h1>
          <p className="text-secondary">Evaluasi kinerja anggaran, komparasi Month-over-Month, dan rasio utang</p>
        </div>
        <select 
          className="form-control" 
          style={{ width: 'auto', minWidth: '160px' }}
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

      {/* Bagian 1: Ringkasan Metrik Finansial */}
      <h3 className="mb-3">1. Ringkasan Kinerja ({formatPeriodToMonthYear(selectedMonth)})</h3>
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Pemasukan</div>
          <div className="card-value" style={{ fontSize: '1.2rem' }}>{formatCurrency(currentSummary.totalIncome)}</div>
          <span style={{ fontSize: '0.75rem', color: incomeChange.type === 'increase' ? 'var(--success-color)' : 'var(--danger-color)' }}>
            MoM: {incomeChange.text}
          </span>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Beban Konsumsi</div>
          <div className="card-value text-danger" style={{ fontSize: '1.2rem' }}>{formatCurrency(currentSummary.economicExpense)}</div>
          <span style={{ fontSize: '0.75rem', color: expenseChange.type === 'increase' ? 'var(--danger-color)' : 'var(--success-color)' }}>
            MoM: {expenseChange.text}
          </span>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Angsuran Utang</div>
          <div className="card-value text-warning" style={{ fontSize: '1.2rem' }}>{formatCurrency(currentSummary.loanInstallmentObligation)}</div>
          <span style={{ fontSize: '0.75rem' }} className="text-secondary">
            Rasio: {currentSummary.installmentDebtRatio.toFixed(1)}%
          </span>
        </div>
        <div className="card" style={{ padding: '1rem', borderTop: `4px solid ${currentSummary.netCashflow >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}` }}>
          <div className="card-title">Net Cash Flow</div>
          <div className="card-value" style={{ fontSize: '1.2rem', color: currentSummary.netCashflow >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
            {formatCurrency(currentSummary.netCashflow)}
          </div>
          <span style={{ fontSize: '0.75rem' }} className="text-secondary">Arus kas riil</span>
        </div>
        <div className="card" style={{ padding: '1rem', borderTop: `4px solid ${currentSummary.savingRate >= 20 ? 'var(--success-color)' : 'var(--warning-color)'}` }}>
          <div className="card-title">Saving Rate</div>
          <div className="card-value" style={{ fontSize: '1.2rem' }}>{currentSummary.savingRate.toFixed(1)}%</div>
          <span style={{ fontSize: '0.75rem' }} className="text-secondary">Surplus / Income</span>
        </div>
      </div>

      {/* Bagian 2: Grafik Tren Arus Kas */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="mb-4" style={{ fontSize: '1rem' }}>2. Tren Pemasukan vs Pengeluaran (6 Bulan)</h3>
          {trendData.length > 0 ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis tickFormatter={(val) => `Rp${(val/1000000).toFixed(0)}Jt`} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} width={50} />
                  <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                  <Legend />
                  <Bar dataKey="Pemasukan" fill="var(--success-color)" />
                  <Bar dataKey="BebanKonsumsi" fill="var(--danger-color)" name="Beban Konsumsi" />
                  <Bar dataKey="KasKeluar" fill="var(--warning-color)" name="Kas Keluar Riil" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-secondary text-center py-6">Belum ada data tren.</p>}
        </div>

        <div className="card">
          <h3 className="mb-4" style={{ fontSize: '1rem' }}>3. Top 5 Kategori Belanja Terbesar</h3>
          {categoryData.length > 0 ? (
            <div className="flex align-center gap-4">
              <div style={{ width: '50%', height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={topCategories} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" stroke="none">
                      {topCategories.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ width: '50%' }}>
                {topCategories.map((c, i) => (
                  <div key={i} className="flex justify-between align-center mb-2" style={{ fontSize: '0.85rem' }}>
                    <div className="flex align-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }}></div>
                      <span>{c.name}</span>
                    </div>
                    <strong>{formatCurrency(c.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-secondary text-center py-6">Belum ada data belanja.</p>}
        </div>
      </div>

      {/* Bagian 3: Diagnosa & Rekomendasi Kesehatan Finansial */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="mb-3" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MdSecurity className="text-primary" /> Diagnosa Finansial
          </h3>
          <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
            {insights.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '0.6rem', fontSize: '0.9rem' }}>
                <span style={{ marginRight: '0.4rem' }}>{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3 className="mb-3" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MdLightbulbOutline className="text-warning" /> Rekomendasi Aksi
          </h3>
          <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
            {recommendations.map((rec, idx) => (
              <li key={idx} style={{ marginBottom: '0.6rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
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
