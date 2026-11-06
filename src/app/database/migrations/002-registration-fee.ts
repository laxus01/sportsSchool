export const REGISTRATION_FEE_MIGRATION_VERSION = 2;

export const REGISTRATION_FEE_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE escuela
    ADD COLUMN valor_inscripcion_pesos INTEGER
    CHECK (
      valor_inscripcion_pesos IS NULL
      OR valor_inscripcion_pesos >= 0
    )`,
  `CREATE TABLE inscripciones (
    id TEXT PRIMARY KEY NOT NULL,
    deportista_id TEXT NOT NULL UNIQUE,
    fecha_inscripcion TEXT NOT NULL,
    monto_pesos INTEGER NOT NULL CHECK (monto_pesos >= 0),
    estado TEXT NOT NULL DEFAULT 'activa'
      CHECK (estado IN ('activa', 'anulada')),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deportista_id) REFERENCES deportistas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE TABLE pago_inscripcion (
    pago_id TEXT NOT NULL,
    inscripcion_id TEXT NOT NULL,
    monto_aplicado_pesos INTEGER NOT NULL CHECK (monto_aplicado_pesos > 0),
    PRIMARY KEY (pago_id, inscripcion_id),
    FOREIGN KEY (pago_id) REFERENCES pagos(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE INDEX idx_pago_inscripcion_inscripcion
    ON pago_inscripcion(inscripcion_id)`,
];
