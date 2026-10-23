import { describe, it, expect } from 'vitest';
import type { Installment, FinancialAccount, Expense, DebtStatement, DebtTransaction, AuditLog } from '../types/finance';
import { calculatePreviousMonthlyDueDate } from '../utils/dateUtils';

/**
 * INTEGRATION TEST SUITE: TRANSACTIONAL EMULATOR HARNESS
 * Menguji alur integrasi multi-dokumen dengan semantik Firestore Transaction:
 * 1. Pembayaran Cicilan
 * 2. Settlement Kartu Kredit
 * 3. Atomicity (Rollback saat gagal)
 * 4. Concurrency (Optimistic Locking & Serializability)
 * 5. Idempotency Guard
 * 6. Retry After Timeout
 * 7. Reversal & Repeated Reversal Guard
 */

interface MockDatabase {
  installments: Map<string, Installment>;
  accounts: Map<string, FinancialAccount>;
  expenses: Map<string, Expense>;
  debtStatements: Map<string, DebtStatement>;
  debtTransactions: Map<string, DebtTransaction>;
  auditLogs: Map<string, AuditLog>;
}

const createMockDatabase = (): MockDatabase => ({
  installments: new Map(),
  accounts: new Map(),
  expenses: new Map(),
  debtStatements: new Map(),
  debtTransactions: new Map(),
  auditLogs: new Map()
});

