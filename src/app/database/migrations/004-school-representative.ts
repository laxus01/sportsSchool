export const SCHOOL_REPRESENTATIVE_MIGRATION_VERSION = 4;

export const SCHOOL_REPRESENTATIVE_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE escuela
    ADD COLUMN nombre_representante TEXT NOT NULL DEFAULT ''`,
];
