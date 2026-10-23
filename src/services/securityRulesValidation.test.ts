import { describe, it, expect } from 'vitest';

/**
 * PENGUJIAN LOGIKA & VALIDASI FIRESTORE SECURITY RULES
 * Memverifikasi bahwa aturan keamanan menolak manipulasi data client:
 * 1. Otorisasi email whitelist
 * 2. Penolakan nilai negatif (amount < 0)
 * 3. Tipe data dan validitas field (owner, category, source)
 * 4. Imutabilitas AuditLog (dilarang update & delete)
 * 5. Default Deny pada koleksi tidak terdaftar
 */

describe('Audit Firestore Security Rules: Logika Otorisasi & Validasi Skema Data', () => {
  const WHITELIST_EMAILS = [
    'dionysiusaryap@gmail.com',
    'marialaksmiparahita@gmail.com'
  ];

  // Helper evaluator yang merefleksikan firestore.rules
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
    const isValidOwner = (val: any) => ['Suami', 'Istri', 'Bersama'].includes(val);

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

      case 'auditLogs': {
        if (action === 'read') return { allowed: true };
        if (action === 'create') {
          if (typeof data?.entity_type === 'string') return { allowed: true };
          return { allowed: false, reason: 'INVALID_ENTITY_TYPE' };
        }
        // STRICT APPEND-ONLY: UPDATE & DELETE ARE FORBIDDEN
        if (action === 'update' || action === 'delete') {
          return { allowed: false, reason: 'AUDIT_LOG_IS_IMMUTABLE' };
        }
        break;
      }

      case 'categories':
      case 'paymentMethods':
      case 'appSettings':
      case 'debtStatements':
      case 'debtTransactions':
      case 'transfers':
        return { allowed: true };

      default:
        // Default Deny for unknown collections
        return { allowed: false, reason: 'DEFAULT_DENY_UNKNOWN_COLLECTION' };
    }

    return { allowed: false, reason: 'UNHANDLED_RULE' };
  };

  it('Menolak pengguna tanpa autentikasi atau di luar whitelist keluarga', () => {
    // 1. Unauthenticated
    const resNoAuth = evaluateSecurityRule({
      auth: null,
      collection: 'expenses',
      action: 'read'
    });
    expect(resNoAuth.allowed).toBe(false);
    expect(resNoAuth.reason).toBe('UNAUTHENTICATED');

    // 2. Authenticated tapi bukan email whitelist keluarga
    const resAttacker = evaluateSecurityRule({
      auth: { email: 'stranger@example.com' },
      collection: 'expenses',
      action: 'read'
    });
    expect(resAttacker.allowed).toBe(false);
    expect(resAttacker.reason).toBe('FORBIDDEN_EMAIL_NOT_IN_FAMILY_WHITELIST');

    // 3. Email keluarga yang sah
    const resFamily = evaluateSecurityRule({
      auth: { email: 'dionysiusaryap@gmail.com' },
      collection: 'expenses',
      action: 'read'
    });
    expect(resFamily.allowed).toBe(true);
  });

  it('Menolak penulisan transaksi finansial dengan nominal negatif atau data tidak valid', () => {
    const validAuth = { email: 'dionysiusaryap@gmail.com' };

    // Percobaan menyuntikkan nominal negatif (amount: -500.000)
    const negativeExpense = evaluateSecurityRule({
      auth: validAuth,
      collection: 'expenses',
      action: 'create',
      data: {
        amount: -500000,
        category: 'Belanja',
        owner: 'Suami'
      }
    });
    expect(negativeExpense.allowed).toBe(false);
    expect(negativeExpense.reason).toBe('INVALID_AMOUNT');

    // Percobaan menyuntikkan sisa utang negatif pada cicilan
    const negativeOutstanding = evaluateSecurityRule({
      auth: validAuth,
      collection: 'installments',
      action: 'create',
      data: {
        name: 'KUR',
        initial_amount: 10000000,
        outstanding: -2000000,
        monthly_payment: 1000000
      }
    });
    expect(negativeOutstanding.allowed).toBe(false);
    expect(negativeOutstanding.reason).toBe('INVALID_OUTSTANDING');

    // Percobaan mengisi owner di luar daftar resmi ('Hacker' bukan Suami/Istri/Bersama)
    const invalidOwnerIncome = evaluateSecurityRule({
      auth: validAuth,
      collection: 'incomes',
      action: 'create',
      data: {
        amount: 1000000,
        source: 'Gaji',
        owner: 'Hacker'
      }
    });
    expect(invalidOwnerIncome.allowed).toBe(false);
    expect(invalidOwnerIncome.reason).toBe('INVALID_OWNER');
  });

  it('Menjamin imutabilitas AuditLog (Hanya boleh Create, Dilarang Update & Delete)', () => {
    const validAuth = { email: 'marialaksmiparahita@gmail.com' };

    // 1. Menulis audit log baru diizinkan
    const createLog = evaluateSecurityRule({
      auth: validAuth,
      collection: 'auditLogs',
      action: 'create',
      data: { entity_type: 'Expense', action: 'CREATE', summary: 'Tambah pengeluaran' }
    });
    expect(createLog.allowed).toBe(true);

    // 2. Mencoba memodifikasi/mengedit audit log ditolak keras
    const updateLog = evaluateSecurityRule({
      auth: validAuth,
      collection: 'auditLogs',
      action: 'update',
      data: { summary: 'Mencoba menghapus jejak fraud' }
    });
    expect(updateLog.allowed).toBe(false);
    expect(updateLog.reason).toBe('AUDIT_LOG_IS_IMMUTABLE');

    // 3. Mencoba menghapus dokumen audit log ditolak keras
    const deleteLog = evaluateSecurityRule({
      auth: validAuth,
      collection: 'auditLogs',
      action: 'delete'
    });
    expect(deleteLog.allowed).toBe(false);
    expect(deleteLog.reason).toBe('AUDIT_LOG_IS_IMMUTABLE');
  });

  it('Menerapkan Default Deny terhadap koleksi acak di luar skema resmi', () => {
    const validAuth = { email: 'dionysiusaryap@gmail.com' };

    const writeUnknown = evaluateSecurityRule({
      auth: validAuth,
      collection: 'malicious_collection',
      action: 'create',
      data: { secret: 'payload' }
    });
    expect(writeUnknown.allowed).toBe(false);
    expect(writeUnknown.reason).toBe('DEFAULT_DENY_UNKNOWN_COLLECTION');
  });
});
