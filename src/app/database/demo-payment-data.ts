import { SQLiteDBConnection } from '@capacitor-community/sqlite';

export async function seedDemoPaymentData(
  database: SQLiteDBConnection,
  actor: string,
): Promise<void> {
  await database.beginTransaction();
  try {
    const existingData = await database.query(
      `SELECT
         (SELECT COUNT(*) FROM escuela)
         + (SELECT COUNT(*) FROM categorias)
         + (SELECT COUNT(*) FROM deportistas)
         + (SELECT COUNT(*) FROM acudientes)
         + (SELECT COUNT(*) FROM pagos)
         + (SELECT COUNT(*) FROM mensualidades)
         + (SELECT COUNT(*) FROM inscripciones) AS total`,
    );
    if (Number(existingData.values?.[0]?.['total'] ?? 0) > 0) {
      throw new Error('DEMO_REQUIRES_EMPTY_DATABASE');
    }

    await database.run(
      `INSERT INTO escuela
        (id, nombre, identificacion_fiscal, telefono, correo, direccion,
         nombre_representante, fecha_inicio_control_pagos,
         valor_inscripcion_pesos, dia_vencimiento_mensual)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Club Deportivo Demo Halcones',
        'DEMO-900000001',
        '3000000000',
        'pruebas@halcones.demo',
        'Calle de Pruebas 123',
        'Mariana López Demo',
        '2026-11-01',
        50000,
        10,
      ],
      false,
    );

    const categories = [
      ['demo-category-u10', 'Sub-10', 'Categoría de prueba Sub-10'],
      ['demo-category-u14', 'Sub-14', 'Categoría de prueba Sub-14'],
      ['demo-category-goalkeepers', 'Arqueros', 'Categoría de prueba Arqueros'],
    ] as const;
    const tariffs = [
      ['demo-tariff-u10', 'demo-category-u10', 80000],
      ['demo-tariff-u14', 'demo-category-u14', 95000],
      ['demo-tariff-goalkeepers', 'demo-category-goalkeepers', 70000],
    ] as const;

    for (const [id, name, description] of categories) {
      await database.run(
        `INSERT INTO categorias (id, nombre, descripcion)
         VALUES (?, ?, ?)`,
        [id, name, description],
        false,
      );
    }
    for (const [id, categoryId, amount] of tariffs) {
      await database.run(
        `INSERT INTO tarifas_categoria
          (id, categoria_id, monto_pesos, vigente_desde)
         VALUES (?, ?, ?, '2026-11-01')`,
        [id, categoryId, amount],
        false,
      );
    }

    const guardians = [
      ['demo-guardian-valentina', 'Paula', 'Demo Ríos', '3000000001'],
      ['demo-guardian-mateo', 'Andrés', 'Demo Pardo', '3000000002'],
      ['demo-guardian-camila', 'Lucía', 'Demo Torres', '3000000003'],
      ['demo-guardian-samuel', 'Carlos', 'Demo Gómez', '3000000004'],
    ] as const;
    for (const [id, names, surnames, phone] of guardians) {
      await database.run(
        `INSERT INTO acudientes
          (id, nombres, apellidos, tipo_documento, numero_documento, telefono)
         VALUES (?, ?, ?, 'OTRO', ?, ?)`,
        [id, names, surnames, id.toUpperCase(), phone],
        false,
      );
    }

    const athletes = [
      {
        id: 'demo-athlete-valentina',
        categoryId: 'demo-category-u10',
        guardianId: 'demo-guardian-valentina',
        names: 'Valentina',
        surnames: 'Demo Ríos',
        birthDate: '2017-04-12',
        entryDate: '2023-03-15',
      },
      {
        id: 'demo-athlete-mateo',
        categoryId: 'demo-category-u10',
        guardianId: 'demo-guardian-mateo',
        names: 'Mateo',
        surnames: 'Demo Pardo',
        birthDate: '2016-08-21',
        entryDate: '2026-11-03',
      },
      {
        id: 'demo-athlete-camila',
        categoryId: 'demo-category-u14',
        guardianId: 'demo-guardian-camila',
        names: 'Camila',
        surnames: 'Demo Torres',
        birthDate: '2013-02-09',
        entryDate: '2026-11-04',
      },
      {
        id: 'demo-athlete-samuel',
        categoryId: 'demo-category-goalkeepers',
        guardianId: 'demo-guardian-samuel',
        names: 'Samuel',
        surnames: 'Demo Gómez',
        birthDate: '2015-11-30',
        entryDate: '2024-06-01',
      },
    ] as const;

    for (const athlete of athletes) {
      await database.run(
        `INSERT INTO deportistas
          (id, categoria_id, nombres, apellidos, fecha_nacimiento,
           fecha_ingreso, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'activo')`,
        [
          athlete.id,
          athlete.categoryId,
          athlete.names,
          athlete.surnames,
          athlete.birthDate,
          athlete.entryDate,
        ],
        false,
      );
      await database.run(
        `INSERT INTO deportista_categoria_historial
          (id, deportista_id, categoria_id, vigente_desde)
         VALUES (?, ?, ?, ?)`,
        [
          `demo-history-${athlete.id}`,
          athlete.id,
          athlete.categoryId,
          athlete.entryDate,
        ],
        false,
      );
      await database.run(
        `INSERT INTO deportista_acudiente
          (deportista_id, acudiente_id, parentesco, es_principal)
         VALUES (?, ?, 'Acudiente', 1)`,
        [athlete.id, athlete.guardianId],
        false,
      );
    }

    for (const athleteId of ['demo-athlete-mateo', 'demo-athlete-camila']) {
      await database.run(
        `INSERT INTO inscripciones
          (id, deportista_id, fecha_inscripcion, monto_pesos)
         VALUES (?, ?, ?, 50000)`,
        [
          `demo-registration-${athleteId}`,
          athleteId,
          athleteId === 'demo-athlete-mateo' ? '2026-11-03' : '2026-11-04',
        ],
        false,
      );
    }

    const monthlies = [
      ['demo-monthly-valentina-2026-11', 'demo-athlete-valentina', 'demo-tariff-u10', 80000],
      ['demo-monthly-mateo-2026-11', 'demo-athlete-mateo', 'demo-tariff-u10', 80000],
      ['demo-monthly-camila-2026-11', 'demo-athlete-camila', 'demo-tariff-u14', 95000],
    ] as const;
    for (const [id, athleteId, tariffId, amount] of monthlies) {
      await database.run(
        `INSERT INTO mensualidades
          (id, deportista_id, tarifa_id, periodo, fecha_vencimiento,
           monto_pesos, creado_por)
         VALUES (?, ?, ?, '2026-11', '2026-11-10', ?, ?)`,
        [id, athleteId, tariffId, amount, actor],
        false,
      );
    }

    const payments = [
      {
        id: 'demo-payment-valentina-partial',
        guardianId: 'demo-guardian-valentina',
        amount: 30000,
        method: 'efectivo',
        entityId: null,
        reference: null,
        note: 'Demo: abono parcial a mensualidad',
      },
      {
        id: 'demo-payment-mateo-full',
        guardianId: 'demo-guardian-mateo',
        amount: 130000,
        method: 'transferencia',
        entityId: 'entidad-bancolombia',
        reference: 'DEMO-TRANSFER-001',
        note: 'Demo: cubre inscripción y mensualidad',
      },
      {
        id: 'demo-payment-camila-partial',
        guardianId: 'demo-guardian-camila',
        amount: 20000,
        method: 'efectivo',
        entityId: null,
        reference: null,
        note: 'Demo: abono parcial a inscripción',
      },
    ] as const;

    for (const payment of payments) {
      await database.run(
        `INSERT INTO pagos
          (id, acudiente_id, fecha_pago, monto_pesos, medio_pago,
           entidad_transferencia_id, referencia, observacion, creado_por)
         VALUES (?, ?, '2026-11-05', ?, ?, ?, ?, ?, ?)`,
        [
          payment.id,
          payment.guardianId,
          payment.amount,
          payment.method,
          payment.entityId,
          payment.reference,
          payment.note,
          actor,
        ],
        false,
      );
    }

    await database.run(
      `INSERT INTO pago_mensualidad
        (pago_id, mensualidad_id, monto_aplicado_pesos)
       VALUES ('demo-payment-valentina-partial',
               'demo-monthly-valentina-2026-11', 30000)`,
      [],
      false,
    );
    await database.run(
      `INSERT INTO pago_inscripcion
        (pago_id, inscripcion_id, monto_aplicado_pesos)
       VALUES ('demo-payment-mateo-full',
               'demo-registration-demo-athlete-mateo', 50000)`,
      [],
      false,
    );
    await database.run(
      `INSERT INTO pago_mensualidad
        (pago_id, mensualidad_id, monto_aplicado_pesos)
       VALUES ('demo-payment-mateo-full',
               'demo-monthly-mateo-2026-11', 80000)`,
      [],
      false,
    );
    await database.run(
      `INSERT INTO pago_inscripcion
        (pago_id, inscripcion_id, monto_aplicado_pesos)
       VALUES ('demo-payment-camila-partial',
               'demo-registration-demo-athlete-camila', 20000)`,
      [],
      false,
    );
    await database.run(
      `INSERT INTO auditoria_financiera
        (id, accion, entidad, entidad_id, actor, detalle)
       VALUES ('demo-audit-seed', 'DATOS_DEMO_CARGADOS', 'escuela', '1', ?, ?)`,
      [actor, 'Se cargó la escuela demo y los escenarios de prueba de pagos.'],
      false,
    );

    await database.commitTransaction();
  } catch (error) {
    await database.rollbackTransaction();
    throw error;
  }
}
