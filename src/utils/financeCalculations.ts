import type {
  Income,
  Expense,
  Installment,
  FinancialAccount,
  DebtStatement,
  FinancialSummaryResult,
  CashProjectionResult,
  ObligationItem
} from '../types/finance';
import { getFinancialPeriod, getDaysRemaining } from './dateUtils';

/**
 * Mendeteksi apakah suatu pengeluaran merupakan pembayaran cicilan pinjaman.
 */
export const isInstallmentPayment = (e: Expense): boolean => {
  if (e.installment_id) return true;
  if (e.expense_type === 'DebtPayment') return true;
  if (e.description?.includes('Pembayaran Cicilan:') && e.category === 'Tagihan & Utilitas') return true;
  return false;
};

/**
 * Mendeteksi apakah suatu pengeluaran merupakan pelunasan tagihan kartu kredit / paylater.
 */
export const isCreditCardSettlement = (e: Expense): boolean => {
  if (e.expense_type === 'BillSettlement') return true;
  if (e.debt_statement_id) return true;
  const lowerCat = (e.category || '').toLowerCase();
  if (lowerCat.includes('pembayaran tagihan cc') || lowerCat.includes('pelunasan kartu kredit') || lowerCat.includes('bayar tagihan cc')) {
    return true;
  }
  return false;
};

/**
 * Mendeteksi apakah pengeluaran dibayar menggunakan instrumen kredit non-kas (Credit Card / PayLater).
 */
export const isCreditPurchase = (e: Expense, accounts?: FinancialAccount[]): boolean => {
  if (e.expense_type === 'CreditPurchase') return true;
  
  if (accounts && e.source_account_id) {
    const acc = accounts.find(a => a.id === e.source_account_id);
    if (acc && (acc.type === 'Credit Card' || acc.type === 'PayLater')) {
      return true;
    }
  }

  const pm = (e.payment_method || '').toLowerCase();
  if (pm.includes('kartu kredit') || pm.includes('credit card') || pm.includes('spaylater') || pm.includes('paylater')) {
    // Pastikan bukan settlement
    return !isCreditCardSettlement(e) && !isInstallmentPayment(e);
  }

  return false;
};

/**
 * Modul Perhitungan Finansial Terpusat (Single Source of Financial Truth).
 * Memisahkan secara tegas antara Beban Ekonomi, Arus Kas, dan Kewajiban Utang.
 */
