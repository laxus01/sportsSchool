export const ATHLETE_IDENTIFICATION_MIGRATION_VERSION = 11;

export const ATHLETE_IDENTIFICATION_MIGRATION_STATEMENTS: readonly string[] = [
  `UPDATE deportistas
   SET tipo_documento = CASE
         WHEN tipo_documento IS NULL OR trim(tipo_documento) = '' THEN 'TI'
         ELSE tipo_documento
       END,
       numero_documento = CASE
         WHEN numero_documento IS NULL OR trim(numero_documento) = ''
         THEN CAST(100000000000 + abs(random() % 900000000000) AS TEXT)
         ELSE numero_documento
       END
   WHERE tipo_documento IS NULL
      OR trim(tipo_documento) = ''
      OR numero_documento IS NULL
      OR trim(numero_documento) = ''`,
];
