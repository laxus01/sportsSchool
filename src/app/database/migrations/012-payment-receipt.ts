export const PAYMENT_RECEIPT_MIGRATION_VERSION = 12;

export const PAYMENT_RECEIPT_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE pagos
    ADD COLUMN consecutivo_recibo INTEGER`,
  `UPDATE pagos AS actual
   SET consecutivo_recibo = (
     SELECT COUNT(*)
     FROM pagos AS anterior
     WHERE anterior.creado_en < actual.creado_en
        OR (
          anterior.creado_en = actual.creado_en
          AND anterior.id <= actual.id
        )
   )`,
  `CREATE UNIQUE INDEX uq_pagos_consecutivo_recibo
    ON pagos(consecutivo_recibo)
    WHERE consecutivo_recibo IS NOT NULL`,
];
