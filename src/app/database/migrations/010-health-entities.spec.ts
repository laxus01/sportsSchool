import { describe, expect, it } from 'vitest';

import {
  HEALTH_ENTITIES_MIGRATION_STATEMENTS,
  HEALTH_ENTITIES_MIGRATION_VERSION,
} from './010-health-entities';

describe('health entities migration', () => {
  it('creates the health entity catalog and links athletes to it', () => {
    expect(HEALTH_ENTITIES_MIGRATION_VERSION).toBe(10);
    expect(
      HEALTH_ENTITIES_MIGRATION_STATEMENTS.some((statement) =>
        statement.includes('CREATE TABLE entidades_salud'),
      ),
    ).toBe(true);
    expect(
      HEALTH_ENTITIES_MIGRATION_STATEMENTS.some(
        (statement) =>
          statement.includes('ALTER TABLE deportistas') &&
          statement.includes('entidad_salud_id'),
      ),
    ).toBe(true);
    expect(
      HEALTH_ENTITIES_MIGRATION_STATEMENTS.some((statement) =>
        statement.includes('idx_deportistas_entidad_salud'),
      ),
    ).toBe(true);
  });
});
