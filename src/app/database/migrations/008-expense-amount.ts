export const EXPENSE_AMOUNT_MIGRATION_VERSION = 8;

export const EXPENSE_AMOUNT_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE gastos
    ADD COLUMN monto_pesos INTEGER
    CHECK (monto_pesos IS NULL OR monto_pesos > 0)`,
];
