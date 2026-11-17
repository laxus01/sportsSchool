export const STATIC_HEALTH_ENTITIES_MIGRATION_VERSION = 13;

export const STATIC_HEALTH_ENTITIES_MIGRATION_STATEMENTS: readonly string[] = [
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
];
