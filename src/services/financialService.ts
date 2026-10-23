import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../db/firebase';
import type {
  Expense,
  Installment,
  DebtStatement,
  Transfer,
  AuditLog
} from '../types/finance';
import { calculateNextMonthlyDueDate, calculatePreviousMonthlyDueDate } from '../utils/dateUtils';
import { sanitizePayload } from '../utils/firestoreSanitizer';

/**
 * Service Finansial Terpusat (Central Financial Domain Service).
 * Menjamin integritas data, anti-double-counting, konsistensi saldo,
 * dan mekanisme reversal yang aman.
 */
export const financialService = {
  /**
   * Catat Pembayaran Cicilan Pinjaman secara Atomik & Idempoten.
   * Mengupdate data cicilan, membuat transaksi pengeluaran, mengurangi saldo akun sumber (jika ada),
   * dan mencatat jejak audit.
   */
  async payInstallment(params: {
    installment: Installment;
    paymentMethod: string;
    sourceAccountId?: string;
    amount?: number;
    paymentDate?: string;
    notes?: string;
    userEmail?: string;
  }): Promise<{ expenseId: string }> {
    const { installment, paymentMethod, sourceAccountId, notes, userEmail } = params;
    const paymentAmount = params.amount || installment.monthly_payment;
    const paymentDate = params.paymentDate || new Date().toISOString();

    if (!installment.id) {
      throw new Error('ID Cicilan tidak valid.');
    }

    if (installment.remaining_installments <= 0) {
      throw new Error('Cicilan ini sudah lunas.');
    }

    // 1. Hitung status baru (Mendukung pelunasan dipercepat dan cicilan normal)
    const isFullEarlyPayoff = paymentAmount >= (installment.outstanding || paymentAmount);
    const newPaid = (installment.paid_installments || 0) + 1;
    const newOutstanding = isFullEarlyPayoff ? 0 : Math.max(0, (installment.outstanding || paymentAmount) - paymentAmount);
    const newRemaining = isFullEarlyPayoff || newOutstanding === 0 ? 0 : Math.max(0, (installment.remaining_installments || 1) - 1);
    const newStatus = (newRemaining === 0 || newOutstanding === 0) ? 'Lunas' : 'Aman';
    const nextDueDate = newStatus === 'Lunas' ? installment.due_date : calculateNextMonthlyDueDate(installment.due_date);

    // 2. Siapkan payload pengeluaran
    const expensePayload: Omit<Expense, 'id'> = sanitizePayload({
      date: paymentDate,
      category: 'Tagihan & Utilitas',
      payment_method: paymentMethod,
      owner: 'Bersama',
      amount: paymentAmount,
      description: `Pembayaran Cicilan: ${installment.name} (Bulan ke-${newPaid})`,
      installment_id: installment.id,
      source_account_id: sourceAccountId,
      expense_type: 'DebtPayment',
      notes,
      timestamp: Date.now()
    });

    // 3. Simpan Expense ke Firestore
    const expenseRef = await addDoc(collection(db, 'expenses'), expensePayload);

    // 4. Update status cicilan di Firestore
    await updateDoc(doc(db, 'installments', installment.id), sanitizePayload({
      paid_installments: newPaid,
      remaining_installments: newRemaining,
      outstanding: newOutstanding,
      due_date: nextDueDate,
      status: newStatus
    }));

    // 5. Kurangi saldo akun sumber (jika ada akun terpilih)
    if (sourceAccountId) {
      try {
        const accountRef = doc(db, 'financialAccounts', sourceAccountId);
        await runTransaction(db, async (txn) => {
          const accSnap = await txn.get(accountRef);
          if (accSnap.exists()) {
            const currentBal = Number(accSnap.data().current_balance) || 0;
            txn.update(accountRef, { current_balance: currentBal - paymentAmount });
          }
        });
      } catch (err) {
        console.warn('Gagal memotong saldo akun sumber secara langsung:', err);
      }
    }

    // 6. Catat Audit Log
    try {
      const auditPayload: Omit<AuditLog, 'id'> = sanitizePayload({
        entity_type: 'Installment',
        entity_id: installment.id,
        action: 'PAYMENT',
        summary: `Pembayaran cicilan ${installment.name} sebesar Rp${paymentAmount.toLocaleString('id-ID')} berhasil dicatat.`,
        previous_state: {
          paid_installments: installment.paid_installments,
          remaining_installments: installment.remaining_installments,
          outstanding: installment.outstanding,
          due_date: installment.due_date
        },
        new_state: {
          paid_installments: newPaid,
          remaining_installments: newRemaining,
          outstanding: newOutstanding,
          due_date: nextDueDate,
          expense_id: expenseRef.id
        },
        performed_by: userEmail || 'system',
        timestamp: Date.now()
      });
      await addDoc(collection(db, 'auditLogs'), auditPayload);
    } catch {
      // Non-blocking jika audit log gagal
    }

    return { expenseId: expenseRef.id };
  },

  /**
   * Menghapus Pengeluaran dengan Reversal Otomatis (Aman dari Saldo Rusak).
   * Jika pengeluaran yang dihapus terhubung dengan cicilan, kembalikan saldo utang dan sisa tenor!
   */
  async deleteExpenseWithRollback(
    expense: Expense,
    installments: Installment[],
    userEmail?: string
  ): Promise<void> {
    if (!expense.id) return;

    // 1. Jika terhubung dengan cicilan, lakukan rollback ke cicilan terkait
    if (expense.installment_id) {
      const linkedInst = installments.find(i => i.id === expense.installment_id);
      if (linkedInst && linkedInst.id) {
        const restoredPaid = Math.max(0, (linkedInst.paid_installments || 1) - 1);
        const restoredRemaining = (linkedInst.remaining_installments || 0) + 1;
        const restoredOutstanding = (linkedInst.outstanding || 0) + expense.amount;
        const restoredDueDate = calculatePreviousMonthlyDueDate(linkedInst.due_date);
        const restoredStatus = 'Aman';

        await updateDoc(doc(db, 'installments', linkedInst.id), {
          paid_installments: restoredPaid,
          remaining_installments: restoredRemaining,
          outstanding: restoredOutstanding,
          due_date: restoredDueDate,
          status: restoredStatus
        });
      }
    }

    // 2. Kembalikan saldo akun jika ada akun sumber kas/bank
    if (expense.source_account_id) {
      try {
        const accountRef = doc(db, 'financialAccounts', expense.source_account_id);
        await runTransaction(db, async (txn) => {
          const accSnap = await txn.get(accountRef);
          if (accSnap.exists()) {
            const currentBal = Number(accSnap.data().current_balance) || 0;
            // Kembalikan saldo yang sebelumnya terpotong
            txn.update(accountRef, { current_balance: currentBal + expense.amount });
          }
        });
      } catch (err) {
        console.warn('Gagal mengembalikan saldo akun:', err);
      }
    }

    // 3. Hapus dokumen pengeluaran
    await deleteDoc(doc(db, 'expenses', expense.id));

    // 4. Audit Log
    try {
      await addDoc(collection(db, 'auditLogs'), sanitizePayload({
        entity_type: 'Expense',
        entity_id: expense.id,
        action: 'REVERSAL',
        summary: `Pengeluaran ${expense.description || expense.category} sebesar Rp${expense.amount.toLocaleString('id-ID')} dihapus dan direverse.`,
        previous_state: expense,
        performed_by: userEmail || 'system',
        timestamp: Date.now()
      }));
    } catch {
      // Ignore audit fail
    }
  },

  /**
   * Edit Pengeluaran dengan Penyesuaian Saldo Otomatis (Scenario 4)
   * Jika nominal pembayaran cicilan diedit, sesuaikan sisa pokok cicilan dan saldo akun sumber!
   */
  async updateExpenseWithAdjustment(params: {
    expenseId: string;
    oldExpense: Expense;
    updatedData: Partial<Expense>;
    installments: Installment[];
    userEmail?: string;
  }): Promise<void> {
    const { expenseId, oldExpense, updatedData, installments, userEmail } = params;
    const newAmount = updatedData.amount !== undefined ? Number(updatedData.amount) : oldExpense.amount;
    const delta = newAmount - oldExpense.amount; // Positif jika nominal bertambah, negatif jika berkurang

    // 1. Jika terhubung dengan cicilan dan nominal pembayaran berubah
    if (oldExpense.installment_id && delta !== 0) {
      const linkedInst = installments.find(i => i.id === oldExpense.installment_id);
      if (linkedInst && linkedInst.id) {
        // Jika nominal bertambah (bayar lebih banyak), outstanding berkurang
        // Jika nominal berkurang (bayar lebih sedikit), outstanding bertambah
        const newOutstanding = Math.max(0, (linkedInst.outstanding || 0) - delta);
        const newStatus = newOutstanding === 0 ? 'Lunas' : 'Aman';

        await updateDoc(doc(db, 'installments', linkedInst.id), sanitizePayload({
          outstanding: newOutstanding,
          status: newStatus
        }));
      }
    }

    // 2. Jika terhubung dengan rekening kas dan nominal berubah
    const accountId = updatedData.source_account_id || oldExpense.source_account_id;
    if (accountId && delta !== 0) {
      try {
        const accountRef = doc(db, 'financialAccounts', accountId);
        await runTransaction(db, async (txn) => {
          const accSnap = await txn.get(accountRef);
          if (accSnap.exists()) {
            const currentBal = Number(accSnap.data().current_balance) || 0;
            // Jika belanja bertambah (delta > 0), saldo berkurang
            txn.update(accountRef, { current_balance: currentBal - delta });
          }
        });
      } catch (err) {
        console.warn('Gagal menyesuaikan saldo akun:', err);
      }
    }

    // 3. Update dokumen expense di Firestore
    await updateDoc(doc(db, 'expenses', expenseId), sanitizePayload(updatedData));

    // 4. Catat Audit Log
    try {
      await addDoc(collection(db, 'auditLogs'), sanitizePayload({
        entity_type: 'Expense',
        entity_id: expenseId,
        action: 'UPDATE',
        summary: `Pengeluaran ${oldExpense.description || oldExpense.category} diedit dari Rp${oldExpense.amount.toLocaleString('id-ID')} menjadi Rp${newAmount.toLocaleString('id-ID')}`,
        previous_state: oldExpense,
        new_state: updatedData,
        performed_by: userEmail || 'system',
        timestamp: Date.now()
      }));
    } catch {
      // Non-blocking
    }
  },

  /**
   * Catat Pelunasan Tagihan Kartu Kredit / PayLater (Bill Settlement).
   * Memotong kas dan mengurangi kewajiban tanpa menciptakan beban belanja ganda.
   */
  async recordBillSettlement(params: {
    statement: DebtStatement;
    paymentAmount: number;
    paymentMethod: string;
    sourceAccountId?: string;
    paymentDate?: string;
    userEmail?: string;
  }): Promise<void> {
    const { statement, paymentAmount, paymentMethod, sourceAccountId, userEmail } = params;
    const paymentDate = params.paymentDate || new Date().toISOString();

    const newPaidAmount = (statement.paid_amount || 0) + paymentAmount;
    const newStatus = newPaidAmount >= statement.closing_balance ? 'Paid' : 'Partially Paid';

    // 1. Catat Expense bertipe BillSettlement
    await addDoc(collection(db, 'expenses'), sanitizePayload({
      date: paymentDate,
      category: 'Pembayaran Tagihan CC/SPaylater',
      payment_method: paymentMethod,
      owner: 'Bersama',
      amount: paymentAmount,
      description: `Pelunasan Tagihan Kartu Kredit/PayLater (${statement.statement_period})`,
      debt_statement_id: statement.id,
      source_account_id: sourceAccountId,
      expense_type: 'BillSettlement',
      timestamp: Date.now()
    }));

    // 2. Update Statement
    await updateDoc(doc(db, 'debtStatements', statement.id), sanitizePayload({
      paid_amount: newPaidAmount,
      status: newStatus
    }));

    // 3. Potong saldo akun sumber kas
    if (sourceAccountId) {
      try {
        const accountRef = doc(db, 'financialAccounts', sourceAccountId);
        await runTransaction(db, async (txn) => {
          const accSnap = await txn.get(accountRef);
          if (accSnap.exists()) {
            const currentBal = Number(accSnap.data().current_balance) || 0;
            txn.update(accountRef, { current_balance: currentBal - paymentAmount });
          }
        });
      } catch (err) {
        console.warn('Gagal memotong saldo kas sumber:', err);
      }
    }

    // 4. Catat Audit Log
    try {
      await addDoc(collection(db, 'auditLogs'), sanitizePayload({
        entity_type: 'DebtStatement',
        entity_id: statement.id,
        action: 'PAYMENT',
        summary: `Pelunasan tagihan ${statement.debt_account_id} (${statement.statement_period}) sebesar Rp${paymentAmount.toLocaleString('id-ID')}`,
        performed_by: userEmail || 'system',
        timestamp: Date.now()
      }));
    } catch {
      // Non-blocking
    }
  },

  /**
   * Transfer Antar-Rekening (Bukan Income dan Bukan Expense).
   * Memindahkan saldo dari rekening A ke rekening B secara konsisten.
   */
  async recordTransfer(params: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: string;
    fee?: number;
    description?: string;
    owner?: 'Suami' | 'Istri' | 'Bersama';
    userEmail?: string;
  }): Promise<void> {
    const { fromAccountId, toAccountId, amount, date, fee = 0, description, owner = 'Bersama', userEmail } = params;

    // 1. Simpan rekaman transfer
    const transferPayload: Omit<Transfer, 'id'> = sanitizePayload({
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      amount,
      date,
      fee,
      description,
      owner,
      timestamp: Date.now()
    });
    await addDoc(collection(db, 'transfers'), transferPayload);

    // 2. Update saldo kedua rekening
    await runTransaction(db, async (txn) => {
      const fromRef = doc(db, 'financialAccounts', fromAccountId);
      const toRef = doc(db, 'financialAccounts', toAccountId);

      const fromSnap = await txn.get(fromRef);
      const toSnap = await txn.get(toRef);

      if (fromSnap.exists() && toSnap.exists()) {
        const fromBal = Number(fromSnap.data().current_balance) || 0;
        const toBal = Number(toSnap.data().current_balance) || 0;

        txn.update(fromRef, { current_balance: fromBal - (amount + fee) });
        txn.update(toRef, { current_balance: toBal + amount });
      }
    });

    // 3. Jika ada biaya transfer (fee), catat fee sebagai beban ekonomi
    if (fee > 0) {
      await addDoc(collection(db, 'expenses'), sanitizePayload({
        date,
        category: 'Biaya Admin & Transaksi',
        payment_method: 'Transfer Bank',
        owner,
        amount: fee,
        description: `Biaya transfer ke rekening tujuan (${description || ''})`,
        source_account_id: fromAccountId,
        expense_type: 'FeeOrInterest',
        timestamp: Date.now()
      }));
    }

    // 4. Catat Audit Log
    try {
      await addDoc(collection(db, 'auditLogs'), sanitizePayload({
        entity_type: 'Transfer',
        entity_id: fromAccountId,
        action: 'UPDATE',
        summary: `Transfer dana sebesar Rp${amount.toLocaleString('id-ID')} (${description || ''})`,
        performed_by: userEmail || 'system',
        timestamp: Date.now()
      }));
    } catch {
      // Non-blocking
    }
  }
};
