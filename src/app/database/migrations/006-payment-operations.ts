export const PAYMENT_OPERATIONS_MIGRATION_VERSION = 6;

export const PAYMENT_OPERATIONS_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE escuela
    ADD COLUMN fecha_inicio_control_pagos TEXT`,
  `ALTER TABLE escuela
    ADD COLUMN dia_vencimiento_mensual INTEGER NOT NULL DEFAULT 31
    CHECK (dia_vencimiento_mensual BETWEEN 1 AND 31)`,
  `ALTER TABLE deportistas
    ADD COLUMN fecha_retiro TEXT`,
  `ALTER TABLE pagos
    ADD COLUMN creado_por TEXT`,
  `ALTER TABLE pagos
    ADD COLUMN anulado_en TEXT`,
  `ALTER TABLE pagos
    ADD COLUMN anulado_por TEXT`,
  `ALTER TABLE pagos
    ADD COLUMN motivo_anulacion TEXT`,
  `ALTER TABLE mensualidades
    ADD COLUMN creado_por TEXT`,
  `CREATE TABLE deportista_categoria_historial (
    id TEXT PRIMARY KEY NOT NULL,
    deportista_id TEXT NOT NULL,
    categoria_id TEXT NOT NULL,
    vigente_desde TEXT NOT NULL,
    vigente_hasta TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deportista_id) REFERENCES deportistas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (deportista_id, vigente_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
  )`,
  `CREATE INDEX idx_deportista_categoria_vigencia
    ON deportista_categoria_historial(deportista_id, vigente_desde, vigente_hasta)`,
  `CREATE TABLE auditoria_financiera (
    id TEXT PRIMARY KEY NOT NULL,
    accion TEXT NOT NULL,
    entidad TEXT NOT NULL,
    entidad_id TEXT,
    actor TEXT NOT NULL,
    motivo TEXT,
    detalle TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_auditoria_financiera_fecha
    ON auditoria_financiera(creado_en)`,
  `CREATE TRIGGER trg_pago_mensualidad_validar_insert
   BEFORE INSERT ON pago_mensualidad
   BEGIN
     SELECT CASE
       WHEN COALESCE(
         (SELECT estado FROM mensualidades WHERE id = NEW.mensualidad_id),
         ''
       ) <> 'activa'
       THEN RAISE(ABORT, 'OBLIGATION_NOT_ACTIVE')
     END;
     SELECT CASE
       WHEN COALESCE(
         (SELECT estado FROM pagos WHERE id = NEW.pago_id),
         ''
       ) <> 'registrado'
       THEN RAISE(ABORT, 'PAYMENT_NOT_REGISTERED')
     END;
     SELECT CASE
       WHEN NEW.monto_aplicado_pesos + COALESCE((
         SELECT SUM(pm.monto_aplicado_pesos)
         FROM pago_mensualidad pm
         JOIN pagos p ON p.id = pm.pago_id
         WHERE pm.mensualidad_id = NEW.mensualidad_id
           AND p.estado = 'registrado'
       ), 0) > COALESCE((
         SELECT monto_pesos FROM mensualidades
         WHERE id = NEW.mensualidad_id
       ), 0)
       THEN RAISE(ABORT, 'OBLIGATION_BALANCE_EXCEEDED')
     END;
     SELECT CASE
       WHEN NEW.monto_aplicado_pesos
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_mensualidad WHERE pago_id = NEW.pago_id
         ), 0)
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_inscripcion WHERE pago_id = NEW.pago_id
         ), 0)
         > COALESCE((
           SELECT monto_pesos FROM pagos WHERE id = NEW.pago_id
         ), 0)
       THEN RAISE(ABORT, 'PAYMENT_AMOUNT_EXCEEDED')
     END;
   END`,
  `CREATE TRIGGER trg_pago_inscripcion_validar_insert
   BEFORE INSERT ON pago_inscripcion
   BEGIN
     SELECT CASE
       WHEN COALESCE(
         (SELECT estado FROM inscripciones WHERE id = NEW.inscripcion_id),
         ''
       ) <> 'activa'
       THEN RAISE(ABORT, 'OBLIGATION_NOT_ACTIVE')
     END;
     SELECT CASE
       WHEN COALESCE(
         (SELECT estado FROM pagos WHERE id = NEW.pago_id),
         ''
       ) <> 'registrado'
       THEN RAISE(ABORT, 'PAYMENT_NOT_REGISTERED')
     END;
     SELECT CASE
       WHEN NEW.monto_aplicado_pesos + COALESCE((
         SELECT SUM(pi.monto_aplicado_pesos)
         FROM pago_inscripcion pi
         JOIN pagos p ON p.id = pi.pago_id
         WHERE pi.inscripcion_id = NEW.inscripcion_id
           AND p.estado = 'registrado'
       ), 0) > COALESCE((
         SELECT monto_pesos FROM inscripciones
         WHERE id = NEW.inscripcion_id
       ), 0)
       THEN RAISE(ABORT, 'OBLIGATION_BALANCE_EXCEEDED')
     END;
     SELECT CASE
       WHEN NEW.monto_aplicado_pesos
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_mensualidad WHERE pago_id = NEW.pago_id
         ), 0)
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_inscripcion WHERE pago_id = NEW.pago_id
         ), 0)
         > COALESCE((
           SELECT monto_pesos FROM pagos WHERE id = NEW.pago_id
         ), 0)
       THEN RAISE(ABORT, 'PAYMENT_AMOUNT_EXCEEDED')
     END;
   END`,
  `CREATE TRIGGER trg_pago_mensualidad_inmutable_update
   BEFORE UPDATE ON pago_mensualidad
   BEGIN
     SELECT RAISE(ABORT, 'APPLICATION_IMMUTABLE');
   END`,
  `CREATE TRIGGER trg_pago_mensualidad_inmutable_delete
   BEFORE DELETE ON pago_mensualidad
   BEGIN
     SELECT RAISE(ABORT, 'APPLICATION_IMMUTABLE');
   END`,
  `CREATE TRIGGER trg_pago_inscripcion_inmutable_update
   BEFORE UPDATE ON pago_inscripcion
   BEGIN
     SELECT RAISE(ABORT, 'APPLICATION_IMMUTABLE');
   END`,
  `CREATE TRIGGER trg_pago_inscripcion_inmutable_delete
   BEFORE DELETE ON pago_inscripcion
   BEGIN
     SELECT RAISE(ABORT, 'APPLICATION_IMMUTABLE');
   END`,
];
