import { describe, expect, it } from 'vitest';

import {
  EXPENSES_MIGRATION_STATEMENTS,
  EXPENSES_MIGRATION_VERSION,
} from './007-expenses';

describe('expenses migration', () => {
  it('creates a date-indexed table for non-empty expense descriptions', () => {
    expect(EXPENSES_MIGRATION_VERSION).toBe(7);
    expect(EXPENSES_MIGRATION_STATEMENTS).toHaveLength(2);
    expect(EXPENSES_MIGRATION_STATEMENTS[0]).toContain(
      'CREATE TABLE gastos',
    );
    expect(EXPENSES_MIGRATION_STATEMENTS[0]).toContain(
      'CHECK (length(trim(descripcion)) > 0)',
    );
    expect(EXPENSES_MIGRATION_STATEMENTS[1]).toContain(
      'CREATE INDEX idx_gastos_fecha',
    );
  });
});
