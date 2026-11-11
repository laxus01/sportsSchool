import { describe, expect, it } from 'vitest';

import {
  ATHLETE_IDENTIFICATION_MIGRATION_STATEMENTS,
  ATHLETE_IDENTIFICATION_MIGRATION_VERSION,
} from './011-athlete-identification';

describe('athlete identification migration', () => {
  it('fills missing identification values without replacing existing ones', () => {
    const statement = ATHLETE_IDENTIFICATION_MIGRATION_STATEMENTS[0];

    expect(ATHLETE_IDENTIFICATION_MIGRATION_VERSION).toBe(11);
    expect(statement).toContain('UPDATE deportistas');
    expect(statement).toContain("THEN 'TI'");
    expect(statement).toContain('abs(random() % 900000000000)');
    expect(statement).toContain('ELSE tipo_documento');
    expect(statement).toContain('ELSE numero_documento');
    expect(statement).toContain('numero_documento IS NULL');
  });
});
