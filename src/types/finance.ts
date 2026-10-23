// ==========================================
// 1. KEPEMILIKAN DANA & TIPE DASAR
// ==========================================
export type FundOwner = 'Suami' | 'Istri' | 'Bersama';

export type AccountType = 'Cash' | 'Bank' | 'E-Wallet' | 'Credit Card' | 'PayLater' | 'Investment' | 'Other';

export type DebtType = 'KPR' | 'KUR' | 'Kredit Kendaraan' | 'Pinjaman Multiguna' | 'Kartu Kredit' | 'PayLater' | 'Pinjaman Pribadi' | 'Lainnya';

export type DebtStatus = 'Aman' | 'Segera jatuh tempo' | 'Jatuh tempo hari ini' | 'Terlambat' | 'Lunas';

export type StatementStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue';

export type ExpenseType = 'Daily' | 'CreditPurchase' | 'DebtPayment' | 'BillSettlement' | 'FeeOrInterest';

// ==========================================
// 2. FINANCIAL ACCOUNT (Akun Keuangan / Sumber Dana)
// ==========================================
export interface FinancialAccount {
  id: string;
  name: string;              // Contoh: "BCA Tabungan", "Dompet Tunai", "BCA Visa Card"
  type: AccountType;
  owner: FundOwner;
  currency: string;          // Default: "IDR"
  opening_balance: number;   // Saldo awal saat akun dibuat
  current_balance: number;   // Saldo kas berjalan (aset) atau saldo terpakai (kewajiban)
  credit_limit?: number;     // Khusus Credit Card / PayLater
  account_number?: string;
  isActive: number;          // 1: Aktif, 0: Non-aktif
  timestamp: number;
}

// ==========================================
// 3. DEBT ACCOUNT (Akun Pinjaman & Utang)
// ==========================================
export interface DebtAccount {
  id: string;
  name: string;                     // Contoh: "KPR Rumah Griya", "BCA Visa Platinum", "SPaylater"
  lender?: string;                  // Bank / Fintech pemberi pinjaman
  debt_type: DebtType;
  owner: FundOwner;
  currency: string;
  initial_principal: number;        // Plafon / Pokok awal pinjaman
  contractual_amount?: number;      // Total kewajiban kontraktual (pokok + bunga masa depan) jika ada
  outstanding_principal: number;    // Sisa pokok utang saat ini
  monthly_payment: number;          // Angsuran per bulan
  tenor: number;                    // Total tenor (bulan)
  paid_installments: number;        // Jumlah angsuran terbayar
  remaining_installments: number;   // Sisa angsuran
  due_day?: number;                 // Tanggal jatuh tempo rutin (1-31)
  next_due_date: string;            // ISO String tanggal jatuh tempo berikutnya
  payment_method?: string;          // Metode/rekening pembayaran default
  linked_account_id?: string;       // Relasi ke FinancialAccount jika tipe kartu kredit/paylater
  status: DebtStatus;
  notes?: string;
  timestamp: number;
}

// ==========================================
// 4. DEBT STATEMENT (Tagihan Berkala Kartu Kredit / PayLater)
// ==========================================
export interface DebtStatement {
  id: string;
  debt_account_id: string;          // Relasi ke DebtAccount
  statement_period: string;         // 'YYYY-MM'
  statement_date: string;           // Tanggal cetak tagihan
  due_date: string;                 // Tanggal jatuh tempo tagihan
  opening_balance: number;          // Saldo awal tagihan periode ini
  new_charges: number;              // Belanja baru kartu kredit periode ini
  installment_charges: number;      // Porsi cicilan yang ditagihkan periode ini
  interest_and_fees: number;        // Bunga dan biaya admin
  payments_received: number;        // Pembayaran yang sudah masuk
  closing_balance: number;          // Total tagihan akhir yang harus dibayar
  minimum_payment: number;          // Pembayaran minimum
  paid_amount: number;              // Total nominal yang sudah dibayarkan user
  status: StatementStatus;
  notes?: string;
  timestamp: number;
}

// ==========================================
// 5. DEBT TRANSACTION & SCHEDULE (Histori & Jadwal Angsuran)
// ==========================================
export interface DebtTransaction {
  id: string;
  debt_account_id: string;          // Relasi ke DebtAccount
  statement_id?: string;            // Relasi ke DebtStatement jika pembayaran tagihan
  schedule_id?: string;             // Relasi ke InstallmentSchedule jika angsuran
  expense_id?: string;              // Relasi ke transaksi pengeluaran (kas keluar)
  transaction_date: string;         // 'YYYY-MM-DD'
  type: 'Payment' | 'Charge' | 'FeeOrInterest' | 'Adjustment' | 'Reversal';
  principal_amount: number;         // Porsi pokok
  interest_amount: number;          // Porsi bunga/margin
  fee_amount: number;               // Porsi biaya
  total_amount: number;             // Total pembayaran
  source_account_id?: string;       // Akun kas/bank yang digunakan membayar
  notes?: string;
  idempotency_key?: string;         // Kunci unik pencegah pembayaran ganda
  timestamp: number;
}

export interface InstallmentSchedule {
  id: string;
  debt_account_id: string;
  installment_number: number;       // Angsuran ke-1, ke-2, dst.
  due_date: string;                 // 'YYYY-MM-DD'
  total_payment: number;            // Nominal angsuran
  principal_portion?: number;       // Porsi pokok (jika diketahui)
  interest_portion?: number;        // Porsi bunga/margin (jika diketahui)
  status: 'Pending' | 'Paid' | 'Overdue';
  payment_transaction_id?: string;  // Relasi ke DebtTransaction
  paid_date?: string;
}

