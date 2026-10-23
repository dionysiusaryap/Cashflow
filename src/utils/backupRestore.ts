import type { Income, Expense, Installment, FinancialAccount } from '../types/finance';

export interface PreparedImportPlan {
  accounts: { originalId?: string; item: Omit<FinancialAccount, 'id'> }[];
  installments: { originalId?: string; item: Omit<Installment, 'id'> }[];
  expenses: { originalId?: string; item: Omit<Expense, 'id'> }[];
  incomes: { originalId?: string; item: Omit<Income, 'id'> }[];
  existingAccountMap: Map<string, string>; // originalId -> existingId
  existingInstallmentMap: Map<string, string>; // originalId -> existingId
  duplicatesCount: number;
}

export function prepareBackupImport(
  backupData: any,
  existingState: {
    incomes: Income[];
    expenses: Expense[];
    installments: Installment[];
    financialAccounts: FinancialAccount[];
  }
): PreparedImportPlan {
  const existingAccountMap = new Map<string, string>(); // oldId -> existingId
  const existingInstallmentMap = new Map<string, string>(); // oldId -> existingId

  let duplicatesCount = 0;

  // 1. Process Accounts
  const accountsToImport: { originalId?: string; item: Omit<FinancialAccount, 'id'> }[] = [];
  const seenAccountKeys = new Set<string>();

  if (Array.isArray(backupData.financialAccounts)) {
    for (const acc of backupData.financialAccounts) {
      const backupKey = acc.id !== undefined && acc.id !== null ? String(acc.id) : (acc.name || '').toLowerCase().trim();
      if (seenAccountKeys.has(backupKey)) {
        duplicatesCount++;
        continue;
      }
      seenAccountKeys.add(backupKey);

      const existingMatch = existingState.financialAccounts.find(
        ea => ea.name.toLowerCase().trim() === (acc.name || '').toLowerCase().trim() && ea.owner === acc.owner
      );
      if (existingMatch && existingMatch.id) {
        if (acc.id !== undefined && acc.id !== null) {
          existingAccountMap.set(String(acc.id), existingMatch.id);
        }
        duplicatesCount++;
      } else {
        const { id, ...rest } = acc;
        const originalId = id !== undefined && id !== null ? String(id) : undefined;
        accountsToImport.push({ originalId, item: rest });
      }
    }
  }

  // 2. Process Installments
  const installmentsToImport: { originalId?: string; item: Omit<Installment, 'id'> }[] = [];
  const seenInstallmentKeys = new Set<string>();

  if (Array.isArray(backupData.installments)) {
    for (const inst of backupData.installments) {
      const backupKey = inst.id !== undefined && inst.id !== null ? String(inst.id) : `${(inst.name || '').toLowerCase().trim()}|${inst.initial_amount}`;
      if (seenInstallmentKeys.has(backupKey)) {
        duplicatesCount++;
        continue;
      }
      seenInstallmentKeys.add(backupKey);

      const existingMatch = existingState.installments.find(
        ei => (inst.timestamp && ei.timestamp === inst.timestamp) ||
              (ei.name.toLowerCase().trim() === (inst.name || '').toLowerCase().trim() && ei.initial_amount === inst.initial_amount)
      );
      if (existingMatch && existingMatch.id) {
        if (inst.id !== undefined && inst.id !== null) {
          existingInstallmentMap.set(String(inst.id), existingMatch.id);
        }
        duplicatesCount++;
      } else {
        const { id, ...rest } = inst;
        const originalId = id !== undefined && id !== null ? String(id) : undefined;
        installmentsToImport.push({ originalId, item: rest });
      }
    }
  }

  // 3. Process Incomes
  const incomesToImport: { originalId?: string; item: Omit<Income, 'id'> }[] = [];
  const seenIncomeKeys = new Set<string>();

  if (Array.isArray(backupData.incomes)) {
    for (const inc of backupData.incomes) {
      const backupKey = inc.id !== undefined && inc.id !== null
        ? String(inc.id)
        : `${inc.date}|${inc.source}|${inc.amount}|${inc.owner}|${inc.timestamp || ''}`;

      if (seenIncomeKeys.has(backupKey)) {
        duplicatesCount++;
        continue;
      }
      seenIncomeKeys.add(backupKey);

      const isDuplicateInDb = existingState.incomes.some(
        ei => (inc.timestamp && ei.timestamp === inc.timestamp && ei.amount === inc.amount) ||
              (ei.date === inc.date && ei.source === inc.source && ei.amount === inc.amount && ei.owner === inc.owner && (!inc.timestamp || !ei.timestamp || ei.timestamp === inc.timestamp))
      );

      if (isDuplicateInDb) {
        duplicatesCount++;
      } else {
        const { id, ...rest } = inc;
        const originalId = id !== undefined && id !== null ? String(id) : undefined;
        incomesToImport.push({ originalId, item: rest });
      }
    }
  }

  // 4. Process Expenses (Preserving Distinct Receipts while Preventing DB Duplication)
  const expensesToImport: { originalId?: string; item: Omit<Expense, 'id'> }[] = [];
  const seenExpenseKeys = new Set<string>();

  if (Array.isArray(backupData.expenses)) {
    for (const exp of backupData.expenses) {
      const backupKey = exp.id !== undefined && exp.id !== null
        ? String(exp.id)
        : `${exp.date}|${exp.category}|${exp.amount}|${exp.owner}|${exp.description || ''}|${exp.timestamp || ''}`;

      if (seenExpenseKeys.has(backupKey)) {
        duplicatesCount++;
        continue;
      }
      seenExpenseKeys.add(backupKey);

      // Check if already in DB
      const isDuplicateInDb = existingState.expenses.some(
        ee => (exp.timestamp && ee.timestamp === exp.timestamp && ee.amount === exp.amount) ||
              (ee.date === exp.date && ee.category === exp.category && ee.amount === exp.amount && ee.owner === exp.owner && (ee.description || '') === (exp.description || '') && (!exp.timestamp || !ee.timestamp || ee.timestamp === exp.timestamp))
      );

      if (isDuplicateInDb) {
        duplicatesCount++;
      } else {
        const { id, ...rest } = exp;
        const originalId = id !== undefined && id !== null ? String(id) : undefined;
        expensesToImport.push({ originalId, item: rest });
      }
    }
  }

  return {
    accounts: accountsToImport,
    installments: installmentsToImport,
    expenses: expensesToImport,
    incomes: incomesToImport,
    existingAccountMap,
    existingInstallmentMap,
    duplicatesCount
  };
}

/**
 * Remap foreign key ID reference from old backup document ID to new or existing database ID.
 * Normalizes both string and numeric IDs safely.
 */
export function resolveForeignKey(
  oldId: string | number | undefined,
  idMap: Map<string, string>,
  knownIds: Set<string>
): string | undefined {
  if (oldId === undefined || oldId === null || oldId === '') return undefined;
  const strId = String(oldId);
  if (idMap.has(strId)) {
    return idMap.get(strId);
  }
  // If already exists as a valid ID in database
  if (knownIds.has(strId)) {
    return strId;
  }
  // Broken or invalid reference
  return undefined;
}
