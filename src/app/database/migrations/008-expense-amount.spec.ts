import { describe, expect, it } from 'vitest';

import {
  EXPENSE_AMOUNT_MIGRATION_STATEMENTS,
  EXPENSE_AMOUNT_MIGRATION_VERSION,
} from './008-expense-amount';

describe('expense amount migration', () => {
  it('adds a positive peso amount while preserving legacy rows as null', () => {
    expect(EXPENSE_AMOUNT_MIGRATION_VERSION).toBe(8);
    expect(EXPENSE_AMOUNT_MIGRATION_STATEMENTS).toHaveLength(1);
    expect(EXPENSE_AMOUNT_MIGRATION_STATEMENTS[0]).toContain(
      'ALTER TABLE gastos',
    );
    expect(EXPENSE_AMOUNT_MIGRATION_STATEMENTS[0]).toContain(
      'monto_pesos IS NULL OR monto_pesos > 0',
    );
  });
});
