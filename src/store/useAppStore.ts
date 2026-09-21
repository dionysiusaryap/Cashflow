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

// Interfaces
export interface Income {
  id?: string;
  date: string;
  source: string;
  owner: 'Suami' | 'Istri' | 'Bersama';
  amount: number;
  notes?: string;
  timestamp: number;
}

export interface Expense {
  id?: string;
  date: string;
  category: string;
  payment_method: string;
  amount: number;
  description?: string;
  owner: 'Suami' | 'Istri' | 'Bersama';
  installment_id?: string;
  timestamp: number;
}

export interface Installment {
  id?: string;
  name: string;
  type: string;
  initial_amount: number;
  monthly_payment: number;
  tenor: number;
  paid_installments: number;
  remaining_installments: number;
  outstanding: number;
  due_date: string;
  payment_method: string;
  status: 'Aman' | 'Segera jatuh tempo' | 'Jatuh tempo hari ini' | 'Terlambat' | 'Lunas';
  notes?: string;
  timestamp: number;
}

export interface Category {
  id?: string;
  name: string;
  type: 'income' | 'expense' | 'installment';
  isActive: number;
  order?: number;
}

export interface PaymentMethod {
  id?: string;
  name: string;
  isActive: number;
  order?: number;
}

export interface AppSettings {
  id?: string;
  familyName: string;
  husbandName: string;
  wifeName: string;
  currency: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'system';
  defaultDashboardPeriod: string;
}

interface AppState {
  user: User | null;
  authLoaded: boolean;
  
  incomes: Income[];
  expenses: Expense[];
  installments: Installment[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  appSettings: AppSettings | null;
  
  totalIncome: number;
  dailyExpenseTotal: number;
  installmentPaymentTotal: number;
  cashFlow: number;
  savingRate: number;
  totalMonthlyInstallment: number;
  totalOutstanding: number;
  
  // Actions
  initializeFirebaseListeners: () => void;
  
  addIncome: (income: Omit<Income, 'id'>) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<void>;
  
  addInstallment: (installment: Omit<Installment, 'id'>) => Promise<void>;
  deleteInstallment: (id: string) => Promise<void>;
  updateInstallment: (id: string, installment: Partial<Installment>) => Promise<void>;
  
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, category: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  
  addPaymentMethod: (pm: Omit<PaymentMethod, 'id'>) => Promise<void>;
  updatePaymentMethod: (id: string, pm: Partial<PaymentMethod>) => Promise<void>;
  deletePaymentMethod: (id: string) => Promise<void>;
  
  updateSettings: (id: string, settings: Partial<AppSettings>) => Promise<void>;
}

let unsubscribers: (() => void)[] = [];

export const useAppStore = create<AppState>((set, get) => {
  
  // Helper to recalculate summary whenever data changes
  const recalcSummary = (incomes: Income[], expenses: Expense[], installments: Installment[]) => {
    const currentMonthStr = getFinancialPeriod(new Date());
    const summary = calculateFinancialSummary(incomes, expenses, installments, currentMonthStr);
    set({
      totalIncome: summary.totalIncome, 
      dailyExpenseTotal: summary.dailyExpenseTotal, 
      installmentPaymentTotal: summary.installmentPaymentTotal,
      cashFlow: summary.cashFlow,
      savingRate: summary.savingRate,
      totalMonthlyInstallment: summary.totalMonthlyInstallment, 
      totalOutstanding: summary.totalOutstanding
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
    
    totalIncome: 0,
    dailyExpenseTotal: 0,
    installmentPaymentTotal: 0,
    cashFlow: 0,
    savingRate: 0,
    totalMonthlyInstallment: 0,
    totalOutstanding: 0,

    addIncome: async (income) => { await addDoc(collection(db, 'incomes'), income); },
    deleteIncome: async (id) => { await deleteDoc(doc(db, 'incomes', id)); },
    
    addExpense: async (expense) => { await addDoc(collection(db, 'expenses'), expense); },
    deleteExpense: async (id) => { await deleteDoc(doc(db, 'expenses', id)); },
    updateExpense: async (id, expense) => { await updateDoc(doc(db, 'expenses', id), expense); },
    
    addInstallment: async (inst) => { await addDoc(collection(db, 'installments'), inst); },
    deleteInstallment: async (id) => { await deleteDoc(doc(db, 'installments', id)); },
    updateInstallment: async (id, inst) => { await updateDoc(doc(db, 'installments', id), inst); },
    
    addCategory: async (category) => { await addDoc(collection(db, 'categories'), category); },
    updateCategory: async (id, category) => { await updateDoc(doc(db, 'categories', id), category); },
    deleteCategory: async (id) => { await deleteDoc(doc(db, 'categories', id)); },
    
    addPaymentMethod: async (pm) => { await addDoc(collection(db, 'paymentMethods'), pm); },
    updatePaymentMethod: async (id, pm) => { await updateDoc(doc(db, 'paymentMethods', id), pm); },
    deletePaymentMethod: async (id) => { await deleteDoc(doc(db, 'paymentMethods', id)); },
    
    updateSettings: async (id, settings) => { await updateDoc(doc(db, 'appSettings', id), settings); },

    initializeFirebaseListeners: () => {
      // Clear previous listeners if any
      unsubscribers.forEach(unsub => unsub());
      unsubscribers = [];

      const unsubIncomes = onSnapshot(collection(db, 'incomes'), (snapshot) => {
        const incomes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Income));
        set({ incomes });
        recalcSummary(incomes, get().expenses, get().installments);
      });
      
      const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
        const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        set({ expenses });
        recalcSummary(get().incomes, expenses, get().installments);
      });
      
      const unsubInstallments = onSnapshot(collection(db, 'installments'), (snapshot) => {
        const installments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Installment));
        set({ installments });
        recalcSummary(get().incomes, get().expenses, installments);
      });
      
