export const ATHLETE_PHOTO_MIGRATION_VERSION = 5;

export const ATHLETE_PHOTO_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE deportistas
    ADD COLUMN foto_data_url TEXT`,
];
