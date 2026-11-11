import { describe, expect, it } from 'vitest';

import {
  ADDITIONAL_CHARGES_MIGRATION_STATEMENTS,
  ADDITIONAL_CHARGES_MIGRATION_VERSION,
} from './009-additional-charges';

describe('additional charges migration', () => {
  it('creates per-athlete charges and payment allocations with balance guards', () => {
    expect(ADDITIONAL_CHARGES_MIGRATION_VERSION).toBe(9);
    expect(
      ADDITIONAL_CHARGES_MIGRATION_STATEMENTS.some((statement) =>
        statement.includes('CREATE TABLE cargos_adicionales'),
      ),
    ).toBe(true);
    expect(
      ADDITIONAL_CHARGES_MIGRATION_STATEMENTS.some((statement) =>
        statement.includes('CREATE TABLE pago_cargo_adicional'),
      ),
    ).toBe(true);
    expect(
      ADDITIONAL_CHARGES_MIGRATION_STATEMENTS.some((statement) =>
        statement.includes('CREATE TRIGGER trg_pago_cargo_adicional_validar_insert'),
      ),
    ).toBe(true);
  });
});
