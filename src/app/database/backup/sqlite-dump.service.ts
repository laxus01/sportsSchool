import { Injectable } from '@angular/core';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';

import { BACKUP_DATABASE_NAME } from './backup-config';
import { SqliteDump, SqliteSchemaObject } from './backup.models';

export const DUMP_FORMAT = 'sportsschool-sqlite-dump';
export const DUMP_FORMAT_VERSION = 1;

const OBJECT_ORDER: Record<string, number> = {
  table: 0,
  index: 1,
  trigger: 2,
  view: 3,
};

@Injectable({ providedIn: 'root' })
export class SqliteDumpService {
  async exportDump(
    connection: SQLiteDBConnection,
  ): Promise<{ dump: SqliteDump; json: string; schemaVersion: number }> {
    await connection.beginTransaction();
    try {
      const objectsResult = await connection.query(
        `SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`,
      );
      const objects = (objectsResult.values ?? []) as SqliteSchemaObject[];
      objects.sort(
        (a, b) => (OBJECT_ORDER[a.type] ?? 9) - (OBJECT_ORDER[b.type] ?? 9),
      );

      const data: Record<string, Array<Record<string, unknown>>> = {};
      for (const object of objects) {
        if (object.type !== 'table') {
          continue;
        }
        const rows = await connection.query(
          `SELECT * FROM "${object.name}"`,
        );
        data[object.name] = (rows.values ?? []) as Array<
          Record<string, unknown>
        >;
      }

      const schemaVersion = await this.readSchemaVersion(connection);
      await connection.commitTransaction();

      const dump: SqliteDump = {
        format: DUMP_FORMAT,
        formatVersion: DUMP_FORMAT_VERSION,
        database: BACKUP_DATABASE_NAME,
        schemaVersion,
        createdAt: new Date().toISOString(),
        objects,
        data,
      };
      return { dump, json: JSON.stringify(dump), schemaVersion };
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    }
  }

  async importDump(
    connection: SQLiteDBConnection,
    dump: SqliteDump,
  ): Promise<void> {
    await connection.execute('PRAGMA foreign_keys = OFF', false);
    try {
      await connection.beginTransaction();
      try {
        await this.dropExistingObjects(connection);
        await this.createObjects(connection, dump);
        await this.insertRows(connection, dump);
        await connection.commitTransaction();
      } catch (error) {
        await connection.rollbackTransaction();
        throw error;
      }
    } finally {
      await connection.execute('PRAGMA foreign_keys = ON', false);
    }
  }

  private async dropExistingObjects(
    connection: SQLiteDBConnection,
  ): Promise<void> {
    const result = await connection.query(
      `SELECT type, name FROM sqlite_master
       WHERE sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%'
         AND type IN ('table', 'view', 'trigger')`,
    );
    for (const row of result.values ?? []) {
      const type = String(row['type']).toUpperCase();
      const name = String(row['name']);
      this.assertSafeName(name);
      await connection.execute(
        `DROP ${type} IF EXISTS "${name}"`,
        false,
      );
    }
  }

  private async createObjects(
    connection: SQLiteDBConnection,
    dump: SqliteDump,
  ): Promise<void> {
    for (const object of dump.objects) {
      this.assertSafeName(object.name);
      if (object.type === 'trigger') {
        await connection.run(object.sql, [], false);
      } else {
        await connection.execute(object.sql, false);
      }
    }
  }

  private async insertRows(
    connection: SQLiteDBConnection,
    dump: SqliteDump,
  ): Promise<void> {
    for (const [table, rows] of Object.entries(dump.data)) {
      this.assertSafeName(table);
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) {
          continue;
        }
        for (const column of columns) {
          this.assertSafeName(column);
        }
        const columnList = columns.map((name) => `"${name}"`).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((name) =>
          this.toSqliteValue(row[name]),
        );
        await connection.run(
          `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`,
          values,
          false,
        );
      }
    }
  }

  private async readSchemaVersion(
    connection: SQLiteDBConnection,
  ): Promise<number> {
    const result = await connection.query(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    );
    return Number(result.values?.[0]?.['version'] ?? 0);
  }

  private toSqliteValue(value: unknown): string | number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    return String(value);
  }

  private assertSafeName(name: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`DUMP_UNSAFE_NAME:${name}`);
    }
  }
}
