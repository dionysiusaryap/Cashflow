import { create } from 'zustand';
import { db, type Income, type Expense, type Installment, type Category, type Budget, type PaymentMethod, type AppSettings } from '../db/database';
import { calculateFinancialSummary } from '../utils/financeCalculations';
import { getFinancialPeriod } from '../utils/dateUtils';
import { liveQuery } from 'dexie';

interface AppState {
  incomes: Income[];
  expenses: Expense[];
  installments: Installment[];
  categories: Category[];
  budgets: Budget[];
  paymentMethods: PaymentMethod[];
  appSettings: AppSettings | null;
  
  
  // Computed (Global for the store or current month defaults)
  totalIncome: number;
  dailyExpenseTotal: number;
  installmentPaymentTotal: number;
  cashFlow: number;
  savingRate: number;
  totalMonthlyInstallment: number;
  totalOutstanding: number;
  
  // Actions
  refreshData: () => Promise<void>;
  initializeDemoData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  incomes: [],
  expenses: [],
  installments: [],
  categories: [],
  budgets: [],
  paymentMethods: [],
  appSettings: null,
  
  
  totalIncome: 0,
  dailyExpenseTotal: 0,
  installmentPaymentTotal: 0,
  cashFlow: 0,
  savingRate: 0,
  totalMonthlyInstallment: 0,
  totalOutstanding: 0,
  
