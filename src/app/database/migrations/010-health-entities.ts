export const HEALTH_ENTITIES_MIGRATION_VERSION = 10;

export const HEALTH_ENTITIES_MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE entidades_salud (
    id TEXT PRIMARY KEY NOT NULL,
    nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
    activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE deportistas
    ADD COLUMN entidad_salud_id TEXT
    REFERENCES entidades_salud(id)
      ON UPDATE CASCADE ON DELETE RESTRICT`,
  `CREATE INDEX idx_deportistas_entidad_salud
    ON deportistas(entidad_salud_id)`,
];
