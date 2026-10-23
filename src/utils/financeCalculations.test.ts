import { describe, it, expect } from 'vitest';
import {
  calculateFinancialSummary,
  calculateCashProjection,
  isInstallmentPayment,
  isCreditCardSettlement,
  isCreditPurchase
} from './financeCalculations';
import { getFinancialPeriod, extractDateParts, calculateNextMonthlyDueDate } from './dateUtils';
import type { Income, Expense, Installment } from '../types/finance';

describe('Financial Cutoff & DateUtils Tests', () => {
  it('Scenario 10: Transaksi tanggal 24 dan 25 masuk ke periode anggaran yang benar', () => {
    // Tanggal 24 Oktober 2026 -> Periode '2026-10'
    expect(getFinancialPeriod('2026-10-24')).toBe('2026-10');

    // Tanggal 25 Oktober 2026 -> Periode '2026-11' (cutoff gaji)
    expect(getFinancialPeriod('2026-10-25')).toBe('2026-11');

    // Tanggal 31 Oktober 2026 -> Periode '2026-11'
    expect(getFinancialPeriod('2026-10-31')).toBe('2026-11');
  });

  it('Scenario 11: Peralihan Desember ke Januari benar', () => {
    // Tanggal 24 Desember 2026 -> '2026-12'
    expect(getFinancialPeriod('2026-12-24')).toBe('2026-12');

    // Tanggal 25 Desember 2026 -> '2027-01' (Tahun depan Januari)
    expect(getFinancialPeriod('2026-12-25')).toBe('2027-01');

    // Tanggal 31 Desember 2026 -> '2027-01'
    expect(getFinancialPeriod('2026-12-31')).toBe('2027-01');
  });

  it('Kalkulasi jatuh tempo bulanan berikutnya tepat', () => {
    expect(calculateNextMonthlyDueDate('2026-10-15')).toBe('2026-11-15');
    expect(calculateNextMonthlyDueDate('2026-12-20')).toBe('2027-01-20');
  });

  it('Ekstraksi komponen tanggal berjalan konsisten', () => {
    const parts = extractDateParts('2026-10-25');
    expect(parts).not.toBeNull();
    expect(parts?.year).toBe(2026);
    expect(parts?.month).toBe(10);
    expect(parts?.day).toBe(25);
  });

  it('Deteksi predikat cicilan, pelunasan CC, dan belanja kredit', () => {
    const instExpense: Expense = { date: '2026-10-10', category: 'Tagihan', payment_method: 'Bank', amount: 500000, owner: 'Bersama', installment_id: 'inst1', timestamp: 1 };
    expect(isInstallmentPayment(instExpense)).toBe(true);

    const ccSettlement: Expense = { date: '2026-10-10', category: 'Pembayaran Tagihan CC/SPaylater', payment_method: 'Bank', amount: 1000000, owner: 'Bersama', timestamp: 1 };
    expect(isCreditCardSettlement(ccSettlement)).toBe(true);

    const ccPurchase: Expense = { date: '2026-10-10', category: 'Belanja', payment_method: 'Kartu Kredit BCA', amount: 200000, owner: 'Bersama', timestamp: 1 };
    expect(isCreditPurchase(ccPurchase)).toBe(true);
  });
});

