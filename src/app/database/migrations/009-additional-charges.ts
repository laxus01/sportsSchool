export const ADDITIONAL_CHARGES_MIGRATION_VERSION = 9;

export const ADDITIONAL_CHARGES_MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE cargos_adicionales (
    id TEXT PRIMARY KEY NOT NULL,
    deportista_id TEXT NOT NULL,
    descripcion TEXT NOT NULL CHECK (length(trim(descripcion)) > 0),
    monto_pesos INTEGER NOT NULL CHECK (monto_pesos > 0),
    fecha_cargo TEXT NOT NULL,
    creado_por TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deportista_id) REFERENCES deportistas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE INDEX idx_cargos_adicionales_deportista
    ON cargos_adicionales(deportista_id, fecha_cargo)`,
  `CREATE TABLE pago_cargo_adicional (
    pago_id TEXT NOT NULL,
    cargo_adicional_id TEXT NOT NULL,
    monto_aplicado_pesos INTEGER NOT NULL CHECK (monto_aplicado_pesos > 0),
    PRIMARY KEY (pago_id, cargo_adicional_id),
    FOREIGN KEY (pago_id) REFERENCES pagos(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (cargo_adicional_id) REFERENCES cargos_adicionales(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE INDEX idx_pago_cargo_adicional_cargo
    ON pago_cargo_adicional(cargo_adicional_id)`,
  `DROP TRIGGER trg_pago_mensualidad_validar_insert`,
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
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_cargo_adicional WHERE pago_id = NEW.pago_id
         ), 0)
         > COALESCE((
           SELECT monto_pesos FROM pagos WHERE id = NEW.pago_id
         ), 0)
       THEN RAISE(ABORT, 'PAYMENT_AMOUNT_EXCEEDED')
     END;
   END`,
  `DROP TRIGGER trg_pago_inscripcion_validar_insert`,
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
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_cargo_adicional WHERE pago_id = NEW.pago_id
         ), 0)
         > COALESCE((
           SELECT monto_pesos FROM pagos WHERE id = NEW.pago_id
         ), 0)
       THEN RAISE(ABORT, 'PAYMENT_AMOUNT_EXCEEDED')
     END;
   END`,
  `CREATE TRIGGER trg_pago_cargo_adicional_validar_insert
   BEFORE INSERT ON pago_cargo_adicional
   BEGIN
     SELECT CASE
       WHEN COALESCE(
         (SELECT estado FROM pagos WHERE id = NEW.pago_id),
         ''
       ) <> 'registrado'
       THEN RAISE(ABORT, 'PAYMENT_NOT_REGISTERED')
     END;
     SELECT CASE
       WHEN NEW.monto_aplicado_pesos + COALESCE((
         SELECT SUM(pca.monto_aplicado_pesos)
         FROM pago_cargo_adicional pca
         JOIN pagos p ON p.id = pca.pago_id
         WHERE pca.cargo_adicional_id = NEW.cargo_adicional_id
           AND p.estado = 'registrado'
       ), 0) > COALESCE((
         SELECT monto_pesos FROM cargos_adicionales
         WHERE id = NEW.cargo_adicional_id
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
         + COALESCE((
           SELECT SUM(monto_aplicado_pesos)
           FROM pago_cargo_adicional WHERE pago_id = NEW.pago_id
         ), 0)
         > COALESCE((
           SELECT monto_pesos FROM pagos WHERE id = NEW.pago_id
         ), 0)
       THEN RAISE(ABORT, 'PAYMENT_AMOUNT_EXCEEDED')
     END;
   END`,
  `CREATE TRIGGER trg_pago_cargo_adicional_inmutable_update
   BEFORE UPDATE ON pago_cargo_adicional
   BEGIN
     SELECT RAISE(ABORT, 'APPLICATION_IMMUTABLE');
   END`,
  `CREATE TRIGGER trg_pago_cargo_adicional_inmutable_delete
   BEFORE DELETE ON pago_cargo_adicional
   BEGIN
     SELECT RAISE(ABORT, 'APPLICATION_IMMUTABLE');
   END`,
];
