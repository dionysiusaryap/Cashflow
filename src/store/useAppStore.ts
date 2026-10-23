import { create } from 'zustand';
import { calculateFinancialSummary } from '../utils/financeCalculations';
import { getFinancialPeriod } from '../utils/dateUtils';
import { db, auth } from '../db/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  doc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import type {
  Income,
  Expense,
  Installment,
  Category,
  PaymentMethod,
  AppSettings,
  FinancialAccount,
  DebtStatement,
  Transfer,
  AuditLog
} from '../types/finance';
import { financialService } from '../services/financialService';
import { sanitizePayload } from '../utils/firestoreSanitizer';

// Re-export types untuk backward-compatibility dengan komponen yang sudah ada
export type {
  Income,
  Expense,
  Installment,
  Category,
  PaymentMethod,
  AppSettings,
  FinancialAccount,
  DebtStatement,
  Transfer,
  AuditLog
};

interface AppState {
  user: User | null;
  authLoaded: boolean;
  
  // Koleksi Data
  incomes: Income[];
  expenses: Expense[];
  installments: Installment[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  appSettings: AppSettings | null;
  financialAccounts: FinancialAccount[];
  debtStatements: DebtStatement[];
  transfers: Transfer[];
  auditLogs: AuditLog[];
  
  // Metrik Finansial Konsolidasi
  totalIncome: number;
  economicExpense: number;
  cashInflow: number;
  cashOutflow: number;
  netCashflow: number;
  economicSurplus: number;
  savingRate: number;
  totalMonthlyInstallment: number;
  totalDebtObligation: number;
  totalOutstanding: number;
  availableLiquidCash: number;
  
  // Metrik Legacy untuk kompatibilitas tampilan lama
  dailyExpenseTotal: number;
  installmentPaymentTotal: number;
  totalActualExpense: number;
  cashFlow: number;
  debtRatio: number;
  
  // Actions
  initializeFirebaseListeners: () => void;
  
  addIncome: (income: Omit<Income, 'id'>) => Promise<string>;
  updateIncome: (id: string, income: Partial<Income>) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<string>;
  deleteExpense: (id: string) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<void>;
  
  addInstallment: (installment: Omit<Installment, 'id'>) => Promise<string>;
  deleteInstallment: (id: string) => Promise<void>;
  updateInstallment: (id: string, installment: Partial<Installment>) => Promise<void>;
  
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, category: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  
  addPaymentMethod: (pm: Omit<PaymentMethod, 'id'>) => Promise<void>;
  updatePaymentMethod: (id: string, pm: Partial<PaymentMethod>) => Promise<void>;
  deletePaymentMethod: (id: string) => Promise<void>;
  
  updateSettings: (id: string, settings: Partial<AppSettings>) => Promise<void>;

  // Aksi Akun Keuangan & Tagihan
  addFinancialAccount: (acc: Omit<FinancialAccount, 'id'>) => Promise<string>;
  updateFinancialAccount: (id: string, acc: Partial<FinancialAccount>) => Promise<void>;
  deleteFinancialAccount: (id: string) => Promise<void>;

  addDebtStatement: (stmt: Omit<DebtStatement, 'id'>) => Promise<void>;
  updateDebtStatement: (id: string, stmt: Partial<DebtStatement>) => Promise<void>;
  deleteDebtStatement: (id: string) => Promise<void>;

  // Aksi Domain Terpusat
  payInstallment: (installment: Installment, paymentMethod: string, sourceAccountId?: string, amount?: number, notes?: string) => Promise<void>;
  deleteExpenseWithReversal: (expense: Expense) => Promise<void>;
  updateExpenseWithAdjustment: (id: string, oldExpense: Expense, updatedData: Partial<Expense>) => Promise<void>;
  payDebtStatement: (statement: DebtStatement, paymentAmount: number, paymentMethod: string, sourceAccountId?: string) => Promise<void>;
  transferFunds: (params: { fromAccountId: string; toAccountId: string; amount: number; date: string; fee?: number; description?: string }) => Promise<void>;
}

let unsubscribers: (() => void)[] = [];

export const useAppStore = create<AppState>((set, get) => {
  
  // Helper untuk menghitung ulang metrik setiap kali data berubah
  const recalcSummary = (
    incomes: Income[],
    expenses: Expense[],
    installments: Installment[],
    accounts: FinancialAccount[],
    statements: DebtStatement[]
  ) => {
    const currentMonthStr = getFinancialPeriod(new Date());
    const summary = calculateFinancialSummary(incomes, expenses, installments, currentMonthStr, {
      accounts,
      statements
    });

    set({
      totalIncome: summary.totalIncome,
      economicExpense: summary.economicExpense,
      cashInflow: summary.cashInflow,
      cashOutflow: summary.cashOutflow,
      netCashflow: summary.netCashflow,
      economicSurplus: summary.economicSurplus,
      savingRate: summary.savingRate,
      totalMonthlyInstallment: summary.loanInstallmentObligation,
      totalDebtObligation: summary.totalDebtObligation,
      totalOutstanding: summary.totalOutstandingDebt,
      availableLiquidCash: summary.availableLiquidCash,

      // Legacy aliases
      dailyExpenseTotal: summary.dailyExpenseTotal,
      installmentPaymentTotal: summary.installmentPaymentTotal,
      totalActualExpense: summary.totalActualExpense,
      cashFlow: summary.cashFlow,
      debtRatio: summary.debtRatio
    });
  };

  return {
    user: null,
    authLoaded: false,
    
    incomes: [],
    expenses: [],
    installments: [],
    categories: [],
    paymentMethods: [],
    appSettings: null,
    financialAccounts: [],
    debtStatements: [],
    transfers: [],
    auditLogs: [],
    
    totalIncome: 0,
    economicExpense: 0,
    cashInflow: 0,
    cashOutflow: 0,
    netCashflow: 0,
    economicSurplus: 0,
    savingRate: 0,
    totalMonthlyInstallment: 0,
    totalDebtObligation: 0,
    totalOutstanding: 0,
    availableLiquidCash: 0,

    dailyExpenseTotal: 0,
    installmentPaymentTotal: 0,
    totalActualExpense: 0,
    cashFlow: 0,
    debtRatio: 0,

    addIncome: async (income) => {
      const clean = sanitizePayload(income);
      const ref = await addDoc(collection(db, 'incomes'), clean);
      return ref.id;
    },
    updateIncome: async (id, income) => { 
      await updateDoc(doc(db, 'incomes', id), sanitizePayload(income)); 
    },
    deleteIncome: async (id) => { await deleteDoc(doc(db, 'incomes', id)); },
    
    addExpense: async (expense) => {
      const clean = sanitizePayload(expense);
      const ref = await addDoc(collection(db, 'expenses'), clean);
      return ref.id;
    },
    deleteExpense: async (id) => { await deleteDoc(doc(db, 'expenses', id)); },
    updateExpense: async (id, expense) => { 
      await updateDoc(doc(db, 'expenses', id), sanitizePayload(expense)); 
    },
    
    addInstallment: async (inst) => {
      const clean = sanitizePayload(inst);
      const ref = await addDoc(collection(db, 'installments'), clean);
      return ref.id;
    },
    deleteInstallment: async (id) => { await deleteDoc(doc(db, 'installments', id)); },
    updateInstallment: async (id, inst) => { 
      await updateDoc(doc(db, 'installments', id), sanitizePayload(inst)); 
    },
    
    addCategory: async (category) => { await addDoc(collection(db, 'categories'), sanitizePayload(category)); },
    updateCategory: async (id, category) => { await updateDoc(doc(db, 'categories', id), sanitizePayload(category)); },
    deleteCategory: async (id) => { await deleteDoc(doc(db, 'categories', id)); },
    
    addPaymentMethod: async (pm) => { await addDoc(collection(db, 'paymentMethods'), sanitizePayload(pm)); },
    updatePaymentMethod: async (id, pm) => { await updateDoc(doc(db, 'paymentMethods', id), sanitizePayload(pm)); },
    deletePaymentMethod: async (id) => { await deleteDoc(doc(db, 'paymentMethods', id)); },
    
    updateSettings: async (id, settings) => { await updateDoc(doc(db, 'appSettings', id), sanitizePayload(settings)); },

    addFinancialAccount: async (acc) => {
      const clean = sanitizePayload(acc);
      const ref = await addDoc(collection(db, 'financialAccounts'), clean);
      set((state) => {
        const newAcc = { ...clean, id: ref.id } as FinancialAccount;
        const updated = [...state.financialAccounts.filter(a => a.id !== ref.id), newAcc];
        recalcSummary(state.incomes, state.expenses, state.installments, updated, state.debtStatements);
        return { financialAccounts: updated };
      });
      return ref.id;
    },
    updateFinancialAccount: async (id, acc) => {
      const clean = sanitizePayload(acc);
      set((state) => {
        const updated = state.financialAccounts.map((a) => (a.id === id ? { ...a, ...clean } : a));
        recalcSummary(state.incomes, state.expenses, state.installments, updated, state.debtStatements);
        return { financialAccounts: updated };
      });
      await updateDoc(doc(db, 'financialAccounts', id), clean);
    },
    deleteFinancialAccount: async (id) => {
      set((state) => {
        const updated = state.financialAccounts.filter((a) => a.id !== id);
        recalcSummary(state.incomes, state.expenses, state.installments, updated, state.debtStatements);
        return { financialAccounts: updated };
      });
      await deleteDoc(doc(db, 'financialAccounts', id));
    },

    addDebtStatement: async (stmt) => { await addDoc(collection(db, 'debtStatements'), sanitizePayload(stmt)); },
    updateDebtStatement: async (id, stmt) => { await updateDoc(doc(db, 'debtStatements', id), sanitizePayload(stmt)); },
    deleteDebtStatement: async (id) => { await deleteDoc(doc(db, 'debtStatements', id)); },

    // Aksi Terpusat dengan Perlindungan Reversal
    payInstallment: async (installment, paymentMethod, sourceAccountId, amount, notes) => {
      await financialService.payInstallment({
        installment,
        paymentMethod,
        sourceAccountId,
        amount,
        notes,
        userEmail: get().user?.email || undefined
      });
    },

    deleteExpenseWithReversal: async (expense) => {
      await financialService.deleteExpenseWithRollback(
        expense,
        get().installments,
        get().user?.email || undefined
      );
    },

    updateExpenseWithAdjustment: async (id, oldExpense, updatedData) => {
      await financialService.updateExpenseWithAdjustment({
        expenseId: id,
        oldExpense,
        updatedData,
        installments: get().installments,
        userEmail: get().user?.email || undefined
      });
    },

    payDebtStatement: async (statement, paymentAmount, paymentMethod, sourceAccountId) => {
      await financialService.recordBillSettlement({
        statement,
        paymentAmount,
        paymentMethod,
        sourceAccountId,
        userEmail: get().user?.email || undefined
      });
    },

    transferFunds: async (params) => {
      await financialService.recordTransfer({
        ...params,
        userEmail: get().user?.email || undefined
      });
    },

    initializeFirebaseListeners: () => {
      unsubscribers.forEach(unsub => unsub());
      unsubscribers = [];

      // 1. Incomes
      const unsubIncomes = onSnapshot(collection(db, 'incomes'), (snapshot) => {
        const incomes = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Income));
        set({ incomes });
        recalcSummary(incomes, get().expenses, get().installments, get().financialAccounts, get().debtStatements);
      });
      
      // 2. Expenses
      const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
        const expenses = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Expense));
        set({ expenses });
        recalcSummary(get().incomes, expenses, get().installments, get().financialAccounts, get().debtStatements);
      });
      
      // 3. Installments
      const unsubInstallments = onSnapshot(collection(db, 'installments'), (snapshot) => {
        const installments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Installment));
        set({ installments });
        recalcSummary(get().incomes, get().expenses, installments, get().financialAccounts, get().debtStatements);
      });
      
      // 4. Categories
      const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
        const categories = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Category));
        categories.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        if (categories.length === 0) {
          const defaultCategories: Omit<Category, 'id'>[] = [
            { name: 'Gaji', type: 'income', isActive: 1, order: 1 },
            { name: 'Bonus & THR', type: 'income', isActive: 1, order: 2 },
            { name: 'Investasi & Dividen', type: 'income', isActive: 1, order: 3 },
            { name: 'Makanan & Minuman', type: 'expense', isActive: 1, order: 1 },
            { name: 'Transportasi', type: 'expense', isActive: 1, order: 2 },
            { name: 'Tagihan & Utilitas', type: 'expense', isActive: 1, order: 3 },
            { name: 'Kesehatan', type: 'expense', isActive: 1, order: 4 },
            { name: 'Belanja Rumah Tangga', type: 'expense', isActive: 1, order: 5 },
            { name: 'Biaya Admin & Transaksi', type: 'expense', isActive: 1, order: 6 },
            { name: 'Pembayaran Tagihan CC/SPaylater', type: 'expense', isActive: 1, order: 7 },
            { name: 'KPR', type: 'installment', isActive: 1, order: 1 },
            { name: 'Kartu Kredit', type: 'installment', isActive: 1, order: 2 },
            { name: 'PayLater', type: 'installment', isActive: 1, order: 3 }
          ];
          defaultCategories.forEach(cat => addDoc(collection(db, 'categories'), cat));
        } else {
          set({ categories });
        }
      });
      
      // 5. Payment Methods
      const unsubPaymentMethods = onSnapshot(collection(db, 'paymentMethods'), (snapshot) => {
        const paymentMethods = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentMethod));
        paymentMethods.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        if (paymentMethods.length === 0) {
          const defaultPMs: Omit<PaymentMethod, 'id'>[] = [
            { name: 'Cash / Tunai', isActive: 1, order: 1, account_type: 'Cash' },
            { name: 'Transfer Bank BCA', isActive: 1, order: 2, account_type: 'Bank' },
            { name: 'Kartu Kredit', isActive: 1, order: 3, account_type: 'Credit Card' },
            { name: 'ShopeePay / E-Wallet', isActive: 1, order: 4, account_type: 'E-Wallet' }
          ];
          defaultPMs.forEach(pm => addDoc(collection(db, 'paymentMethods'), pm));
        } else {
          set({ paymentMethods });
        }
      });
      
      // 6. Settings
      const unsubSettings = onSnapshot(collection(db, 'appSettings'), (snapshot) => {
        if (!snapshot.empty) {
          const appSettings = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as AppSettings;
          set({ appSettings });
        } else {
          const defaultSettings: Omit<AppSettings, 'id'> = {
            familyName: 'Keluarga',
            husbandName: 'Suami',
            wifeName: 'Istri',
            currency: 'IDR',
            dateFormat: 'DD/MM/YYYY',
            theme: 'light',
            defaultDashboardPeriod: 'Bulan Ini'
          };
          addDoc(collection(db, 'appSettings'), defaultSettings);
        }
      });

      // 7. Financial Accounts
      const unsubAccounts = onSnapshot(collection(db, 'financialAccounts'), (snapshot) => {
        const financialAccounts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FinancialAccount));
        
        // Auto-seed default accounts jika belum ada sama sekali
        if (financialAccounts.length === 0) {
          const defaultAccounts: Omit<FinancialAccount, 'id'>[] = [
            { name: 'Dompet Tunai', type: 'Cash', owner: 'Bersama', currency: 'IDR', opening_balance: 0, current_balance: 0, isActive: 1, timestamp: Date.now() },
            { name: 'Rekening Bank Utama', type: 'Bank', owner: 'Bersama', currency: 'IDR', opening_balance: 0, current_balance: 0, isActive: 1, timestamp: Date.now() },
            { name: 'Kartu Kredit Utama', type: 'Credit Card', owner: 'Bersama', currency: 'IDR', opening_balance: 0, current_balance: 0, credit_limit: 10000000, isActive: 1, timestamp: Date.now() }
          ];
          defaultAccounts.forEach(acc => addDoc(collection(db, 'financialAccounts'), acc));
          set({ financialAccounts: defaultAccounts.map((a, idx) => ({ ...a, id: `seed-${idx}` })) });
        } else {
          set({ financialAccounts });
          recalcSummary(get().incomes, get().expenses, get().installments, financialAccounts, get().debtStatements);
        }
      });

      // 8. Debt Statements
      const unsubStatements = onSnapshot(collection(db, 'debtStatements'), (snapshot) => {
        const debtStatements = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DebtStatement));
        set({ debtStatements });
        recalcSummary(get().incomes, get().expenses, get().installments, get().financialAccounts, debtStatements);
      });

      // 9. Transfers
      const unsubTransfers = onSnapshot(collection(db, 'transfers'), (snapshot) => {
        const transfers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transfer));
        set({ transfers });
      });

      unsubscribers.push(
        unsubIncomes,
        unsubExpenses,
        unsubInstallments,
        unsubCategories,
        unsubPaymentMethods,
        unsubSettings,
        unsubAccounts,
        unsubStatements,
        unsubTransfers
      );
    }
  };
});

// Setup Auth Listener
onAuthStateChanged(auth, (user) => {
  useAppStore.setState({ user, authLoaded: true });
  if (user) {
    useAppStore.getState().initializeFirebaseListeners();
  } else {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
  }
});