// ==========================================
// 6. TRANSFER ANTAR-REKENING
// ==========================================
export interface Transfer {
  id: string;
  from_account_id: string;          // Sumber dana (aset berkurang)
  to_account_id: string;            // Tujuan dana (aset bertambah)
  amount: number;
  date: string;                     // 'YYYY-MM-DD'
  fee?: number;                     // Biaya transfer jika ada
  fee_expense_id?: string;          // Biaya dicatat sebagai beban ekonomi
  description?: string;
  owner: FundOwner;
  timestamp: number;
}

// ==========================================
// 7. AUDIT LOG (Jejak Perubahan Data)
// ==========================================
export interface AuditLog {
  id: string;
  entity_type: 'Income' | 'Expense' | 'Installment' | 'DebtAccount' | 'DebtStatement' | 'Transfer' | 'Account';
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'PAYMENT' | 'REVERSAL' | 'RECONCILE';
  summary: string;
  previous_state?: Record<string, any>;
  new_state?: Record<string, any>;
  performed_by?: string;            // Email pengguna
  timestamp: number;
}

// ==========================================
// 8. MODEL EKSISTING DENGAN DUKUNGAN BACKWARD-COMPATIBILITY
// ==========================================
export interface Income {
  id?: string;
  date: string;
  source: string;
  owner: FundOwner;
  amount: number;
  notes?: string;
  account_id?: string;              // Rekening penerima (opsional, legacy-safe)
  timestamp: number;
}

export interface Expense {
  id?: string;
  date: string;
  category: string;
  payment_method: string;
  amount: number;
  description?: string;
  owner: FundOwner;
  installment_id?: string;          // Relasi ke cicilan jika pembayaran angsuran
  debt_account_id?: string;         // Relasi ke DebtAccount jika belanja CC atau bayar utang
  debt_statement_id?: string;       // Relasi ke DebtStatement jika pelunasan tagihan CC
  debt_transaction_id?: string;     // Relasi ke histori pembayaran utang
  source_account_id?: string;       // Akun kas/bank yang berkurang
  expense_type?: ExpenseType;       // Klasifikasi beban ekonomi vs settlement
  notes?: string;                   // Catatan tambahan opsional
  is_legacy?: boolean;              // Penanda data sebelum migrasi
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
  status: DebtStatus;
  notes?: string;
  linked_account_id?: string;       // Opsional relasi ke FinancialAccount
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
  account_type?: AccountType;       // Tipe instrumen (Cash, Bank, CC)
}

export interface Budget {
  id?: string;
  category: string;
  amount: number;
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

// ==========================================
// 9. FINANCIAL SUMMARY RESULT INTERFACES
// ==========================================
export interface FinancialSummaryResult {
  // A. Penghasilan
  totalIncome: number;

  // B. Beban Ekonomi (Actual Economic Expense)
  // Belanja tunai + belanja kartu kredit + bunga/biaya.
  // TIDAK memasukkan pembayaran pokok pinjaman dua kali.
  economicExpense: number;

  // C. Arus Kas (Cash Inflow & Outflow)
  cashInflow: number;
  cashOutflow: number;
  netCashflow: number;             // cashInflow - cashOutflow

  // D. Surplus Ekonomi & Saving Rate
  economicSurplus: number;         // totalIncome - economicExpense
  savingRate: number;              // (economicSurplus / totalIncome) * 100%

  // E. Rasio Utang (Debt Service Ratio)
  loanInstallmentObligation: number; // Angsuran pinjaman aktif
  totalDebtObligation: number;       // Seluruh kewajiban utang terjadwal bulan ini
  installmentDebtRatio: number;      // (loanInstallmentObligation / totalIncome) * 100%
  totalDebtServiceRatio: number;     // (totalDebtObligation / totalIncome) * 100%
  debtServiceRatio: number;          // Primary Debt Service Ratio

  // F. Saldo & Outstanding Utang Konsolidasi
  totalOutstandingDebt: number;      // Sisa pokok pinjaman & kewajiban kredit konsolidasi
  availableLiquidCash: number;       // Saldo kas & bank aktif

  // G. Breakdown Arrays
  dailyExpensesArr: Expense[];
  installmentPaymentsArr: Expense[];
  ccSettlementPaymentsArr: Expense[];

  // H. Backward compatibility alias
  dailyExpenseTotal: number;
  installmentPaymentTotal: number;
  totalActualExpense: number;
  cashFlow: number;
  totalMonthlyInstallment: number;
  totalOutstanding: number;
  debtRatio: number;
}

// ==========================================
// 10. CASH PROJECTION & OBLIGATION CALENDAR
// ==========================================
export interface ObligationItem {
  id: string;
  title: string;
  type: 'Installment' | 'CreditCardStatement' | 'PayLaterBill' | 'RoutineExpense';
  due_date: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue';
  debt_account_id?: string;
  statement_id?: string;
  installment_id?: string;
  owner: FundOwner;
}

export interface CashProjectionResult {
  initialCash: number;
  confirmedIncome: number;
  estimatedIncome: number;
  paidObligations: number;
  upcomingObligations7Days: number;
  upcomingObligations30Days: number;
  upcomingObligationsTotal: number;
  projectedEndingCash: number;
  isDeficitProjected: boolean;
  deficitAmount: number;
  obligations: ObligationItem[];
}