      const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
        const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
        // Sort categories safely handling undefined orders
        categories.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        // Auto seed default categories if entirely empty
        if (categories.length === 0) {
          const defaultCategories: Omit<Category, 'id'>[] = [
            { name: 'Gaji', type: 'income', isActive: 1, order: 1 },
            { name: 'Bonus', type: 'income', isActive: 1, order: 2 },
            { name: 'Makanan & Minuman', type: 'expense', isActive: 1, order: 1 },
            { name: 'Transportasi', type: 'expense', isActive: 1, order: 2 },
            { name: 'Tagihan & Utilitas', type: 'expense', isActive: 1, order: 3 },
            { name: 'KPR', type: 'installment', isActive: 1, order: 1 },
            { name: 'Kartu Kredit', type: 'installment', isActive: 1, order: 2 }
          ];
          defaultCategories.forEach(cat => addDoc(collection(db, 'categories'), cat));
        } else {
          set({ categories });
        }
      });
      
      const unsubPaymentMethods = onSnapshot(collection(db, 'paymentMethods'), (snapshot) => {
        const paymentMethods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentMethod));
        paymentMethods.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        if (paymentMethods.length === 0) {
          const defaultPMs: Omit<PaymentMethod, 'id'>[] = [
            { name: 'Cash', isActive: 1, order: 1 },
            { name: 'Transfer Bank', isActive: 1, order: 2 },
            { name: 'Kartu Kredit', isActive: 1, order: 3 }
          ];
          defaultPMs.forEach(pm => addDoc(collection(db, 'paymentMethods'), pm));
        } else {
          set({ paymentMethods });
        }
      });
      
      const unsubSettings = onSnapshot(collection(db, 'appSettings'), (snapshot) => {
        if (!snapshot.empty) {
          const appSettings = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AppSettings;
          set({ appSettings });
        } else {
          // Create default settings if empty
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

      unsubscribers.push(unsubIncomes, unsubExpenses, unsubInstallments, unsubCategories, unsubPaymentMethods, unsubSettings);
    }
  };
});

// Setup Auth Listener
onAuthStateChanged(auth, (user) => {
  useAppStore.setState({ user, authLoaded: true });
  if (user) {
    useAppStore.getState().initializeFirebaseListeners();
  } else {
    // Unsubscribe when logged out
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
  }
});
