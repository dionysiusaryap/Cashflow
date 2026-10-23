import { describe, it, expect } from 'vitest';
import { prepareBackupImport, resolveForeignKey } from './backupRestore';
import type { FinancialAccount, Installment, Income, Expense } from '../types/finance';

describe('Backup & Restore Verification (Scenario 11: FK Remapping & Duplicate Prevention)', () => {
  it('Memetakan kembali foreign key, menolak transaksi duplikat, dan mensterilkan referensi rusak', () => {
    const existingAccounts: FinancialAccount[] = [
      { id: 'acc-1', name: 'BCA Tabungan', type: 'Bank', owner: 'Suami', currency: 'IDR', opening_balance: 10000000, current_balance: 10000000, isActive: 1, timestamp: 1 }
    ];

    const existingInstallments: Installment[] = [
      { id: 'inst-1', name: 'KPR Rumah', type: 'KPR', initial_amount: 300000000, monthly_payment: 3000000, tenor: 100, paid_installments: 10, remaining_installments: 90, outstanding: 270000000, due_date: '2026-10-25', payment_method: 'Auto Debit', status: 'Aman', timestamp: 1 }
    ];

    const existingIncomes: Income[] = [
      { id: 'inc-1', date: '2026-10-01', source: 'Gaji', amount: 15000000, owner: 'Suami', timestamp: 1 }
    ];

    const existingExpenses: Expense[] = [
      { id: 'exp-1', date: '2026-10-02', category: 'Listrik', amount: 500000, owner: 'Suami', payment_method: 'BCA Tabungan', timestamp: 1 }
    ];

    const backupData = {
      financialAccounts: [
        // Akun yang sudah ada (harus dipetakan ke acc-1, bukan dibuat baru)
        { id: 'old-acc-bca', name: 'BCA Tabungan', owner: 'Suami', type: 'Bank' },
        // Akun baru
        { id: 'old-acc-gopay', name: 'GoPay', owner: 'Istri', type: 'E-Wallet' }
      ],
      installments: [
        // Cicilan yang sudah ada (harus dipetakan ke inst-1)
        { id: 'old-inst-kpr', name: 'KPR Rumah', initial_amount: 300000000 },
        // Cicilan baru
        { id: 'old-inst-mobil', name: 'Cicilan Mobil', initial_amount: 150000000, monthly_payment: 5000000, tenor: 30, paid_installments: 0, remaining_installments: 30, outstanding: 150000000, due_date: '2026-11-05', payment_method: 'BCA', status: 'Aman' }
      ],
      incomes: [
        // Duplikat dari existingIncomes (harus di-skip)
        { id: 'backup-inc-1', date: '2026-10-01', source: 'Gaji', amount: 15000000, owner: 'Suami' },
        // Income baru
        { id: 'backup-inc-2', date: '2026-10-15', source: 'Bonus', amount: 5000000, owner: 'Suami' }
      ],
      expenses: [
        // Duplikat dari existingExpenses (harus di-skip)
        { id: 'backup-exp-1', date: '2026-10-02', category: 'Listrik', amount: 500000, owner: 'Suami' },
        // Expense pembayaran cicilan merujuk ke ID cicilan lama 'old-inst-kpr'
        { id: 'backup-exp-2', date: '2026-10-25', category: 'Cicilan', amount: 3000000, owner: 'Suami', installment_id: 'old-inst-kpr', source_account_id: 'old-acc-bca' },
        // Expense pembayaran cicilan baru merujuk ke 'old-inst-mobil'
        { id: 'backup-exp-3', date: '2026-11-05', category: 'Cicilan', amount: 5000000, owner: 'Suami', installment_id: 'old-inst-mobil' },
        // Expense dengan ID asing / broken foreign key
        { id: 'backup-exp-4', date: '2026-11-10', category: 'Cicilan', amount: 1000000, owner: 'Suami', installment_id: 'non-existent-ghost-id' }
      ]
    };

    const plan = prepareBackupImport(backupData, {
      financialAccounts: existingAccounts,
      installments: existingInstallments,
      incomes: existingIncomes,
      expenses: existingExpenses
    });

    // 1. Verifikasi Duplikasi dicegah
    expect(plan.duplicatesCount).toBe(4); // 1 akun duplikat, 1 cicilan duplikat, 1 income duplikat, 1 expense duplikat
    expect(plan.accounts.length).toBe(1);  // Hanya akun GoPay yang baru
    expect(plan.accounts[0].item.name).toBe('GoPay');
    expect(plan.installments.length).toBe(1); // Hanya Cicilan Mobil yang baru
    expect(plan.incomes.length).toBe(1);     // Hanya Bonus yang baru
    expect(plan.expenses.length).toBe(3);    // 3 expense baru (1 duplikat dibuang)

    // 2. Verifikasi Pemetaan Akun dan Cicilan yang sudah ada
    expect(plan.existingAccountMap.get('old-acc-bca')).toBe('acc-1');
    expect(plan.existingInstallmentMap.get('old-inst-kpr')).toBe('inst-1');

    // 3. Simulasi penyimpanan cicilan baru yang menghasilkan ID 'inst-mobil-new'
    const runtimeInstallmentIdMap = new Map(plan.existingInstallmentMap);
    runtimeInstallmentIdMap.set('old-inst-mobil', 'inst-mobil-new');

    const runtimeAccountIdMap = new Map(plan.existingAccountMap);

    const knownInstallmentIds = new Set(
      existingInstallments.map(i => i.id).filter((id): id is string => Boolean(id)).concat('inst-mobil-new')
    );
    const knownAccountIds = new Set(
      existingAccounts.map(a => a.id).filter((id): id is string => Boolean(id))
    );

    // 4. Verifikasi Resolusi Foreign Key
    // Case A: Merujuk ke cicilan lama yang sudah ada di database
    const mappedFk1 = resolveForeignKey('old-inst-kpr', runtimeInstallmentIdMap, knownInstallmentIds);
    expect(mappedFk1).toBe('inst-1');

    // Case B: Merujuk ke akun lama yang sudah ada di database
    const mappedAcc1 = resolveForeignKey('old-acc-bca', runtimeAccountIdMap, knownAccountIds);
    expect(mappedAcc1).toBe('acc-1');

    // Case C: Merujuk ke cicilan baru yang baru dibuat saat import
    const mappedFk2 = resolveForeignKey('old-inst-mobil', runtimeInstallmentIdMap, knownInstallmentIds);
    expect(mappedFk2).toBe('inst-mobil-new');

    // Case D: Referensi palsu dinetralkan menjadi undefined
    const mappedBrokenFk = resolveForeignKey('non-existent-ghost-id', runtimeInstallmentIdMap, knownInstallmentIds);
    expect(mappedBrokenFk).toBeUndefined();
  });
});
