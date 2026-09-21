import type { Income, Expense, Installment } from '../store/useAppStore';
import { getFinancialPeriod } from './dateUtils';

export const calculateFinancialSummary = (
  incomes: Income[],
  expenses: Expense[],
  installments: Installment[],
  periodStr?: string // e.g. '2026-08'
) => {
  // Filter by period if provided (also include data with date 'Semua Bulan' as they apply to all periods)
  const periodIncomes = periodStr ? incomes.filter(i => getFinancialPeriod(i.date) === periodStr || i.date === 'Semua Bulan') : incomes;
  const periodExpenses = periodStr ? expenses.filter(e => getFinancialPeriod(e.date) === periodStr || e.date === 'Semua Bulan') : expenses;
  
  const totalIncome = periodIncomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  
  // Migrasi ringan: anggap pengeluaran dengan kategori 'Tagihan & Utilitas' dan keterangan mengandung 'Pembayaran Cicilan' sebagai installment_id sementara
  const isInstallmentPayment = (e: Expense) => {
    if (e.installment_id) return true;
    if (e.description?.includes('Pembayaran Cicilan:') && e.category === 'Tagihan & Utilitas') return true;
    return false;
  };

  const isCCPayment = (e: Expense) => e.category === 'Pembayaran Tagihan CC/SPaylater';

  const dailyExpensesArr = periodExpenses.filter(e => !isInstallmentPayment(e) && !isCCPayment(e));
  const installmentPaymentsArr = periodExpenses.filter(e => isInstallmentPayment(e));
  
  const dailyExpenseTotal = dailyExpensesArr.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const installmentPaymentTotal = installmentPaymentsArr.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  
  const cashFlow = totalIncome - dailyExpenseTotal - installmentPaymentTotal;
  
  const savingRate = totalIncome > 0 ? (cashFlow / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (dailyExpenseTotal / totalIncome) * 100 : 0;
  
  // Active installments are those with remaining_installments > 0
  const activeInstallments = installments.filter(i => (Number(i.remaining_installments) || 0) > 0);
  const totalMonthlyInstallment = activeInstallments.reduce((acc, curr) => acc + (Number(curr.monthly_payment) || 0), 0);
  const debtRatio = totalIncome > 0 ? (totalMonthlyInstallment / totalIncome) * 100 : 0;
  
  const totalOutstanding = activeInstallments.reduce((acc, curr) => acc + (Number(curr.outstanding) || 0), 0);

  return {
    totalIncome,
    dailyExpenseTotal,
    installmentPaymentTotal,
    cashFlow,
    savingRate,
    expenseRatio,
    debtRatio,
    totalMonthlyInstallment,
    totalOutstanding,
    dailyExpensesArr,
    installmentPaymentsArr
  };
};