export const calculateFinancialSummary = (
  incomes: Income[],
  expenses: Expense[],
  installments: Installment[],
  periodStr?: string,
  options?: {
    accounts?: FinancialAccount[];
    statements?: DebtStatement[];
  }
): FinancialSummaryResult => {
  // 1. Filter data berdasarkan periode finansial yang dipilih
  const periodIncomes = periodStr
    ? incomes.filter(i => getFinancialPeriod(i.date) === periodStr || i.date === 'Semua Bulan')
    : incomes;

  const periodExpenses = periodStr
    ? expenses.filter(e => getFinancialPeriod(e.date) === periodStr || e.date === 'Semua Bulan')
    : expenses;

  // 2. Total Penghasilan Aktual
  const totalIncome = periodIncomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // 3. Klasifikasi Pengeluaran
  const dailyExpensesArr: Expense[] = [];
  const installmentPaymentsArr: Expense[] = [];
  const ccSettlementPaymentsArr: Expense[] = [];
  const creditPurchasesArr: Expense[] = [];
  const cashDailyExpensesArr: Expense[] = [];

  for (const e of periodExpenses) {
    if (isInstallmentPayment(e)) {
      installmentPaymentsArr.push(e);
    } else if (isCreditCardSettlement(e)) {
      ccSettlementPaymentsArr.push(e);
    } else {
      dailyExpensesArr.push(e);
      if (isCreditPurchase(e, options?.accounts)) {
        creditPurchasesArr.push(e);
      } else {
        cashDailyExpensesArr.push(e);
      }
    }
  }

  const dailyExpenseTotal = dailyExpensesArr.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const installmentPaymentTotal = installmentPaymentsArr.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const ccSettlementTotal = ccSettlementPaymentsArr.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const cashDailyExpenseTotal = cashDailyExpensesArr.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // 4. Beban Ekonomi Aktual (Economic Expense)
  // Mencakup seluruh konsumsi nilai ekonomi (belanja tunai + belanja kartu kredit/paylater).
  // Pembayaran pokok cicilan dan pelunasan CC TIDAK dihitung ulang sebagai beban belanja baru.
  const economicExpense = dailyExpenseTotal;

  // 5. Arus Kas Keluar Aktual (Cash Outflow)
  // Pergerakan uang kas/bank riil: belanja tunai/debit + pembayaran cicilan tunai + pelunasan tagihan CC tunai.
  const cashInflow = totalIncome;
  const cashOutflow = cashDailyExpenseTotal + installmentPaymentTotal + ccSettlementTotal;

  // 6. Net Cashflow (Perubahan Kas Murni)
  const netCashflow = cashInflow - cashOutflow;

  // 7. Surplus Ekonomi & Saving Rate
  // Economic Surplus = Penghasilan - Seluruh Konsumsi Beban Ekonomi
  const economicSurplus = totalIncome - economicExpense;
  const savingRate = totalIncome > 0 ? (economicSurplus / totalIncome) * 100 : 0;

  // 8. Cicilan Aktif & Kewajiban Kontraktual
  const activeInstallments = installments.filter(i => (Number(i.remaining_installments) || 0) > 0 && i.status !== 'Lunas');
  const loanInstallmentObligation = activeInstallments.reduce((acc, curr) => acc + (Number(curr.monthly_payment) || 0), 0);

  // Hitung tagihan kartu kredit periode berjalan jika data statement tersedia
  let activeStatementsObligation = 0;
  if (options?.statements && options.statements.length > 0) {
    const periodStatements = periodStr
      ? options.statements.filter(s => s.statement_period === periodStr || !s.statement_period)
      : options.statements;

    activeStatementsObligation = periodStatements
      .filter(s => s.status !== 'Paid')
      .reduce((sum, s) => sum + Math.max(0, (s.closing_balance || 0) - (s.paid_amount || 0)), 0);
  }

  const totalDebtObligation = loanInstallmentObligation + activeStatementsObligation;

  // 9. Debt Service Ratio
  const installmentDebtRatio = totalIncome > 0 ? (loanInstallmentObligation / totalIncome) * 100 : 0;
  const totalDebtServiceRatio = totalIncome > 0 ? (totalDebtObligation / totalIncome) * 100 : 0;

  // 10. Total Outstanding Debt (Sisa Pokok Utang Konsolidasi)
  const totalOutstandingInstallment = activeInstallments.reduce((acc, curr) => acc + (Number(curr.outstanding) || 0), 0);
  const totalOutstandingDebt = totalOutstandingInstallment + activeStatementsObligation;

  // 11. Saldo Kas Likuid Tersedia (dari Akun Keuangan jika ada)
  let availableLiquidCash = 0;
  if (options?.accounts) {
    availableLiquidCash = options.accounts
      .filter(a => a.isActive === 1 && (a.type === 'Cash' || a.type === 'Bank' || a.type === 'E-Wallet'))
      .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
  }

  // 12. Backward-Compatible Total Actual Expense
  // Di UI legacy, totalActualExpense merefleksikan total pengeluaran belanja harian + kewajiban cicilan bulanan
  const totalActualExpense = dailyExpenseTotal + loanInstallmentObligation;
  const legacyCashFlow = totalIncome - totalActualExpense;

  return {
    totalIncome,
    economicExpense,
    cashInflow,
    cashOutflow,
    netCashflow,
    economicSurplus,
    savingRate: isFinite(savingRate) ? savingRate : 0,
    loanInstallmentObligation,
    totalDebtObligation,
    installmentDebtRatio: isFinite(installmentDebtRatio) ? installmentDebtRatio : 0,
    totalDebtServiceRatio: isFinite(totalDebtServiceRatio) ? totalDebtServiceRatio : 0,
    debtServiceRatio: isFinite(totalDebtServiceRatio) && totalDebtServiceRatio > 0
      ? totalDebtServiceRatio
      : (isFinite(installmentDebtRatio) ? installmentDebtRatio : 0),
    totalOutstandingDebt,
    availableLiquidCash,

    dailyExpensesArr,
    installmentPaymentsArr,
    ccSettlementPaymentsArr,

    // Backward compatibility aliases
    dailyExpenseTotal,
    installmentPaymentTotal,
    totalActualExpense,
    cashFlow: legacyCashFlow,
    totalMonthlyInstallment: loanInstallmentObligation,
    totalOutstanding: totalOutstandingInstallment,
    debtRatio: installmentDebtRatio
  };
};

/**
 * Kalkulasi Proyeksi Arus Kas dan Kalender Kewajiban ke Depan.
 */
