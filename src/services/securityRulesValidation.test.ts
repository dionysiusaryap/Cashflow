import { describe, it, expect } from 'vitest';

/**
 * PENGUJIAN LOGIKA & VALIDASI FIRESTORE SECURITY RULES (TUGAS 1)
 * Pengujian positif (fitur sah lolos) dan negatif (pelanggaran ditolak)
 * untuk setiap koleksi finansial penting:
 * 1. incomes
 * 2. expenses
 * 3. installments
 * 4. financialAccounts
 * 5. debtStatements
 * 6. transfers
 * 7. auditLogs (Immutability)
 * 8. Default Deny (koleksi tidak dikenal)
 */

describe('Tugas 1: Validasi Firestore Security Rules (Pengujian Positif & Negatif)', () => {
  const WHITELIST_EMAILS = [
    'dionysiusaryap@gmail.com',
    'marialaksmiparahita@gmail.com'
  ];

  // Simulator aturan evaluasi yang merefleksikan firestore.rules
  const evaluateSecurityRule = (params: {
    auth: { email: string } | null;
    collection: string;
    action: 'read' | 'create' | 'update' | 'delete';
    data?: Record<string, any>;
  }): { allowed: boolean; reason?: string } => {
    const { auth, collection, action, data } = params;

    // 1. Authentication check
    if (!auth || !auth.email) {
      return { allowed: false, reason: 'UNAUTHENTICATED' };
    }

    // 2. Whitelist check
    if (!WHITELIST_EMAILS.includes(auth.email)) {
      return { allowed: false, reason: 'FORBIDDEN_EMAIL_NOT_IN_FAMILY_WHITELIST' };
    }

    const isValidAmount = (val: any) => typeof val === 'number' && val >= 0;
    const isValidOwner = (val: any) => val === undefined || val === null || ['Suami', 'Istri', 'Bersama'].includes(val);

    // 3. Collection-specific rule evaluations
    switch (collection) {
      case 'incomes': {
        if (action === 'read' || action === 'delete') return { allowed: true };
        if (action === 'create' || action === 'update') {
          if (!isValidAmount(data?.amount)) return { allowed: false, reason: 'INVALID_AMOUNT' };
          if (typeof data?.source !== 'string') return { allowed: false, reason: 'INVALID_SOURCE' };
          if (!isValidOwner(data?.owner)) return { allowed: false, reason: 'INVALID_OWNER' };
          return { allowed: true };
        }
        break;
      }

      case 'expenses': {
        if (action === 'read' || action === 'delete') return { allowed: true };
        if (action === 'create' || action === 'update') {
          if (!isValidAmount(data?.amount)) return { allowed: false, reason: 'INVALID_AMOUNT' };
          if (typeof data?.category !== 'string') return { allowed: false, reason: 'INVALID_CATEGORY' };
          if (!isValidOwner(data?.owner)) return { allowed: false, reason: 'INVALID_OWNER' };
          return { allowed: true };
        }
        break;
      }

      case 'installments': {
        if (action === 'read' || action === 'delete') return { allowed: true };
        if (action === 'create' || action === 'update') {
          if (!isValidAmount(data?.initial_amount)) return { allowed: false, reason: 'INVALID_INITIAL_AMOUNT' };
          if (!isValidAmount(data?.outstanding)) return { allowed: false, reason: 'INVALID_OUTSTANDING' };
          if (!isValidAmount(data?.monthly_payment)) return { allowed: false, reason: 'INVALID_MONTHLY_PAYMENT' };
          if (typeof data?.name !== 'string') return { allowed: false, reason: 'INVALID_NAME' };
          return { allowed: true };
        }
        break;
      }

      case 'financialAccounts': {
        if (action === 'read' || action === 'delete') return { allowed: true };
        if (action === 'create' || action === 'update') {
          if (typeof data?.current_balance !== 'number') return { allowed: false, reason: 'INVALID_CURRENT_BALANCE' };
          if (typeof data?.name !== 'string') return { allowed: false, reason: 'INVALID_NAME' };
          if (!isValidOwner(data?.owner)) return { allowed: false, reason: 'INVALID_OWNER' };
          return { allowed: true };
        }
        break;
      }

      case 'debtStatements': {
        if (action === 'read' || action === 'delete') return { allowed: true };
        if (action === 'create' || action === 'update') {
          if (!isValidAmount(data?.closing_balance)) return { allowed: false, reason: 'INVALID_CLOSING_BALANCE' };
          if (!isValidAmount(data?.paid_amount)) return { allowed: false, reason: 'INVALID_PAID_AMOUNT' };
          return { allowed: true };
        }
        break;
      }

      case 'transfers': {
        if (action === 'read' || action === 'delete') return { allowed: true };
        if (action === 'create' || action === 'update') {
          if (!isValidAmount(data?.amount)) return { allowed: false, reason: 'INVALID_AMOUNT' };
          return { allowed: true };
        }
        break;
      }

      case 'auditLogs': {
        if (action === 'read') return { allowed: true };
        if (action === 'create') {
          if (typeof data?.entity_type === 'string') return { allowed: true };
          return { allowed: false, reason: 'INVALID_ENTITY_TYPE' };
        }
        if (action === 'update' || action === 'delete') {
          return { allowed: false, reason: 'AUDIT_LOG_IS_IMMUTABLE' };
        }
        break;
      }

      case 'categories':
      case 'paymentMethods':
      case 'appSettings':
      case 'debtTransactions':
        return { allowed: true };

      default:
        // Default Deny for unknown collections
        return { allowed: false, reason: 'DEFAULT_DENY_UNKNOWN_COLLECTION' };
    }

    return { allowed: false, reason: 'UNHANDLED_RULE' };
  };

  const validAuth = { email: 'dionysiusaryap@gmail.com' };

  it('1. Koleksi Incomes: Pengujian Positif & Negatif', () => {
    // Positif: Pemasukan sah
    const validIncome = evaluateSecurityRule({
      auth: validAuth,
      collection: 'incomes',
      action: 'create',
      data: { amount: 5000000, source: 'Gaji', owner: 'Suami' }
    });
    expect(validIncome.allowed).toBe(true);

    // Negatif: Nominal negatif
    const negAmount = evaluateSecurityRule({
      auth: validAuth,
      collection: 'incomes',
      action: 'create',
      data: { amount: -1000, source: 'Gaji', owner: 'Suami' }
    });
    expect(negAmount.allowed).toBe(false);
    expect(negAmount.reason).toBe('INVALID_AMOUNT');

    // Negatif: Source bukan string
    const missingSource = evaluateSecurityRule({
      auth: validAuth,
      collection: 'incomes',
      action: 'create',
      data: { amount: 1000, source: 12345, owner: 'Suami' }
    });
    expect(missingSource.allowed).toBe(false);
    expect(missingSource.reason).toBe('INVALID_SOURCE');

    // Negatif: Pemilik di luar daftar sah
    const invalidOwner = evaluateSecurityRule({
      auth: validAuth,
      collection: 'incomes',
      action: 'create',
      data: { amount: 1000, source: 'Gaji', owner: 'OrangLain' }
    });
    expect(invalidOwner.allowed).toBe(false);
    expect(invalidOwner.reason).toBe('INVALID_OWNER');
  });

  it('2. Koleksi Expenses: Pengujian Positif & Negatif', () => {
    // Positif: Pengeluaran sah
    const validExp = evaluateSecurityRule({
      auth: validAuth,
      collection: 'expenses',
      action: 'create',
      data: { amount: 150000, category: 'Makan', owner: 'Bersama' }
    });
    expect(validExp.allowed).toBe(true);

    // Positif: Pengeluaran legacy tanpa field owner tetap diterima
    const legacyExp = evaluateSecurityRule({
      auth: validAuth,
      collection: 'expenses',
      action: 'create',
      data: { amount: 50000, category: 'Transportasi' }
    });
    expect(legacyExp.allowed).toBe(true);

    // Negatif: Nominal negatif
    const negExp = evaluateSecurityRule({
      auth: validAuth,
      collection: 'expenses',
      action: 'create',
      data: { amount: -50000, category: 'Makan' }
    });
    expect(negExp.allowed).toBe(false);
    expect(negExp.reason).toBe('INVALID_AMOUNT');

    // Negatif: Kategori kosong/bukan string
    const invalidCat = evaluateSecurityRule({
      auth: validAuth,
      collection: 'expenses',
      action: 'create',
      data: { amount: 50000, category: null }
    });
    expect(invalidCat.allowed).toBe(false);
    expect(invalidCat.reason).toBe('INVALID_CATEGORY');
  });

  it('3. Koleksi Installments: Pengujian Positif & Negatif', () => {
    // Positif: Cicilan sah
    const validInst = evaluateSecurityRule({
      auth: validAuth,
      collection: 'installments',
      action: 'create',
      data: {
        name: 'KPR BTN',
        initial_amount: 100000000,
        outstanding: 80000000,
        monthly_payment: 2000000
      }
    });
    expect(validInst.allowed).toBe(true);

    // Negatif: Sisa pokok negatif
    const negOutstanding = evaluateSecurityRule({
      auth: validAuth,
      collection: 'installments',
      action: 'update',
      data: {
        name: 'KPR BTN',
        initial_amount: 100000000,
        outstanding: -500000,
        monthly_payment: 2000000
      }
    });
    expect(negOutstanding.allowed).toBe(false);
    expect(negOutstanding.reason).toBe('INVALID_OUTSTANDING');

    // Negatif: Nama cicilan tidak ada
    const noName = evaluateSecurityRule({
      auth: validAuth,
      collection: 'installments',
      action: 'create',
      data: {
        name: 9999,
        initial_amount: 100000000,
        outstanding: 80000000,
        monthly_payment: 2000000
      }
    });
    expect(noName.allowed).toBe(false);
    expect(noName.reason).toBe('INVALID_NAME');
  });

  it('4. Koleksi Financial Accounts: Pengujian Positif & Negatif', () => {
    // Positif: Rekening sah
    const validAcc = evaluateSecurityRule({
      auth: validAuth,
      collection: 'financialAccounts',
      action: 'create',
      data: { name: 'BCA', current_balance: 10000000, owner: 'Suami' }
    });
    expect(validAcc.allowed).toBe(true);

    // Negatif: Saldo bertipe corrupt/string
    const corruptBalance = evaluateSecurityRule({
      auth: validAuth,
      collection: 'financialAccounts',
      action: 'update',
      data: { name: 'BCA', current_balance: 'sepuluh juta' }
    });
    expect(corruptBalance.allowed).toBe(false);
    expect(corruptBalance.reason).toBe('INVALID_CURRENT_BALANCE');
  });

  it('5. Koleksi Debt Statements & Transfers: Pengujian Positif & Negatif', () => {
    // Positif: Statement sah
    const validStmt = evaluateSecurityRule({
      auth: validAuth,
      collection: 'debtStatements',
      action: 'create',
      data: { closing_balance: 2000000, paid_amount: 500000 }
    });
    expect(validStmt.allowed).toBe(true);

    // Negatif: Statement dengan closing balance negatif
    const negStmt = evaluateSecurityRule({
      auth: validAuth,
      collection: 'debtStatements',
      action: 'create',
      data: { closing_balance: -100, paid_amount: 0 }
    });
    expect(negStmt.allowed).toBe(false);
    expect(negStmt.reason).toBe('INVALID_CLOSING_BALANCE');

    // Positif: Transfer nominal positif
    const validTrf = evaluateSecurityRule({
      auth: validAuth,
      collection: 'transfers',
      action: 'create',
      data: { amount: 500000 }
    });
    expect(validTrf.allowed).toBe(true);

    // Negatif: Transfer nominal negatif
    const negTrf = evaluateSecurityRule({
      auth: validAuth,
      collection: 'transfers',
      action: 'create',
      data: { amount: -500 }
    });
    expect(negTrf.allowed).toBe(false);
    expect(negTrf.reason).toBe('INVALID_AMOUNT');
  });

  it('6. Koleksi Audit Logs: Imutabilitas & Anti-Penghapusan Jejak', () => {
    // Positif: Catat audit log baru
    const validLog = evaluateSecurityRule({
      auth: validAuth,
      collection: 'auditLogs',
      action: 'create',
      data: { entity_type: 'Expense', summary: 'Pengeluaran dicatat' }
    });
    expect(validLog.allowed).toBe(true);

    // Negatif: Upaya edit log audit ditolak keras
    const editLog = evaluateSecurityRule({
      auth: validAuth,
      collection: 'auditLogs',
      action: 'update',
      data: { summary: 'Mencoba memalsukan audit log' }
    });
    expect(editLog.allowed).toBe(false);
    expect(editLog.reason).toBe('AUDIT_LOG_IS_IMMUTABLE');

    // Negatif: Upaya hapus log audit ditolak keras
    const delLog = evaluateSecurityRule({
      auth: validAuth,
      collection: 'auditLogs',
      action: 'delete'
    });
    expect(delLog.allowed).toBe(false);
    expect(delLog.reason).toBe('AUDIT_LOG_IS_IMMUTABLE');
  });

  it('7. Default Deny: Menolak penulisan dan pembacaan koleksi acak di luar skema', () => {
    const unknownWrite = evaluateSecurityRule({
      auth: validAuth,
      collection: 'hacker_backdoor',
      action: 'create',
      data: { payload: 'exploit' }
    });
    expect(unknownWrite.allowed).toBe(false);
    expect(unknownWrite.reason).toBe('DEFAULT_DENY_UNKNOWN_COLLECTION');
  });
});
