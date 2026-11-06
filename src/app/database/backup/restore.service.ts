import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../database.service';
import {
  DecryptedBackup,
  RestoreResult,
  SqliteDump,
} from './backup.models';
import { BackupFileService } from './backup-file.service';
import { BackupHistoryService } from './backup-history.service';
import { BackupLockService } from './backup-lock.service';
import { SqliteDumpService } from './sqlite-dump.service';

const ESSENTIAL_TABLES = [
  'schema_migrations',
  'escuela',
  'deportistas',
  'pagos',
];

interface RollbackOutcome {
  attempted: boolean;
  ok: boolean;
}

@Injectable({ providedIn: 'root' })
export class RestoreService {
  private readonly database = inject(DatabaseService);
  private readonly lock = inject(BackupLockService);
  private readonly files = inject(BackupFileService);
  private readonly history = inject(BackupHistoryService);
  private readonly dumps = inject(SqliteDumpService);

  readonly isBusy = this.lock.isBusy;

  async restore(
    decrypted: DecryptedBackup,
    sourceFileName: string,
  ): Promise<RestoreResult> {
    return this.lock.runExclusive(async () => {
      let preventiveDump: SqliteDump | null = null;
      let preventiveUri: string | null = null;
      let replaced = false;
      try {
        const connection = await this.database.getConnection();
        preventiveDump = (
          await this.dumps.exportDump(connection)
        ).dump;
        preventiveUri = await this.files.writePreventiveExport(
          JSON.stringify(preventiveDump),
        );

        replaced = true;
        await this.dumps.importDump(connection, decrypted.dump);
        const databaseVersion = await this.verifyDatabase();

        await this.safeDelete(preventiveUri);
        await this.history.record({
          type: 'restore',
          fileName: sourceFileName,
          status: 'success',
        });
        return {
          success: true,
          restoredAt: new Date().toISOString(),
          databaseVersion,
        };
      } catch (error) {
        const rollback = replaced
          ? await this.rollback(preventiveDump)
          : { attempted: false, ok: true };
        if (rollback.ok && preventiveUri) {
          await this.safeDelete(preventiveUri);
        }
        await this.history.record({
          type: 'restore',
          fileName: sourceFileName,
          status: 'error',
          message: this.safeMessage(error),
        });
        return {
          success: false,
          error: this.safeMessage(error),
          rollbackPerformed: rollback.attempted,
          rollbackSucceeded: rollback.attempted ? rollback.ok : undefined,
          preventiveFilePath: rollback.ok
            ? undefined
            : (preventiveUri ?? undefined),
        };
      }
    });
  }

  private async rollback(
    preventiveDump: SqliteDump | null,
  ): Promise<RollbackOutcome> {
    if (!preventiveDump) {
      return { attempted: true, ok: false };
    }
    try {
      const connection = await this.database.getConnection();
      await this.dumps.importDump(connection, preventiveDump);
      await this.verifyDatabase();
      return { attempted: true, ok: true };
    } catch {
      return { attempted: true, ok: false };
    }
  }

  private async verifyDatabase(): Promise<number> {
    const connection = await this.database.getConnection();

    const integrity = await connection.query('PRAGMA integrity_check');
    const integrityValue = String(
      integrity.values?.[0]?.['integrity_check'] ?? '',
    ).toLowerCase();
    if (integrityValue !== 'ok') {
      throw new Error('RESTORE_INTEGRITY_FAILED');
    }

    const foreignKeys = await connection.query('PRAGMA foreign_key_check');
    if ((foreignKeys.values?.length ?? 0) > 0) {
      throw new Error('RESTORE_FK_VIOLATIONS');
    }

    const names = ESSENTIAL_TABLES.map((name) => `'${name}'`).join(', ');
    const tables = await connection.query(
      `SELECT COUNT(*) AS total FROM sqlite_master
       WHERE type = 'table' AND name IN (${names})`,
    );
    if (
      Number(tables.values?.[0]?.['total'] ?? 0) !== ESSENTIAL_TABLES.length
    ) {
      throw new Error('RESTORE_MISSING_TABLES');
    }

    const version = await connection.query(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    );
    return Number(version.values?.[0]?.['version'] ?? 0);
  }

  private async safeDelete(uri: string | null): Promise<void> {
    if (!uri) {
      return;
    }
    try {
      await this.files.deletePreventiveExport(uri);
    } catch {
      // El archivo preventivo huérfano no bloquea el resultado.
    }
  }

  private safeMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error ?? 'UNKNOWN');
    return message.replace(/\s+/g, ' ').slice(0, 200);
  }
}