describe('Finance Calculations & Anti-Double-Counting Tests', () => {
  it('Scenario 1: Pengeluaran tunai Rp1.000.000 mengurangi kas dan menambah beban sebesar Rp1.000.000', () => {
    const incomes: Income[] = [
      { id: '1', date: '2026-10-10', source: 'Gaji', amount: 10000000, owner: 'Suami', timestamp: 1 }
    ];
    const expenses: Expense[] = [
      { id: 'e1', date: '2026-10-12', category: 'Belanja', payment_method: 'Cash', amount: 1000000, owner: 'Bersama', timestamp: 1 }
    ];
    const installments: Installment[] = [];

    const summary = calculateFinancialSummary(incomes, expenses, installments, '2026-10');

    expect(summary.totalIncome).toBe(10000000);
    expect(summary.economicExpense).toBe(1000000); // Beban ekonomi bertambah 1.000.000
    expect(summary.cashOutflow).toBe(1000000);     // Kas keluar riil 1.000.000
    expect(summary.netCashflow).toBe(9000000);     // Kas bersih tersisa 9.000.000
    expect(summary.economicSurplus).toBe(9000000);
  });

  it('Scenario 2: Pembelian kartu kredit Rp1.000.000 menambah beban tanpa mengurangi kas', () => {
    const incomes: Income[] = [
      { id: '1', date: '2026-10-10', source: 'Gaji', amount: 10000000, owner: 'Suami', timestamp: 1 }
    ];
    const expenses: Expense[] = [
      {
        id: 'e2',
        date: '2026-10-15',
        category: 'Elektronik',
        payment_method: 'Kartu Kredit',
        amount: 1000000,
        owner: 'Bersama',
        expense_type: 'CreditPurchase',
        timestamp: 1
      }
    ];
    const installments: Installment[] = [];

    const summary = calculateFinancialSummary(incomes, expenses, installments, '2026-10');

    expect(summary.economicExpense).toBe(1000000); // Konsumsi ekonomi dihitung saat belanja
    expect(summary.cashOutflow).toBe(0);           // Kas belum berkurang karena belum dibayar
    expect(summary.netCashflow).toBe(10000000);    // Kas masih utuh
    expect(summary.economicSurplus).toBe(9000000); // Surplus ekonomi berkurang
  });

  it('Scenario 3: Pembayaran tagihan kartu kredit Rp1.000.000 mengurangi kas tanpa menambah beban belanja baru', () => {
    const incomes: Income[] = [
      { id: '1', date: '2026-10-10', source: 'Gaji', amount: 10000000, owner: 'Suami', timestamp: 1 }
    ];
    // Pengeluaran pelunasan tagihan
    const expenses: Expense[] = [
      {
        id: 'e3',
        date: '2026-10-20',
        category: 'Pembayaran Tagihan CC/SPaylater',
        payment_method: 'Transfer Bank',
        amount: 1000000,
        owner: 'Bersama',
        expense_type: 'BillSettlement',
        timestamp: 1
      }
    ];
    const installments: Installment[] = [];

    const summary = calculateFinancialSummary(incomes, expenses, installments, '2026-10');

    expect(summary.economicExpense).toBe(0);       // BUKAN beban belanja baru (tidak double count!)
    expect(summary.cashOutflow).toBe(1000000);     // Mengurangi kas aktual saat transfer pelunasan
    expect(summary.netCashflow).toBe(9000000);     // Kas berkurang
    expect(summary.economicSurplus).toBe(10000000);// Surplus ekonomi tetap utuh
  });

  it('Scenario 5 & 17: Pembayaran cicilan dan status lunas tidak terus menghasilkan beban angsuran', () => {
    const incomes: Income[] = [
      { id: '1', date: '2026-10-10', source: 'Gaji', amount: 10000000, owner: 'Suami', timestamp: 1 }
    ];
    // Satu cicilan aktif dan satu cicilan yang sudah lunas
    const installments: Installment[] = [
      {
        id: 'inst-active',
        name: 'KPR BTN',
        type: 'KPR',
        initial_amount: 100000000,
        monthly_payment: 2500000,
        tenor: 120,
        paid_installments: 10,
        remaining_installments: 110,
        outstanding: 90000000,
        due_date: '2026-10-15',
        payment_method: 'Auto Debit',
        status: 'Aman',
        timestamp: 1
      },
      {
        id: 'inst-paid',
        name: 'Cicilan Kulkas',
        type: 'Elektronik',
        initial_amount: 6000000,
        monthly_payment: 500000,
        tenor: 12,
        paid_installments: 12,
        remaining_installments: 0,
        outstanding: 0,
        due_date: '2026-10-10',
        payment_method: 'Transfer',
        status: 'Lunas', // Sudah lunas!
        timestamp: 1
      }
    ];

    const expenses: Expense[] = [
      {
        id: 'e-inst',
        date: '2026-10-15',
        category: 'Tagihan & Utilitas',
        payment_method: 'Auto Debit',
        amount: 2500000,
        owner: 'Bersama',
        installment_id: 'inst-active',
        description: 'Pembayaran Cicilan: KPR BTN',
        timestamp: 1
      }
    ];

    const summary = calculateFinancialSummary(incomes, expenses, installments, '2026-10');

    // Scenario 17: Cicilan lunas TIDAK dihitung dalam total kewajiban bulanan
    expect(summary.loanInstallmentObligation).toBe(2500000); // Hanya KPR yang aktif
    expect(summary.totalOutstanding).toBe(90000000);

    // Scenario 5: Pembayaran cicilan tercatat di installmentPaymentsArr dan kas keluar
    expect(summary.installmentPaymentTotal).toBe(2500000);
    expect(summary.cashOutflow).toBe(2500000);
    expect(summary.economicExpense).toBe(0); // Pembayaran pokok bukan beban belanja harian
  });

  it('Scenario 16: Nilai income nol tidak menyebabkan pembagian dengan nol (NaN / Infinity)', () => {
    const incomes: Income[] = [];
    const expenses: Expense[] = [
      { id: 'e1', date: '2026-10-10', category: 'Makan', payment_method: 'Cash', amount: 500000, owner: 'Bersama', timestamp: 1 }
    ];
    const installments: Installment[] = [
      {
        id: 'inst1',
        name: 'Motor',
        type: 'Kendaraan',
        initial_amount: 20000000,
        monthly_payment: 1000000,
        tenor: 24,
        paid_installments: 5,
        remaining_installments: 19,
        outstanding: 15000000,
        due_date: '2026-10-20',
        payment_method: 'Transfer',
        status: 'Aman',
        timestamp: 1
      }
    ];

    const summary = calculateFinancialSummary(incomes, expenses, installments, '2026-10');

    expect(summary.totalIncome).toBe(0);
    expect(summary.savingRate).toBe(0);
    expect(summary.installmentDebtRatio).toBe(0);
    expect(summary.debtRatio).toBe(0);
    expect(Number.isNaN(summary.savingRate)).toBe(false);
    expect(Number.isFinite(summary.savingRate)).toBe(true);
  });

  it('Scenario 12: Data legacy tetap dapat dihitung tanpa error', () => {
    // Data legacy tanpa properti baru
    const legacyIncomes: Income[] = [
      { date: '2026-10-05', source: 'Gaji', amount: 5000000, owner: 'Suami', timestamp: 1 }
    ];
    const legacyExpenses: Expense[] = [
      { date: '2026-10-10', category: 'Makanan & Minuman', payment_method: 'Cash', amount: 200000, owner: 'Suami', timestamp: 1 }
    ];
    const legacyInstallments: Installment[] = [
      {
        name: 'Cicilan HP',
        type: 'Gadget',
        initial_amount: 3000000,
        monthly_payment: 500000,
        tenor: 6,
        paid_installments: 2,
        remaining_installments: 4,
        outstanding: 2000000,
        due_date: '2026-10-25', // cut-off masuk ke 2026-11
        payment_method: 'Cash',
        status: 'Aman',
        timestamp: 1
      }
    ];

    const summary = calculateFinancialSummary(legacyIncomes, legacyExpenses, legacyInstallments, '2026-10');

    expect(summary.totalIncome).toBe(5000000);
    expect(summary.dailyExpenseTotal).toBe(200000);
    expect(summary.totalActualExpense).toBe(700000); // 200rb + 500rb cicilan
    expect(summary.cashFlow).toBe(4300000);
  });

  it('Scenario 15: Proyeksi kas tidak mencampur saldo aktual dengan estimasi', () => {
    const installments: Installment[] = [
      {
        id: 'inst-1',
        name: 'KPR',
        type: 'KPR',
        initial_amount: 100000000,
        monthly_payment: 3000000,
        tenor: 120,
        paid_installments: 10,
        remaining_installments: 110,
        outstanding: 90000000,
        due_date: '2026-10-28',
        payment_method: 'Auto Debit',
        status: 'Aman',
        timestamp: 1
      }
    ];

    const projection = calculateCashProjection(
      5000000,  // Kas riil saat ini: 5.000.000
      10000000, // Pemasukan terkonfirmasi: 10.000.000
      2000000,  // Pemasukan estimasi: 2.000.000
      installments,
      [],
      [],
      new Date('2026-10-23')
    );

    expect(projection.initialCash).toBe(5000000);
    expect(projection.confirmedIncome).toBe(10000000);
    expect(projection.estimatedIncome).toBe(2000000);
    expect(projection.upcomingObligationsTotal).toBe(3000000);
    // Ending: (5jt + 10jt + 2jt) - 3jt = 14.000.000
    expect(projection.projectedEndingCash).toBe(14000000);
    expect(projection.isDeficitProjected).toBe(false);
  });
});
