import Dexie, { type Table } from 'dexie';

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

export interface Budget {
  id?: string;
  category: string;
  amount: number;
}

export class FamilyFinanceDatabase extends Dexie {
  incomes!: Table<Income>;
  expenses!: Table<Expense>;
  installments!: Table<Installment>;
  categories!: Table<Category>;
  budgets!: Table<Budget>;
  paymentMethods!: Table<PaymentMethod>;
  appSettings!: Table<AppSettings>;

  constructor() {
    super('FamilyFinanceDB');
    this.version(3).stores({
      incomes: '++id, date, source, owner, timestamp',
      expenses: '++id, date, category, payment_method, owner, installment_id, timestamp',
      installments: '++id, name, type, due_date, status, timestamp',
      categories: '++id, name, type, isActive',
      budgets: '++id, category',
      paymentMethods: '++id, name, isActive',
      appSettings: '++id'
    });
  }
}

export const db = new FamilyFinanceDatabase();