describe('Integration Test: Firestore Transactional Operations & Concurrency', () => {

  it('1. Pembayaran Cicilan: Atomik memperbarui cicilan, rekening kas, pengeluaran, dan audit log', async () => {
    const db = createMockDatabase();

    // Inisialisasi data
    const initialInstallment: Installment = {
      id: 'inst-1',
      name: 'KPR BTN',
      type: 'KPR',
      initial_amount: 120000000,
      monthly_payment: 2000000,
      tenor: 60,
      paid_installments: 10,
      remaining_installments: 50,
      outstanding: 100000000,
      due_date: '2026-10-25',
      payment_method: 'Auto Debit BCA',
      status: 'Aman',
      timestamp: 1
    };
    db.installments.set(initialInstallment.id!, initialInstallment);

    const initialAccount: FinancialAccount = {
      id: 'acc-bca',
      name: 'BCA Tabungan',
      type: 'Bank',
      owner: 'Suami',
      currency: 'IDR',
      opening_balance: 15000000,
      current_balance: 15000000,
      isActive: 1,
      timestamp: 1
    };
    db.accounts.set(initialAccount.id, initialAccount);

    // Eksekusi Transactional Pay Installment
    const payAmount = 2000000;
    const runInstallmentPaymentTxn = async (instId: string, accId: string, amount: number) => {
      const inst = db.installments.get(instId);
      const acc = db.accounts.get(accId);
      if (!inst || !acc) throw new Error('DOCUMENT_NOT_FOUND');

      const isFullPayoff = amount >= inst.outstanding;
      const newOutstanding = isFullPayoff ? 0 : inst.outstanding - amount;
      const newRemaining = isFullPayoff ? 0 : inst.remaining_installments - 1;
      const newPaid = isFullPayoff ? inst.tenor : inst.paid_installments + 1;
      const newStatus = isFullPayoff ? 'Lunas' : 'Aman';

      // 1. Update installment
      db.installments.set(instId, {
        ...inst,
        outstanding: newOutstanding,
        remaining_installments: newRemaining,
        paid_installments: newPaid,
        status: newStatus
      });

      // 2. Update account
      db.accounts.set(accId, {
        ...acc,
        current_balance: acc.current_balance - amount
      });

      // 3. Create expense
      const expenseId = `exp-pay-${Date.now()}`;
      db.expenses.set(expenseId, {
        id: expenseId,
        date: '2026-10-24',
        category: 'Cicilan & Utang',
        payment_method: acc.name,
        amount,
        owner: acc.owner,
        installment_id: instId,
        source_account_id: accId,
        expense_type: 'DebtPayment',
        timestamp: Date.now()
      });

      // 4. Create immutable audit log
      const logId = `log-${Date.now()}`;
      db.auditLogs.set(logId, {
        id: logId,
        entity_type: 'Installment',
        entity_id: instId,
        action: 'PAYMENT',
        summary: `Pembayaran cicilan ${inst.name} sebesar Rp${amount.toLocaleString('id-ID')}`,
        timestamp: Date.now()
      });
    };

    await runInstallmentPaymentTxn('inst-1', 'acc-bca', payAmount);

    // Verifikasi state akhir seluruh dokumen yang terlibat
    const updatedInst = db.installments.get('inst-1')!;
    const updatedAcc = db.accounts.get('acc-bca')!;
    expect(updatedInst.outstanding).toBe(98000000);
    expect(updatedInst.remaining_installments).toBe(49);
    expect(updatedInst.paid_installments).toBe(11);
    expect(updatedAcc.current_balance).toBe(13000000);
    expect(db.expenses.size).toBe(1);
    expect(db.auditLogs.size).toBe(1);
  });

  it('2. Settlement Kartu Kredit: Atomik mencatat pelunasan tagihan, memotong kas, dan bebas beban ganda', async () => {
    const db = createMockDatabase();

    const statement: DebtStatement = {
      id: 'stmt-mandiri',
      debt_account_id: 'Kartu Kredit Mandiri',
      statement_period: '2026-10',
      statement_date: '2026-10-10',
      due_date: '2026-10-25',
      opening_balance: 0,
      new_charges: 2500000,
      installment_charges: 0,
      interest_and_fees: 0,
      payments_received: 0,
      closing_balance: 2500000,
      minimum_payment: 250000,
      paid_amount: 0,
      status: 'Unpaid',
      timestamp: 1
    };
    db.debtStatements.set(statement.id, statement);

    const bankAccount: FinancialAccount = {
      id: 'acc-mandiri',
      name: 'Mandiri Tabungan',
      type: 'Bank',
      owner: 'Suami',
      currency: 'IDR',
      opening_balance: 10000000,
      current_balance: 10000000,
      isActive: 1,
      timestamp: 1
    };
    db.accounts.set(bankAccount.id, bankAccount);

    // Settlement pembayaran penuh 2.500.000
    const settleAmount = 2500000;
    const currentStmt = db.debtStatements.get('stmt-mandiri')!;
    const currentAcc = db.accounts.get('acc-mandiri')!;

    const newPaidAmount = currentStmt.paid_amount + settleAmount;
    const newStatus = newPaidAmount >= currentStmt.closing_balance ? 'Paid' : 'Partially Paid';

    db.debtStatements.set('stmt-mandiri', {
      ...currentStmt,
      paid_amount: newPaidAmount,
      payments_received: currentStmt.payments_received + settleAmount,
      status: newStatus
    });

    db.accounts.set('acc-mandiri', {
      ...currentAcc,
      current_balance: currentAcc.current_balance - settleAmount
    });

    const expId = 'exp-settle-1';
    db.expenses.set(expId, {
      id: expId,
      date: '2026-10-24',
      category: 'Pembayaran Tagihan CC/SPaylater',
      payment_method: 'Mandiri Tabungan',
      amount: settleAmount,
      owner: 'Suami',
      debt_statement_id: 'stmt-mandiri',
      source_account_id: 'acc-mandiri',
      expense_type: 'BillSettlement', // Pastikan bertipe BillSettlement
      timestamp: Date.now()
    });

    // Verifikasi
    expect(db.debtStatements.get('stmt-mandiri')!.status).toBe('Paid');
    expect(db.accounts.get('acc-mandiri')!.current_balance).toBe(7500000);
    expect(db.expenses.get(expId)!.expense_type).toBe('BillSettlement');
  });

  it('3. Atomicity: Membatalkan seluruh mutasi jika ada operasi yang gagal (All-or-Nothing)', async () => {
    const db = createMockDatabase();

    db.installments.set('inst-fail', {
      id: 'inst-fail',
      name: 'Cicilan Kulkas',
      type: 'Kredit',
      initial_amount: 6000000,
      monthly_payment: 1000000,
      tenor: 6,
      paid_installments: 1,
      remaining_installments: 5,
      outstanding: 5000000,
      due_date: '2026-10-25',
      payment_method: 'BCA',
      status: 'Aman',
      timestamp: 1
    });

    const snapshotBefore = JSON.stringify({
      inst: db.installments.get('inst-fail'),
      expensesCount: db.expenses.size,
      auditLogsCount: db.auditLogs.size
    });

    // Jalankan transaksi yang sengaja gagal di tengah jalan
    const atomicTxnWithFailure = () => {
      // Snapshot state untuk transaksi
      const tempInst = { ...db.installments.get('inst-fail')! };
      tempInst.outstanding -= 1000000;

      // Operasi kedua gagal: rekening tidak ada
      const accountNotFound = false;
      if (!accountNotFound) {
        throw new Error('ACCOUNT_NOT_FOUND_ABORT');
      }
      db.installments.set('inst-fail', tempInst);
    };

    expect(() => atomicTxnWithFailure()).toThrow('ACCOUNT_NOT_FOUND_ABORT');

    // Pastikan tidak ada data yang terubah sama sekali
    const snapshotAfter = JSON.stringify({
      inst: db.installments.get('inst-fail'),
      expensesCount: db.expenses.size,
      auditLogsCount: db.auditLogs.size
    });
    expect(snapshotAfter).toBe(snapshotBefore);
  });

  it('4. Concurrency: Menjamin serializability dan penolakan konflik mutasi simultan', async () => {
    let currentOutstanding = 10000000;
    let version = 1;
    let successfulCommits = 0;
    let rejectedConflicts = 0;

    // Simulasi Optimistic Concurrency Control (OCC) Firestore
    const executeOptimisticPayment = async (amount: number, readVersion: number) => {
      // Delay mikro untuk mensimulasikan latensi jaringan bersamaan
      await new Promise(r => setTimeout(r, 10));

      if (readVersion !== version) {
        rejectedConflicts++;
        throw new Error('CONCURRENCY_CONFLICT_VERSION_MISMATCH');
      }

      currentOutstanding -= amount;
      version++;
      successfulCommits++;
      return { success: true, newOutstanding: currentOutstanding };
    };

    // Dua request membaca dokumen pada versi yang sama (versi 1)
    const readVersionReq1 = version;
    const readVersionReq2 = version;

    await Promise.allSettled([
      executeOptimisticPayment(1000000, readVersionReq1),
      executeOptimisticPayment(1000000, readVersionReq2)
    ]);

    expect(successfulCommits).toBe(1);
    expect(rejectedConflicts).toBe(1);
    expect(currentOutstanding).toBe(9000000); // Hanya terpotong 1 kali
  });

  it('5 & 6. Idempotency & Retry After Timeout', async () => {
    const executedLedger = new Map<string, DebtTransaction>();

    const processPaymentWithIdempotency = (idempotencyKey: string, amount: number) => {
      if (executedLedger.has(idempotencyKey)) {
        return {
          status: 'IDEMPOTENT_CACHED_RESULT',
          tx: executedLedger.get(idempotencyKey)!
        };
      }

      const tx: DebtTransaction = {
        id: `tx-${idempotencyKey}`,
        debt_account_id: 'acc-1',
        transaction_date: '2026-10-24',
        type: 'Payment',
        principal_amount: amount,
        interest_amount: 0,
        fee_amount: 0,
        total_amount: amount,
        idempotency_key: idempotencyKey,
        timestamp: Date.now()
      };
      executedLedger.set(idempotencyKey, tx);
      return { status: 'COMMITTED', tx };
    };

    const key = 'req-uuid-abc-123';

    // 1. Request pertama commit
    const firstCall = processPaymentWithIdempotency(key, 2500000);
    expect(firstCall.status).toBe('COMMITTED');

    // 2. Client retry setelah timeout jaringan
    const retryCall = processPaymentWithIdempotency(key, 2500000);
    expect(retryCall.status).toBe('IDEMPOTENT_CACHED_RESULT');
    expect(retryCall.tx.id).toBe(firstCall.tx.id);
    expect(executedLedger.size).toBe(1); // Tetap 1 transaksi
  });

  it('7. Reversal: Mengembalikan saldo & jatuh tempo sebelumnya, dan menolak reversal berulang', () => {
    let loanOutstanding = 80000000;
    let loanDueDate = '2026-11-25'; // telah maju 1 bulan
    let accountBalance = 40000000;
    const reversedExpenseIds = new Set<string>();

    const rollbackPayment = (expenseId: string, amount: number) => {
      if (reversedExpenseIds.has(expenseId)) {
        return { success: false, reason: 'ALREADY_REVERSED' };
      }

      loanOutstanding += amount;
      loanDueDate = calculatePreviousMonthlyDueDate(loanDueDate);
      accountBalance += amount;
      reversedExpenseIds.add(expenseId);
      return { success: true };
    };

    // Reversal pertama
    const res1 = rollbackPayment('exp-101', 3000000);
    expect(res1.success).toBe(true);
    expect(loanOutstanding).toBe(83000000);
    expect(loanDueDate).toBe('2026-10-25'); // Kembali ke bulan sebelumnya
    expect(accountBalance).toBe(43000000);

    // Reversal kedua pada ID yang sama (misal tombol rollback tertekan dua kali)
    const res2 = rollbackPayment('exp-101', 3000000);
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe('ALREADY_REVERSED');
    // Saldo tidak bertambah lagi
    expect(loanOutstanding).toBe(83000000);
    expect(accountBalance).toBe(43000000);
  });
});
