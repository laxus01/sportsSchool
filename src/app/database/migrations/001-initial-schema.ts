export const INITIAL_MIGRATION_VERSION = 1;

export const INITIAL_MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE escuela (
    id INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (id = 1),
    nombre TEXT NOT NULL,
    identificacion_fiscal TEXT,
    telefono TEXT,
    correo TEXT,
    direccion TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE categorias (
    id TEXT PRIMARY KEY NOT NULL,
    nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
    descripcion TEXT,
    activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE tarifas_categoria (
    id TEXT PRIMARY KEY NOT NULL,
    categoria_id TEXT NOT NULL,
    monto_pesos INTEGER NOT NULL CHECK (monto_pesos >= 0),
    vigente_desde TEXT NOT NULL,
    vigente_hasta TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (categoria_id, vigente_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
  )`,
  `CREATE TABLE deportistas (
    id TEXT PRIMARY KEY NOT NULL,
    categoria_id TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    tipo_documento TEXT,
    numero_documento TEXT,
    fecha_nacimiento TEXT,
    fecha_ingreso TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activo'
      CHECK (estado IN ('activo', 'inactivo')),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE UNIQUE INDEX uq_deportistas_documento
    ON deportistas(tipo_documento, numero_documento)
    WHERE numero_documento IS NOT NULL`,
  `CREATE INDEX idx_deportistas_categoria
    ON deportistas(categoria_id)`,
  `CREATE TABLE acudientes (
    id TEXT PRIMARY KEY NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    tipo_documento TEXT,
    numero_documento TEXT,
    telefono TEXT NOT NULL,
    correo TEXT,
    direccion TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX uq_acudientes_documento
    ON acudientes(tipo_documento, numero_documento)
    WHERE numero_documento IS NOT NULL`,
  `CREATE TABLE deportista_acudiente (
    deportista_id TEXT NOT NULL,
    acudiente_id TEXT NOT NULL,
    parentesco TEXT,
    es_principal INTEGER NOT NULL DEFAULT 0 CHECK (es_principal IN (0, 1)),
    contacto_emergencia INTEGER NOT NULL DEFAULT 0
      CHECK (contacto_emergencia IN (0, 1)),
    PRIMARY KEY (deportista_id, acudiente_id),
    FOREIGN KEY (deportista_id) REFERENCES deportistas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (acudiente_id) REFERENCES acudientes(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE UNIQUE INDEX uq_deportista_acudiente_principal
    ON deportista_acudiente(deportista_id)
    WHERE es_principal = 1`,
  `CREATE INDEX idx_deportista_acudiente_acudiente
    ON deportista_acudiente(acudiente_id)`,
  `CREATE TABLE entidades_transferencia (
    id TEXT PRIMARY KEY NOT NULL,
    nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
    tipo TEXT NOT NULL
      CHECK (tipo IN ('banco', 'billetera', 'sistema_transferencia')),
    activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
  )`,
  `CREATE TABLE mensualidades (
    id TEXT PRIMARY KEY NOT NULL,
    deportista_id TEXT NOT NULL,
    tarifa_id TEXT NOT NULL,
    periodo TEXT NOT NULL,
    fecha_vencimiento TEXT NOT NULL,
    monto_pesos INTEGER NOT NULL CHECK (monto_pesos >= 0),
    estado TEXT NOT NULL DEFAULT 'activa'
      CHECK (estado IN ('activa', 'anulada')),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deportista_id) REFERENCES deportistas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (tarifa_id) REFERENCES tarifas_categoria(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (deportista_id, periodo),
    CHECK (
      length(periodo) = 7
      AND periodo GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
      AND substr(periodo, 6, 2) BETWEEN '01' AND '12'
    )
  )`,
  `CREATE INDEX idx_mensualidades_periodo
    ON mensualidades(periodo)`,
  `CREATE INDEX idx_mensualidades_vencimiento
    ON mensualidades(fecha_vencimiento)`,
  `CREATE TABLE pagos (
    id TEXT PRIMARY KEY NOT NULL,
    acudiente_id TEXT,
    fecha_pago TEXT NOT NULL,
    monto_pesos INTEGER NOT NULL CHECK (monto_pesos > 0),
    medio_pago TEXT NOT NULL CHECK (medio_pago IN ('efectivo', 'transferencia')),
    entidad_transferencia_id TEXT,
    referencia TEXT,
    estado TEXT NOT NULL DEFAULT 'registrado'
      CHECK (estado IN ('registrado', 'anulado')),
    observacion TEXT,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (acudiente_id) REFERENCES acudientes(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (entidad_transferencia_id)
      REFERENCES entidades_transferencia(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (
      (medio_pago = 'efectivo' AND entidad_transferencia_id IS NULL)
      OR
      (medio_pago = 'transferencia' AND entidad_transferencia_id IS NOT NULL)
    )
  )`,
  `CREATE INDEX idx_pagos_fecha
    ON pagos(fecha_pago)`,
  `CREATE INDEX idx_pagos_acudiente
    ON pagos(acudiente_id)`,
  `CREATE TABLE pago_mensualidad (
    pago_id TEXT NOT NULL,
    mensualidad_id TEXT NOT NULL,
    monto_aplicado_pesos INTEGER NOT NULL CHECK (monto_aplicado_pesos > 0),
    PRIMARY KEY (pago_id, mensualidad_id),
    FOREIGN KEY (pago_id) REFERENCES pagos(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (mensualidad_id) REFERENCES mensualidades(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  )`,
  `CREATE INDEX idx_pago_mensualidad_mensualidad
    ON pago_mensualidad(mensualidad_id)`,
  `INSERT INTO entidades_transferencia (id, nombre, tipo) VALUES
    ('entidad-neki', 'Neki', 'billetera'),
    ('entidad-daviplata', 'Daviplata', 'billetera'),
    ('entidad-bancolombia', 'Bancolombia', 'banco'),
    ('entidad-bre-b', 'Bre-B', 'sistema_transferencia')`,
];