export const calculateCashProjection = (
  initialCash: number,
  confirmedIncome: number,
  estimatedIncome: number,
  installments: Installment[],
  statements: DebtStatement[] = [],
  routineExpenses: Expense[] = [],
  baseDate: Date = new Date()
): CashProjectionResult => {
  const obligations: ObligationItem[] = [];

  // 1. Identifikasi statement kartu kredit aktif untuk mencegah double-counting angsuran CC
  const statementCoveredKeywords = new Set<string>();
  let activeStatementInstallmentSum = 0;

  for (const stmt of statements) {
    if (stmt.status !== 'Paid') {
      statementCoveredKeywords.add(stmt.debt_account_id?.toLowerCase() || '');
      if (stmt.installment_charges && stmt.installment_charges > 0) {
        activeStatementInstallmentSum += stmt.installment_charges;
      }
    }
  }

  // 2. Masukkan cicilan aktif ke dalam daftar kewajiban
  for (const inst of installments) {
    if ((Number(inst.remaining_installments) || 0) > 0 && inst.status !== 'Lunas') {
      const remainingDays = getDaysRemaining(inst.due_date, baseDate);
      let status: 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue' = 'Pending';
      if (remainingDays < 0) status = 'Overdue';

      // Cek apakah cicilan ini merupakan porsi cicilan kartu kredit yang sudah ditagihkan dalam statement aktif
      const isCardInstallment = inst.type === 'Kartu Kredit' || inst.type === 'PayLater' || (inst.payment_method || '').toLowerCase().includes('kartu kredit');
      const isCoveredByStatement = isCardInstallment && (
        statementCoveredKeywords.has(inst.name.toLowerCase()) ||
        statementCoveredKeywords.has((inst.payment_method || '').toLowerCase()) ||
        statementCoveredKeywords.has('kartu kredit') ||
        activeStatementInstallmentSum >= inst.monthly_payment
      );

      obligations.push({
        id: `inst-${inst.id || Math.random()}`,
        installment_id: inst.id,
        title: `Angsuran: ${inst.name}${isCoveredByStatement ? ' (Ditagih via Statement CC)' : ''}`,
        type: 'Installment',
        due_date: inst.due_date,
        amount: inst.monthly_payment,
        paid_amount: 0,
        // Jika sudah ditagih di statement, jangan jadikan beban kas terpisah (agar tidak double-count!)
        remaining_amount: isCoveredByStatement ? 0 : inst.monthly_payment,
        status: isCoveredByStatement ? 'Paid' : status,
        owner: 'Bersama'
      });
    }
  }

  // 2. Masukkan statement kartu kredit / paylater yang belum lunas
  for (const stmt of statements) {
    if (stmt.status !== 'Paid') {
      const remainingAmount = Math.max(0, stmt.closing_balance - stmt.paid_amount);
      if (remainingAmount > 0) {
        const remainingDays = getDaysRemaining(stmt.due_date, baseDate);
        let status: 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue' = stmt.paid_amount > 0 ? 'Partially Paid' : 'Pending';
        if (remainingDays < 0) status = 'Overdue';

        obligations.push({
          id: `stmt-${stmt.id}`,
          statement_id: stmt.id,
          debt_account_id: stmt.debt_account_id,
          title: `Tagihan Kartu Kredit/PayLater (${stmt.statement_period})`,
          type: 'CreditCardStatement',
          due_date: stmt.due_date,
          amount: stmt.closing_balance,
          paid_amount: stmt.paid_amount,
          remaining_amount: remainingAmount,
          status,
          owner: 'Bersama'
        });
      }
    }
  }

  // 3. Masukkan pengeluaran rutin ('Semua Bulan')
  for (const exp of routineExpenses.filter(e => e.date === 'Semua Bulan')) {
    obligations.push({
      id: `routine-${exp.id || Math.random()}`,
      title: `Rutin: ${exp.description || exp.category}`,
      type: 'RoutineExpense',
      due_date: baseDate.toISOString().split('T')[0],
      amount: exp.amount,
      paid_amount: 0,
      remaining_amount: exp.amount,
      status: 'Pending',
      owner: exp.owner
    });
  }

  // Urutkan kewajiban berdasarkan tanggal jatuh tempo terdekat
  obligations.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  // Hitung horizon 7 hari dan 30 hari
  let upcomingObligations7Days = 0;
  let upcomingObligations30Days = 0;
  let upcomingObligationsTotal = 0;

  for (const item of obligations) {
    const days = getDaysRemaining(item.due_date, baseDate);
    upcomingObligationsTotal += item.remaining_amount;

    if (days <= 7) {
      upcomingObligations7Days += item.remaining_amount;
    }
    if (days <= 30) {
      upcomingObligations30Days += item.remaining_amount;
    }
  }

  // Proyeksi sisa kas = Kas awal + pemasukan terkonfirmasi + estimasi - kewajiban total
  const projectedEndingCash = (initialCash + confirmedIncome + estimatedIncome) - upcomingObligationsTotal;
  const isDeficitProjected = projectedEndingCash < 0;
  const deficitAmount = isDeficitProjected ? Math.abs(projectedEndingCash) : 0;

  return {
    initialCash,
    confirmedIncome,
    estimatedIncome,
    paidObligations: 0,
    upcomingObligations7Days,
    upcomingObligations30Days,
    upcomingObligationsTotal,
    projectedEndingCash,
    isDeficitProjected,
    deficitAmount,
    obligations
  };
};
