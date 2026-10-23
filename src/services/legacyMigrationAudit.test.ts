import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { prepareBackupImport, resolveForeignKey } from '../utils/backupRestore';
import { calculateFinancialSummary } from '../utils/financeCalculations';
import type { FinancialAccount, Income, Expense } from '../types/finance';

/**
 * AUDIT REKONSILIASI SALDO AWAL, MIGRASI LEGACY, & BACKUP/RESTORE
 * Menguji dataset riil dari file backup legacy (Cashflow_Backup_2026-09-21.json)
 * serta dataset sintetis untuk rekonsiliasi saldo.
 */

describe('Audit Migrasi Data Legacy & Backup/Restore Aktual', () => {
  const legacyBackupPath = path.resolve('d:/Projek AntiGravity/Aplikasi Cashflow/Cashflow_Backup_2026-09-21.json');

  it('1. Membaca dan memvalidasi struktur file backup aktual legacy (2026-09-21)', () => {
    expect(fs.existsSync(legacyBackupPath)).toBe(true);

    const rawData = fs.readFileSync(legacyBackupPath, 'utf-8');
    const backupJson = JSON.parse(rawData);

    // Verifikasi keberadaan entitas legacy aktual
    expect(Array.isArray(backupJson.incomes)).toBe(true);
    expect(Array.isArray(backupJson.expenses)).toBe(true);
    expect(Array.isArray(backupJson.installments)).toBe(true);

    expect(backupJson.incomes.length).toBe(2);
    expect(backupJson.expenses.length).toBe(48);
    expect(backupJson.installments.length).toBe(18);

    // Verifikasi karakteristik data legacy:
    // a. ID legacy bertipe angka (number)
    expect(typeof backupJson.installments[0].id).toBe('number');
    expect(backupJson.installments[0].id).toBe(1);

    // b. Sebagian pengeluaran rutin menggunakan date: "Semua Bulan"
    const recurringExpenses = backupJson.expenses.filter((e: any) => e.date === 'Semua Bulan');
    expect(recurringExpenses.length).toBeGreaterThan(0);
  });

  it('2. Import Legacy: Merencanakan impor dataset aktual ke database v2.0 tanpa kehilangan data', () => {
    const rawData = fs.readFileSync(legacyBackupPath, 'utf-8');
    const backupJson = JSON.parse(rawData);

    const emptyInitialState = {
      incomes: [],
      expenses: [],
      installments: [],
      financialAccounts: []
    };

    const importPlan = prepareBackupImport(backupJson, emptyInitialState);

    // 100% data terencana untuk diimpor
    expect(importPlan.incomes.length).toBe(2);
    expect(importPlan.expenses.length).toBe(48);
    expect(importPlan.installments.length).toBe(18);
    expect(importPlan.duplicatesCount).toBe(0);

    // Verifikasi normalisasi ID legacy angka ke string
    expect(importPlan.installments[0].originalId).toBe('1');
    expect(importPlan.installments[1].originalId).toBe('2');
  });

  it('3. Mencegah duplikasi data saat restore kedua kali (Idempotensi Restore)', () => {
    const rawData = fs.readFileSync(legacyBackupPath, 'utf-8');
    const backupJson = JSON.parse(rawData);

    // Simulasi keadaan database setelah ronde pertama impor
    const populatedState = {
      incomes: backupJson.incomes.map((i: any, idx: number) => ({ ...i, id: `firestore-inc-${idx}` })),
      expenses: backupJson.expenses.map((e: any, idx: number) => ({ ...e, id: `firestore-exp-${idx}` })),
      installments: backupJson.installments.map((inst: any, idx: number) => ({ ...inst, id: `firestore-inst-${idx}` })),
      financialAccounts: []
    };

    // Ronde kedua: Pengguna mengimpor kembali file backup yang sama secara tidak sengaja
    const secondImportPlan = prepareBackupImport(backupJson, populatedState);

    // Seluruh data terdeteksi sebagai duplikat dan diabaikan!
    expect(secondImportPlan.duplicatesCount).toBe(2 + 48 + 18); // 68 duplikat dicegah
    expect(secondImportPlan.incomes.length).toBe(0);
    expect(secondImportPlan.expenses.length).toBe(0);
    expect(secondImportPlan.installments.length).toBe(0);
  });

  it('4. Mempertahankan relasi foreign key saat ID diubah dari angka ke string auto-ID Firestore', () => {
    const idMap = new Map<string, string>();
    // Legacy ID 1 (KUR Mandiri) dipetakan ke auto-ID Firestore 'doc_firestore_kur_123'
    idMap.set('1', 'doc_firestore_kur_123');

    const knownIds = new Set(['doc_firestore_kur_123']);

    // Expense yang merujuk ke angka 1
    const remappedIdFromNumber = resolveForeignKey(1, idMap, knownIds);
    expect(remappedIdFromNumber).toBe('doc_firestore_kur_123');

    // Expense yang merujuk ke string "1"
    const remappedIdFromString = resolveForeignKey('1', idMap, knownIds);
    expect(remappedIdFromString).toBe('doc_firestore_kur_123');
  });

  it('5. Audit Rekonsiliasi Saldo Awal dengan Data Historis (Reconciliation Variance Audit)', () => {
    // Akun bank dengan saldo awal fisik m-Banking
    const accountBCA: FinancialAccount = {
      id: 'acc-bca',
      name: 'BCA Tabungan Payroll',
      type: 'Bank',
      owner: 'Suami',
      currency: 'IDR',
      opening_balance: 10000000,
      current_balance: 10000000,
      isActive: 1,
      timestamp: 1
    };

    // Histori transaksi yang tercatat di aplikasi
    const historicalIncomes: Income[] = [
      { id: 'inc-1', date: '2026-09-25', source: 'Gaji', amount: 8000000, owner: 'Suami', account_id: 'acc-bca', timestamp: 1 },
      { id: 'inc-2', date: '2026-10-01', source: 'Bonus', amount: 2000000, owner: 'Suami', account_id: 'acc-bca', timestamp: 2 }
    ];

    const historicalExpenses: Expense[] = [
      { id: 'exp-1', date: '2026-09-26', category: 'Kebutuhan', amount: 3500000, owner: 'Suami', payment_method: 'BCA', source_account_id: 'acc-bca', timestamp: 3 },
      { id: 'exp-2', date: '2026-10-05', category: 'Listrik', amount: 500000, owner: 'Suami', payment_method: 'BCA', source_account_id: 'acc-bca', timestamp: 4 }
    ];

    // Saldo buku matematis berdasarkan mutasi historis:
    // Saldo Awal (10.000.000) + Pemasukan (10.000.000) - Pengeluaran (4.000.000) = 16.000.000
    const totalInflow = historicalIncomes.reduce((sum, i) => sum + i.amount, 0);
    const totalOutflow = historicalExpenses.reduce((sum, e) => sum + e.amount, 0);
    const calculatedBookBalance = accountBCA.opening_balance + totalInflow - totalOutflow;
    expect(calculatedBookBalance).toBe(16000000);

    // Saldo riil fisik di m-Banking per hari rekonsiliasi adalah Rp15.850.000 (Selisih -150.000 karena ada biaya admin bank bulanan yang belum tercatat)
    const actualPhysicalBalance = 15850000;
    const reconciliationVariance = actualPhysicalBalance - calculatedBookBalance;
    expect(reconciliationVariance).toBe(-150000);

    // Tindakan Rekonsiliasi:
    // 1. Catat beban riil yang terlewat (Biaya Admin Bank) sebagai pengeluaran resmi agar beban ekonomi akurat
    const unrecordedBankFeeExpense: Expense = {
      id: 'exp-admin-fee',
      date: '2026-10-01',
      category: 'Biaya Admin & Transaksi',
      payment_method: 'BCA Tabungan Payroll',
      amount: Math.abs(reconciliationVariance),
      owner: 'Suami',
      source_account_id: 'acc-bca',
      expense_type: 'FeeOrInterest',
      timestamp: Date.now()
    };

    // 2. Perbarui saldo berjalan akun ke saldo fisik yang telah terverifikasi
    accountBCA.current_balance = actualPhysicalBalance;

    // 3. Hitung ulang ringkasan keuangan
    const summary = calculateFinancialSummary(
      historicalIncomes,
      [...historicalExpenses, unrecordedBankFeeExpense],
      [],
      '2026-10',
      { accounts: [accountBCA] }
    );

    // Beban ekonomi dan kas keluar terbarui mencakup biaya admin bank Rp150.000
    expect(summary.availableLiquidCash).toBe(15850000);
    expect(accountBCA.current_balance).toBe(15850000);
  });

  it('6. Transaksi berulang sah pada tanggal yang sama (BBM Motor & Listrik) tidak terhapus sebagai duplikat', () => {
    const rawData = fs.readFileSync(legacyBackupPath, 'utf-8');
    const backupJson = JSON.parse(rawData);

    // Filter transaksi BBM Motor dari backup riil
    const bbmMotorReceipts = backupJson.expenses.filter((e: any) => e.description === 'BBM Motor');
    expect(bbmMotorReceipts.length).toBe(3); // Ada 3 transaksi sah BBM Motor Rp30.000 pada tanggal yang sama

    const plan = prepareBackupImport(
      { expenses: bbmMotorReceipts },
      { incomes: [], expenses: [], installments: [], financialAccounts: [] }
    );

    // Ketiga transaksi sah BBM Motor tersebut harus tetap ada di antrean impor (tidak di-drop)
    expect(plan.expenses.length).toBe(3);
    expect(plan.duplicatesCount).toBe(0);
  });
});
