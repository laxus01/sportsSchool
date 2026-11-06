export const LOCAL_AUTH_MIGRATION_VERSION = 3;

export const LOCAL_AUTH_MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE usuarios (
    id TEXT PRIMARY KEY NOT NULL,
    nombre_usuario TEXT NOT NULL COLLATE NOCASE UNIQUE,
    hash_clave TEXT NOT NULL,
    salt TEXT NOT NULL,
    iteraciones INTEGER NOT NULL CHECK (iteraciones >= 100000),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];
