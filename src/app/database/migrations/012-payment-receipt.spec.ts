import { describe, expect, it } from 'vitest';

import {
  PAYMENT_RECEIPT_MIGRATION_STATEMENTS,
  PAYMENT_RECEIPT_MIGRATION_VERSION,
} from './012-payment-receipt';

describe('payment receipt migration', () => {
  it('adds a unique receipt number and backfills existing payments', () => {
    expect(PAYMENT_RECEIPT_MIGRATION_VERSION).toBe(12);
    expect(PAYMENT_RECEIPT_MIGRATION_STATEMENTS[0]).toContain(
      'ADD COLUMN consecutivo_recibo INTEGER',
    );
    expect(PAYMENT_RECEIPT_MIGRATION_STATEMENTS[1]).toContain(
      'UPDATE pagos AS actual',
    );
    expect(PAYMENT_RECEIPT_MIGRATION_STATEMENTS[1]).toContain(
      'anterior.creado_en < actual.creado_en',
    );
    expect(PAYMENT_RECEIPT_MIGRATION_STATEMENTS[2]).toContain(
      'CREATE UNIQUE INDEX uq_pagos_consecutivo_recibo',
    );
  });
});
