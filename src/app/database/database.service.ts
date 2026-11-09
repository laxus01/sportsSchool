import { inject, Injectable } from '@angular/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { defineCustomElements } from 'jeep-sqlite/loader';

import { LicenseWriteAccessService } from './license-write-access.service';
import {
  INITIAL_MIGRATION_STATEMENTS,
  INITIAL_MIGRATION_VERSION,
} from './migrations/001-initial-schema';
import {
  REGISTRATION_FEE_MIGRATION_STATEMENTS,
  REGISTRATION_FEE_MIGRATION_VERSION,
} from './migrations/002-registration-fee';
import {
  LOCAL_AUTH_MIGRATION_STATEMENTS,
  LOCAL_AUTH_MIGRATION_VERSION,
} from './migrations/003-local-auth';
import {
  SCHOOL_REPRESENTATIVE_MIGRATION_STATEMENTS,
  SCHOOL_REPRESENTATIVE_MIGRATION_VERSION,
} from './migrations/004-school-representative';
import {
  ATHLETE_PHOTO_MIGRATION_STATEMENTS,
  ATHLETE_PHOTO_MIGRATION_VERSION,
} from './migrations/005-athlete-photo';
import {
  PAYMENT_OPERATIONS_MIGRATION_STATEMENTS,
  PAYMENT_OPERATIONS_MIGRATION_VERSION,
} from './migrations/006-payment-operations';
import {
  EXPENSES_MIGRATION_STATEMENTS,
  EXPENSES_MIGRATION_VERSION,
} from './migrations/007-expenses';
import {
  EXPENSE_AMOUNT_MIGRATION_STATEMENTS,
  EXPENSE_AMOUNT_MIGRATION_VERSION,
} from './migrations/008-expense-amount';

const DATABASE_NAME = 'sports_school';
interface DatabaseMigration {
  version: number;
  statements: readonly string[];
}

const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    version: INITIAL_MIGRATION_VERSION,
    statements: INITIAL_MIGRATION_STATEMENTS,
  },
  {
    version: REGISTRATION_FEE_MIGRATION_VERSION,
    statements: REGISTRATION_FEE_MIGRATION_STATEMENTS,
  },
  {
    version: LOCAL_AUTH_MIGRATION_VERSION,
    statements: LOCAL_AUTH_MIGRATION_STATEMENTS,
  },
  {
    version: SCHOOL_REPRESENTATIVE_MIGRATION_VERSION,
    statements: SCHOOL_REPRESENTATIVE_MIGRATION_STATEMENTS,
  },
  {
    version: ATHLETE_PHOTO_MIGRATION_VERSION,
    statements: ATHLETE_PHOTO_MIGRATION_STATEMENTS,
  },
  {
    version: PAYMENT_OPERATIONS_MIGRATION_VERSION,
    statements: PAYMENT_OPERATIONS_MIGRATION_STATEMENTS,
  },
  {
    version: EXPENSES_MIGRATION_VERSION,
    statements: EXPENSES_MIGRATION_STATEMENTS,
  },
  {
    version: EXPENSE_AMOUNT_MIGRATION_VERSION,
    statements: EXPENSE_AMOUNT_MIGRATION_STATEMENTS,
  },
];
const CURRENT_DATABASE_VERSION =
  DATABASE_MIGRATIONS[DATABASE_MIGRATIONS.length - 1].version;

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private readonly writeAccess = inject(LicenseWriteAccessService);
  private initialization?: Promise<SQLiteDBConnection>;

  initialize(): Promise<void> {
    return this.getRawConnection().then(() => undefined);
  }

  async getConnection(): Promise<SQLiteDBConnection> {
    return this.writeAccess.guardConnection(await this.getRawConnection());
  }

  // Authentication and backup restoration must remain available without a license.
  getMaintenanceConnection(): Promise<SQLiteDBConnection> {
    return this.getRawConnection();
  }

  private getRawConnection(): Promise<SQLiteDBConnection> {
    if (!this.initialization) {
      this.initialization = this.initializeDatabase().catch((error: unknown) => {
        this.initialization = undefined;
        throw error;
      });
    }

    return this.initialization;
  }

  private async initializeDatabase(): Promise<SQLiteDBConnection> {
    const isWeb = Capacitor.getPlatform() === 'web';

    if (isWeb) {
      await this.initializeWebStore();
    }

    const connectionExists = await this.sqlite.isConnection(DATABASE_NAME, false);
    let database: SQLiteDBConnection;
    if (connectionExists.result) {
      database = await this.sqlite.retrieveConnection(DATABASE_NAME, false);
    } else {
      try {
        database = await this.createConnection();
      } catch (error) {
        const errorMessage =
          typeof error === 'object' &&
          error !== null &&
          'message' in error
            ? String(error.message)
            : String(error);
        if (!errorMessage.includes(`Connection ${DATABASE_NAME} already exists`)) {
          throw error;
        }

        await this.sqlite.closeConnection(DATABASE_NAME, false);
        database = await this.createConnection();
      }
    }

    await database.open();
    await database.execute('PRAGMA foreign_keys = ON;', false);
    await this.applyMigrations(database);

    if (isWeb) {
      await this.sqlite.saveToStore(DATABASE_NAME);
    }

    return database;
  }

  private createConnection(): Promise<SQLiteDBConnection> {
    return this.sqlite.createConnection(
      DATABASE_NAME,
      false,
      'no-encryption',
      CURRENT_DATABASE_VERSION,
      false,
    );
  }

  private async initializeWebStore(): Promise<void> {
    defineCustomElements(window);
    await customElements.whenDefined('jeep-sqlite');

    if (!document.querySelector('jeep-sqlite')) {
      document.body.appendChild(document.createElement('jeep-sqlite'));
    }

    await this.sqlite.initWebStore();
  }

  private async applyMigrations(database: SQLiteDBConnection): Promise<void> {
    const trackingTable = await database.isTable('schema_migrations');
    let currentVersion = 0;

    if (trackingTable.result) {
      const result = await database.query(
        'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
      );
      currentVersion = Number(result.values?.[0]?.['version'] ?? 0);
    }

    for (const migration of DATABASE_MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }

      await database.beginTransaction();
      try {
        for (const statement of migration.statements) {
          if (statement.trimStart().toUpperCase().startsWith('CREATE TRIGGER')) {
            await database.run(statement, [], false);
          } else {
            await database.execute(statement, false);
          }
        }
        await database.run(
          'INSERT INTO schema_migrations (version) VALUES (?)',
          [migration.version],
          false,
        );
        await database.commitTransaction();
        currentVersion = migration.version;
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }
    }
  }
}
