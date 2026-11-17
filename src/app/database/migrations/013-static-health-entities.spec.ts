import { describe, expect, it } from 'vitest';

import {
  STATIC_HEALTH_ENTITIES_MIGRATION_STATEMENTS,
  STATIC_HEALTH_ENTITIES_MIGRATION_VERSION,
} from './013-static-health-entities';

describe('static health entities migration', () => {
  it('seeds all health entities present in the roster using stable ids', () => {
    const statement = STATIC_HEALTH_ENTITIES_MIGRATION_STATEMENTS.join(' ');

    expect(STATIC_HEALTH_ENTITIES_MIGRATION_VERSION).toBe(13);
    for (const name of [
      'CAJACOPI',
      'COOSALUD',
      'DGSM SANIDAD MILITAR',
      'FAMILIAR DE COLOMBIA',
      'SANITAS',
      'FOMAG',
      'MUTUAL SER',
      'NUEVA EPS',
      'SALUD TOTAL',
      'SANIDAD PONAL',
      'SURAMERICANA',
    ]) {
      expect(statement).toContain(`'${name}'`);
    }
    expect(statement).toContain('INSERT OR IGNORE');
  });
});
