import { TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database.service';
import { BackupCryptoService } from './backup-crypto.service';
import { BackupFileService } from './backup-file.service';
import { BackupHistoryService } from './backup-history.service';
import { BackupLockService } from './backup-lock.service';
import { BackupPackageService } from './backup-package.service';
import { BackupService } from './backup.service';

const SQLITE_OBJECTS = [
  {
    type: 'table',
    name: 'schema_migrations',
    tbl_name: 'schema_migrations',
    sql: 'CREATE TABLE schema_migrations (version INTEGER)',
  },
  {
    type: 'table',
    name: 'escuela',
    tbl_name: 'escuela',
    sql: 'CREATE TABLE escuela (id INTEGER)',
  },
  {
    type: 'index',
    name: 'idx_ejemplo',
    tbl_name: 'escuela',
    sql: 'CREATE INDEX idx_ejemplo ON escuela(id)',
  },
];

describe('BackupService', () => {
  let connection: SQLiteDBConnection;
  let database: DatabaseService;
  let queryShouldFail: boolean;

  beforeEach(() => {
    queryShouldFail = false;
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string) => {
        if (queryShouldFail) {
          throw new Error('db read error');
        }
        if (statement.includes('sqlite_master')) {
          return { values: SQLITE_OBJECTS };
        }
        if (statement.includes('FROM "escuela"')) {
          return { values: [{ id: 1, nombre: 'Escuela' }] };
        }
        if (statement.includes('FROM "schema_migrations"')) {
          return { values: [{ version: 8 }] };
        }
        return { values: [{ version: 8 }] };
      }),
    } as unknown as SQLiteDBConnection;
    database = {
      getConnection: async () => connection,
    } as unknown as DatabaseService;

    TestBed.configureTestingModule({
      providers: [
        BackupService,
        BackupLockService,
        { provide: DatabaseService, useValue: database },
        {
          provide: BackupFileService,
          useValue: {
            saveBackupToCache: vi.fn(
              async (fileName: string, data: Uint8Array) => ({
                fileName,
                path: `file:///cache/backups/${fileName}`,
                size: data.length,
                createdAt: '2026-11-06T12:00:00.000Z',
              }),
            ),
          },
        },
        {
          provide: BackupHistoryService,
          useValue: {
            record: vi.fn(async () => undefined),
            setLastBackup: vi.fn(async () => undefined),
          },
        },
      ],
    });
  });

  it('exports a sqlite dump inside a read transaction', async () => {
    const service = TestBed.inject(BackupService);

    const result = await service.exportDatabaseJson();
    const dump = JSON.parse(result.json);

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commitTransaction).toHaveBeenCalled();
    expect(dump.format).toBe('sportsschool-sqlite-dump');
    expect(dump.database).toBe('sports_school');
    expect(dump.objects).toHaveLength(3);
    expect(dump.data['escuela']).toEqual([{ id: 1, nombre: 'Escuela' }]);
    expect(result.databaseVersion).toBe(8);
  });

  it('rolls back the read transaction when the export fails', async () => {
    queryShouldFail = true;
    const service = TestBed.inject(BackupService);

    await expect(service.exportDatabaseJson()).rejects.toThrow();
    expect(connection.rollbackTransaction).toHaveBeenCalled();
  });

  it('serializes concurrent exports through the lock', async () => {
    const service = TestBed.inject(BackupService);
    let inFlight = 0;
    let maxInFlight = 0;
    (connection.query as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { values: [] };
      },
    );

    await Promise.all([
      service.exportDatabaseJson(),
      service.exportDatabaseJson(),
    ]);

    expect(maxInFlight).toBe(1);
  });

  it('rejects passwords shorter than the minimum', async () => {
    const service = TestBed.inject(BackupService);

    const result = await service.createBackup('corta');

    expect(result.success).toBe(false);
    expect(result.error).toBe('BACKUP_PASSWORD_TOO_SHORT');
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it('creates a verifiable encrypted zip package', async () => {
    const service = TestBed.inject(BackupService);
    const files = TestBed.inject(BackupFileService) as unknown as {
      saveBackupToCache: ReturnType<typeof vi.fn>;
    };
    const history = TestBed.inject(BackupHistoryService) as unknown as {
      record: ReturnType<typeof vi.fn>;
      setLastBackup: ReturnType<typeof vi.fn>;
    };

    const result = await service.createBackup('ClaveRespaldo2026');

    expect(result.success).toBe(true);
    expect(result.fileName).toMatch(
      /^SS_Backup_\d{8}-\d{4}\.zip$/,
    );
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'backup', status: 'success' }),
    );

    const zipBytes = files.saveBackupToCache.mock.calls[0][1] as Uint8Array;
    const packages = TestBed.inject(BackupPackageService);
    const crypto = TestBed.inject(BackupCryptoService);
    const entries = await packages.readPackageEntries(zipBytes);
    const manifest = JSON.parse(
      new TextDecoder().decode(entries.get('manifest.json')),
    );

    expect(manifest.application).toBe('Sports School');
    expect(manifest.backupFormatVersion).toBe(1);
    expect(manifest.database).toBe('sports_school');
    expect(manifest.databaseVersion).toBe(8);
    expect(manifest.encryption.algorithm).toBe('AES-256-GCM');
    expect(manifest.encryption.kdf).toBe('PBKDF2-HMAC-SHA256');

    const payload = entries.get('database/database.json.enc')!;
    expect(await crypto.sha256Hex(payload)).toBe(
      manifest.integrity.checksum,
    );

    const decrypted = await crypto.decrypt(
      {
        cipher: payload,
        salt: manifest.encryption.salt,
        nonce: manifest.encryption.nonce,
        iterations: manifest.encryption.iterations,
      },
      'ClaveRespaldo2026',
    );
    const dump = JSON.parse(decrypted);
    expect(dump.format).toBe('sportsschool-sqlite-dump');
    expect(dump.data['escuela']).toEqual([{ id: 1, nombre: 'Escuela' }]);
  });
});
