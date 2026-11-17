export const CLEAN_HEALTH_ENTITIES_MIGRATION_VERSION = 14;

export const CLEAN_HEALTH_ENTITIES_MIGRATION_STATEMENTS: readonly string[] = [
  `INSERT OR IGNORE INTO entidades_salud (id, nombre, activa) VALUES
    ('eps-cajacopi', 'CAJACOPI', 1),
    ('eps-coosalud', 'COOSALUD', 1),
    ('eps-dgsm-sanidad-militar', 'DGSM SANIDAD MILITAR', 1),
    ('eps-familiar-de-colombia', 'FAMILIAR DE COLOMBIA', 1),
    ('eps-sanitas', 'SANITAS', 1),
    ('eps-fomag', 'FOMAG', 1),
    ('eps-mutual-ser', 'MUTUAL SER', 1),
    ('eps-nueva', 'NUEVA EPS', 1),
    ('eps-salud-total', 'SALUD TOTAL', 1),
    ('eps-sanidad-ponal', 'SANIDAD PONAL', 1),
    ('eps-suramericana', 'SURAMERICANA', 1)`,
  `UPDATE deportistas
   SET entidad_salud_id = (
     SELECT destino.id
     FROM entidades_salud AS actual
     JOIN entidades_salud AS destino
       ON destino.nombre = CASE lower(trim(actual.nombre))
         WHEN 'coosalud eps' THEN 'COOSALUD'
         WHEN 'salud total eps' THEN 'SALUD TOTAL'
         WHEN 'mutual ser eps' THEN 'MUTUAL SER'
         WHEN 'eps familiar de colombia' THEN 'FAMILIAR DE COLOMBIA'
         WHEN 'eps sanitas' THEN 'SANITAS'
       END
     WHERE actual.id = deportistas.entidad_salud_id
     LIMIT 1
   )
   WHERE entidad_salud_id IN (
     SELECT id
     FROM entidades_salud
     WHERE lower(trim(nombre)) IN (
       'coosalud eps',
       'salud total eps',
       'mutual ser eps',
       'eps familiar de colombia',
       'eps sanitas'
     )
   )`,
  `DELETE FROM entidades_salud
   WHERE nombre COLLATE NOCASE NOT IN (
     'CAJACOPI',
     'COOSALUD',
     'DGSM SANIDAD MILITAR',
     'FAMILIAR DE COLOMBIA',
     'SANITAS',
     'FOMAG',
     'MUTUAL SER',
     'NUEVA EPS',
     'SALUD TOTAL',
     'SANIDAD PONAL',
     'SURAMERICANA'
   )`,
];