  refreshData: async () => {
    // We get current month/year for filtering on Dashboard.
    // For simplicity, we calculate totals for all time or current month depending on needs.
    // Let's assume global totals first, but we can refine to monthly later.
    const incomes = await db.incomes.toArray();
    const expenses = await db.expenses.toArray();
    const installments = await db.installments.toArray();
    let categories = await db.categories.toArray();
    let paymentMethods = await db.paymentMethods.toArray();
    let appSettingsArr = await db.appSettings.toArray();
    
    // Seed default Categories if empty
    if (categories.length === 0) {
      const defaultCategories: Category[] = [
        // Incomes
        { name: 'Gaji', type: 'income', isActive: 1 },
        { name: 'Bonus', type: 'income', isActive: 1 },
        { name: 'Freelance', type: 'income', isActive: 1 },
        { name: 'Bisnis', type: 'income', isActive: 1 },
        { name: 'Komisi', type: 'income', isActive: 1 },
        { name: 'Investasi', type: 'income', isActive: 1 },
        { name: 'Hadiah', type: 'income', isActive: 1 },
        { name: 'Lainnya', type: 'income', isActive: 1 },
        // Expenses
        { name: 'Makanan & Minuman', type: 'expense', isActive: 1 },
        { name: 'Rumah Tangga', type: 'expense', isActive: 1 },
        { name: 'Transportasi', type: 'expense', isActive: 1 },
        { name: 'Anak', type: 'expense', isActive: 1 },
        { name: 'Pendidikan', type: 'expense', isActive: 1 },
        { name: 'Kesehatan', type: 'expense', isActive: 1 },
        { name: 'Asuransi', type: 'expense', isActive: 1 },
        { name: 'Tagihan & Utilitas', type: 'expense', isActive: 1 },
        { name: 'Belanja Pribadi', type: 'expense', isActive: 1 },
        { name: 'Hiburan', type: 'expense', isActive: 1 },
        { name: 'Sosial', type: 'expense', isActive: 1 },
        { name: 'Pembayaran Tagihan CC/SPaylater', type: 'expense', isActive: 1 },
        { name: 'Biaya Admin & Transaksi', type: 'expense', isActive: 1 },
        { name: 'Lainnya', type: 'expense', isActive: 1 },
        // Installments
        { name: 'KPR', type: 'installment', isActive: 1 },
        { name: 'Kendaraan', type: 'installment', isActive: 1 },
        { name: 'Kartu Kredit BCA', type: 'installment', isActive: 1 },
        { name: 'Kartu Kredit Mandiri', type: 'installment', isActive: 1 },
        { name: 'SPaylater', type: 'installment', isActive: 1 },
        { name: 'Pinjaman', type: 'installment', isActive: 1 },
        { name: 'Elektronik', type: 'installment', isActive: 1 },
        { name: 'Lainnya', type: 'installment', isActive: 1 },
      ];
      await db.categories.bulkAdd(defaultCategories);
      categories = await db.categories.toArray();
    }

    // Seed default Payment Methods if empty
    if (paymentMethods.length === 0) {
      const defaultPMs: PaymentMethod[] = [
        { name: 'Cash', isActive: 1 },
        { name: 'Transfer Bank', isActive: 1 },
        { name: 'Debit', isActive: 1 },
        { name: 'Kartu Kredit BCA', isActive: 1 },
        { name: 'Kartu Kredit Mandiri', isActive: 1 },
        { name: 'E-Wallet', isActive: 1 },
        { name: 'SPaylater', isActive: 1 },
        { name: 'Lainnya', isActive: 1 }
      ];
      await db.paymentMethods.bulkAdd(defaultPMs);
      paymentMethods = await db.paymentMethods.toArray();
    }

    // Seed default AppSettings if empty
    if (appSettingsArr.length === 0) {
      const defaultSettings: AppSettings = {
        familyName: 'Keluarga',
        husbandName: 'Suami',
        wifeName: 'Istri',
        currency: 'IDR',
        dateFormat: 'DD/MM/YYYY',
        theme: 'system',
        defaultDashboardPeriod: 'Bulan Ini'
      };
      await db.appSettings.add(defaultSettings);
      appSettingsArr = await db.appSettings.toArray();
    }
    
    // Auto-migration for missing default categories
    if (categories.length > 0) {
      const catToAdd: {name: string, type: 'expense', isActive: number}[] = [];
      if (!categories.some(c => c.name === 'Asuransi' && c.type === 'expense')) {
        catToAdd.push({ name: 'Asuransi', type: 'expense', isActive: 1 });
      }
      if (!categories.some(c => c.name === 'Biaya Admin & Transaksi' && c.type === 'expense')) {
        catToAdd.push({ name: 'Biaya Admin & Transaksi', type: 'expense', isActive: 1 });
      }
      if (catToAdd.length > 0) {
        await db.categories.bulkAdd(catToAdd as Category[]);
        categories = await db.categories.toArray();
      }
    }
    
    if (categories.length > 0) {
      const catToAdd: {name: string, type: 'installment', isActive: number}[] = [];
      if (!categories.some(c => c.name === 'Kartu Kredit BCA' && c.type === 'installment')) catToAdd.push({ name: 'Kartu Kredit BCA', type: 'installment', isActive: 1 });
      if (!categories.some(c => c.name === 'Kartu Kredit Mandiri' && c.type === 'installment')) catToAdd.push({ name: 'Kartu Kredit Mandiri', type: 'installment', isActive: 1 });
      if (catToAdd.length > 0) {
        await db.categories.bulkAdd(catToAdd);
        categories = await db.categories.toArray();
      }
    }
    
    // Auto-migration for missing default payment methods
    if (paymentMethods.length > 0) {
      const pmToAdd: {name: string, isActive: number}[] = [];
      if (!paymentMethods.some(pm => pm.name === 'Kartu Kredit BCA')) pmToAdd.push({ name: 'Kartu Kredit BCA', isActive: 1 });
      if (!paymentMethods.some(pm => pm.name === 'Kartu Kredit Mandiri')) pmToAdd.push({ name: 'Kartu Kredit Mandiri', isActive: 1 });
      if (pmToAdd.length > 0) {
        await db.paymentMethods.bulkAdd(pmToAdd);
        paymentMethods = await db.paymentMethods.toArray();
      }
    }
    
    // Deduplicate Categories (in case of concurrent seeding)
    const uniqueCategories = new Map();
    const categoryIdsToDelete: any[] = [];
    for (const c of categories) {
      const key = `${c.name}-${c.type}`;
      if (uniqueCategories.has(key)) {
        if (c.id) categoryIdsToDelete.push(c.id);
      } else {
        uniqueCategories.set(key, true);
      }
    }
    if (categoryIdsToDelete.length > 0) {
      await db.categories.bulkDelete(categoryIdsToDelete);
      categories = await db.categories.toArray();
    }

    // Deduplicate Payment Methods
    const uniquePMs = new Map();
    const pmIdsToDelete: any[] = [];
    for (const pm of paymentMethods) {
      if (uniquePMs.has(pm.name)) {
        if (pm.id) pmIdsToDelete.push(pm.id);
      } else {
        uniquePMs.set(pm.name, true);
      }
    }
    if (pmIdsToDelete.length > 0) {
      await db.paymentMethods.bulkDelete(pmIdsToDelete);
      paymentMethods = await db.paymentMethods.toArray();
    }

    // Initialize order if undefined
    let catUpdates = false;
    for (let i = 0; i < categories.length; i++) {
      if (categories[i].order === undefined) {
        categories[i].order = i;
        if (categories[i].id) await db.categories.update(categories[i].id!, { order: i });
        catUpdates = true;
      }
    }
    if (catUpdates) categories = await db.categories.toArray();

    let pmUpdates = false;
    for (let i = 0; i < paymentMethods.length; i++) {
      if (paymentMethods[i].order === undefined) {
        paymentMethods[i].order = i;
        if (paymentMethods[i].id) await db.paymentMethods.update(paymentMethods[i].id!, { order: i });
        pmUpdates = true;
      }
    }
    if (pmUpdates) paymentMethods = await db.paymentMethods.toArray();

    // Sort by order
    categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    paymentMethods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const budgets = await db.budgets.toArray();
    
    const now = new Date();
    const currentMonthStr = getFinancialPeriod(now);

    const summary = calculateFinancialSummary(incomes, expenses, installments, currentMonthStr);

    set({
      incomes, expenses, installments, categories, budgets, paymentMethods, appSettings: appSettingsArr[0],
      totalIncome: summary.totalIncome, 
      dailyExpenseTotal: summary.dailyExpenseTotal, 
      installmentPaymentTotal: summary.installmentPaymentTotal,
      cashFlow: summary.cashFlow,
      savingRate: summary.savingRate,
      totalMonthlyInstallment: summary.totalMonthlyInstallment, 
      totalOutstanding: summary.totalOutstanding
    });
  },

