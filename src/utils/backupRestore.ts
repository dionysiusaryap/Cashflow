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
  const existingIncomeKeys = new Set(
    existingState.incomes.map(i => `${i.date}|${i.source}|${i.amount}|${i.owner}`)
  );
  const existingExpenseKeys = new Set(
    existingState.expenses.map(e => `${e.date}|${e.category}|${e.amount}|${e.owner}|${e.description || ''}`)
  );
  const existingAccountMap = new Map<string, string>(); // oldId -> existingId
  const existingInstallmentMap = new Map<string, string>(); // oldId -> existingId

  let duplicatesCount = 0;

  // 1. Process Accounts
  const accountsToImport: { originalId?: string; item: Omit<FinancialAccount, 'id'> }[] = [];
  if (Array.isArray(backupData.financialAccounts)) {
    for (const acc of backupData.financialAccounts) {
      const existingMatch = existingState.financialAccounts.find(
        ea => ea.name.toLowerCase().trim() === (acc.name || '').toLowerCase().trim() && ea.owner === acc.owner
      );
      if (existingMatch && existingMatch.id) {
        if (acc.id) existingAccountMap.set(acc.id, existingMatch.id);
        duplicatesCount++;
      } else {
        const { id: originalId, ...rest } = acc;
        accountsToImport.push({ originalId, item: rest });
      }
    }
  }

  // 2. Process Installments
  const installmentsToImport: { originalId?: string; item: Omit<Installment, 'id'> }[] = [];
  if (Array.isArray(backupData.installments)) {
    for (const inst of backupData.installments) {
      const existingMatch = existingState.installments.find(
        ei => ei.name.toLowerCase().trim() === (inst.name || '').toLowerCase().trim() &&
              ei.initial_amount === inst.initial_amount
      );
      if (existingMatch && existingMatch.id) {
        if (inst.id) existingInstallmentMap.set(inst.id, existingMatch.id);
        duplicatesCount++;
      } else {
        const { id: originalId, ...rest } = inst;
        installmentsToImport.push({ originalId, item: rest });
      }
    }
  }

  // 3. Process Incomes
  const incomesToImport: { originalId?: string; item: Omit<Income, 'id'> }[] = [];
  if (Array.isArray(backupData.incomes)) {
    for (const inc of backupData.incomes) {
      const key = `${inc.date}|${inc.source}|${inc.amount}|${inc.owner}`;
      if (existingIncomeKeys.has(key)) {
        duplicatesCount++;
      } else {
        const { id: originalId, ...rest } = inc;
        incomesToImport.push({ originalId, item: rest });
        existingIncomeKeys.add(key); // prevent duplicates within backup itself
      }
    }
  }

  // 4. Process Expenses (Preserving & Remapping FKs)
  const expensesToImport: { originalId?: string; item: Omit<Expense, 'id'> }[] = [];
  if (Array.isArray(backupData.expenses)) {
    for (const exp of backupData.expenses) {
      const key = `${exp.date}|${exp.category}|${exp.amount}|${exp.owner}|${exp.description || ''}`;
      if (existingExpenseKeys.has(key)) {
        duplicatesCount++;
      } else {
        const { id: originalId, ...rest } = exp;
        expensesToImport.push({ originalId, item: rest });
        existingExpenseKeys.add(key);
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
 */
export function resolveForeignKey(
  oldId: string | undefined,
  idMap: Map<string, string>,
  knownIds: Set<string>
): string | undefined {
  if (!oldId) return undefined;
  if (idMap.has(oldId)) {
    return idMap.get(oldId);
  }
  // If already exists as a valid ID in database
  if (knownIds.has(oldId)) {
    return oldId;
  }
  // Broken or invalid reference
  return undefined;
}
