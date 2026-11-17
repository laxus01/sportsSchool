import { describe, expect, it } from 'vitest';

import {
  CLEAN_HEALTH_ENTITIES_MIGRATION_STATEMENTS,
  CLEAN_HEALTH_ENTITIES_MIGRATION_VERSION,
} from './014-clean-health-entities';

describe('clean health entities migration', () => {
  it('preserves athlete links while consolidating aliases and removing other entities', () => {
    const [seed, remap, cleanup] = CLEAN_HEALTH_ENTITIES_MIGRATION_STATEMENTS;

    expect(CLEAN_HEALTH_ENTITIES_MIGRATION_VERSION).toBe(14);
    expect(CLEAN_HEALTH_ENTITIES_MIGRATION_STATEMENTS).toHaveLength(3);
    expect(seed).toContain('INSERT OR IGNORE INTO entidades_salud');
    expect(remap).toContain('UPDATE deportistas');
    expect(remap).toContain('SET entidad_salud_id');
    expect(remap).toContain('WHERE actual.id = deportistas.entidad_salud_id');
    for (const [alias, canonical] of [
      ['coosalud eps', 'COOSALUD'],
      ['salud total eps', 'SALUD TOTAL'],
      ['mutual ser eps', 'MUTUAL SER'],
      ['eps familiar de colombia', 'FAMILIAR DE COLOMBIA'],
      ['eps sanitas', 'SANITAS'],
    ]) {
      expect(remap).toContain(`WHEN '${alias}' THEN '${canonical}'`);
    }
    expect(cleanup).toContain('DELETE FROM entidades_salud');
    expect(cleanup).toContain('NOT IN');
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
      expect(cleanup).toContain(`'${name}'`);
    }
  });
});