  initializeDemoData: async () => {
    const count = await db.incomes.count();
    if (count > 0) return; // already initialized

    const today = new Date().toISOString();
    
    await db.incomes.bulkAdd([
      { date: today, source: 'Gaji Suami', owner: 'Suami', amount: 10000000, timestamp: Date.now() },
      { date: today, source: 'Gaji Istri', owner: 'Istri', amount: 7000000, timestamp: Date.now() },
      { date: today, source: 'Freelance', owner: 'Suami', amount: 1500000, timestamp: Date.now() }
    ]);

    await db.expenses.bulkAdd([
      { date: today, category: 'Makanan & Minuman', payment_method: 'Cash', owner: 'Bersama', amount: 150000, description: 'Belanja sayur', timestamp: Date.now() },
      { date: today, category: 'Transportasi', payment_method: 'Debit', owner: 'Suami', amount: 300000, description: 'Bensin', timestamp: Date.now() }
    ]);

    await db.installments.bulkAdd([
      { 
        name: 'KPR', type: 'KPR', initial_amount: 500000000, monthly_payment: 3000000, 
        tenor: 180, paid_installments: 12, remaining_installments: 168, 
        outstanding: 500000000 - (3000000 * 12), due_date: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString(), 
        payment_method: 'Transfer', status: 'Aman', timestamp: Date.now() 
      },
      { 
        name: 'Kartu Kredit', type: 'Kartu Kredit', initial_amount: 15000000, monthly_payment: 1500000, 
        tenor: 10, paid_installments: 5, remaining_installments: 5, 
        outstanding: 7500000, due_date: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(), 
        payment_method: 'Transfer', status: 'Segera jatuh tempo', timestamp: Date.now() 
      }
    ]);

    await get().refreshData();
  }
}));

liveQuery(() => db.incomes.toArray()).subscribe(() => useAppStore.getState().refreshData());
liveQuery(() => db.expenses.toArray()).subscribe(() => useAppStore.getState().refreshData());
liveQuery(() => db.installments.toArray()).subscribe(() => useAppStore.getState().refreshData());
liveQuery(() => db.categories.toArray()).subscribe(() => useAppStore.getState().refreshData());
liveQuery(() => db.paymentMethods.toArray()).subscribe(() => useAppStore.getState().refreshData());
liveQuery(() => db.appSettings.toArray()).subscribe(() => useAppStore.getState().refreshData());
