export const EXPENSES_MIGRATION_VERSION = 7;

export const EXPENSES_MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE gastos (
    id TEXT PRIMARY KEY NOT NULL,
    fecha TEXT NOT NULL,
    descripcion TEXT NOT NULL CHECK (length(trim(descripcion)) > 0),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_gastos_fecha
    ON gastos(fecha DESC)`,
];
