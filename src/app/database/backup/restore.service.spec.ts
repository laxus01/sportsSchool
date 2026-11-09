import { TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database.service';
import { BackupFileService } from './backup-file.service';
import { BackupHistoryService } from './backup-history.service';
import { BackupLockService } from './backup-lock.service';
import { DecryptedBackup, SqliteDump } from './backup.models';
import { RestoreService } from './restore.service';
import { SqliteDumpService } from './sqlite-dump.service';

const PREVENTIVE_DUMP: SqliteDump = {
  format: 'sportsschool-sqlite-dump',
  formatVersion: 1,
  database: 'sports_school',
  schemaVersion: 8,
  createdAt: '2026-11-06T12:00:00.000Z',
  objects: [],
  data: { escuela: [{ id: 1 }] },
};

const BACKUP_DUMP: SqliteDump = {
  ...PREVENTIVE_DUMP,
  data: { escuela: [{ id: 2 }] },
};

const DECRYPTED: DecryptedBackup = {
  manifest: {} as DecryptedBackup['manifest'],
  dump: BACKUP_DUMP,
};

describe('RestoreService', () => {
  let importShouldFailOnce: boolean;
  let exportShouldFail: boolean;
  let importCalls: SqliteDump[];
  let deletedPaths: string[];

  let connection: SQLiteDBConnection;
  let dumps: {
    exportDump: ReturnType<typeof vi.fn>;
    importDump: ReturnType<typeof vi.fn>;
  };
  let files: {
    writePreventiveExport: ReturnType<typeof vi.fn>;
    deletePreventiveExport: ReturnType<typeof vi.fn>;
  };
  let history: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    importShouldFailOnce = false;
    exportShouldFail = false;
    importCalls = [];
    deletedPaths = [];

    connection = {
      query: vi.fn(async (statement: string) => {
        if (statement.includes('integrity_check')) {
          return { values: [{ integrity_check: 'ok' }] };
        }
        if (statement.includes('foreign_key_check')) {
          return { values: [] };
        }
        if (statement.includes('sqlite_master')) {
          return { values: [{ total: 4 }] };
        }
        return { values: [{ version: 8 }] };
      }),
    } as unknown as SQLiteDBConnection;

    dumps = {
      exportDump: vi.fn(async () => {
        if (exportShouldFail) {
          throw new Error('export failed');
        }
        return { dump: PREVENTIVE_DUMP, json: '{}', schemaVersion: 8 };
      }),
      importDump: vi.fn(async (_conn: unknown, dump: SqliteDump) => {
        importCalls.push(dump);
        if (importShouldFailOnce && importCalls.length === 1) {
          throw new Error('import failed mid-way');
        }
      }),
    };

    files = {
      writePreventiveExport: vi.fn(
        async () => 'file:///data/preventive-backups/preventive-1.json',
      ),
      deletePreventiveExport: vi.fn(async (uri: string) => {
        deletedPaths.push(uri);
      }),
    };

    history = {
      record: vi.fn(async () => undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        RestoreService,
        BackupLockService,
        {
        provide: DatabaseService,
          useValue: {
            getConnection: async () => connection,
            getMaintenanceConnection: async () => connection,
          },
        },
        { provide: SqliteDumpService, useValue: dumps },
        { provide: BackupFileService, useValue: files },
        { provide: BackupHistoryService, useValue: history },
      ],
    });
  });

  it('restores the dump and cleans the preventive copy', async () => {
    const service = TestBed.inject(RestoreService);

    const result = await service.restore(DECRYPTED, 'respaldo.zip');

    expect(result.success).toBe(true);
    expect(result.databaseVersion).toBe(8);
    expect(importCalls).toEqual([BACKUP_DUMP]);
    expect(deletedPaths).toEqual([
      'file:///data/preventive-backups/preventive-1.json',
    ]);
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'restore', status: 'success' }),
    );
  });

  it('rolls back to the preventive dump when the import fails', async () => {
    importShouldFailOnce = true;
    const service = TestBed.inject(RestoreService);

    const result = await service.restore(DECRYPTED, 'respaldo.zip');

    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(true);
    expect(result.rollbackSucceeded).toBe(true);
    expect(importCalls).toEqual([BACKUP_DUMP, PREVENTIVE_DUMP]);
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'restore', status: 'error' }),
    );
  });

  it('does not touch the database if the preventive export fails', async () => {
    exportShouldFail = true;
    const service = TestBed.inject(RestoreService);

    const result = await service.restore(DECRYPTED, 'respaldo.zip');

    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(false);
    expect(importCalls).toHaveLength(0);
  });
});
