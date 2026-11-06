import { TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database.service';
import {
  BACKUP_CHECKSUM_ENTRY,
  BACKUP_MANIFEST_ENTRY,
  BACKUP_PAYLOAD_ENTRY,
} from './backup-config';
import { BackupCryptoService } from './backup-crypto.service';
import { BackupManifest } from './backup.models';
import { BackupPackageService } from './backup-package.service';
import { BackupValidationService } from './backup-validation.service';

const PASSWORD = 'ClaveRespaldo2026';

function makeDumpJson(schemaVersion = 8): string {
  return JSON.stringify({
    format: 'sportsschool-sqlite-dump',
    formatVersion: 1,
    database: 'sports_school',
    schemaVersion,
    createdAt: '2026-11-06T12:00:00.000Z',
    objects: [
      {
        type: 'table',
        name: 'escuela',
        tbl_name: 'escuela',
        sql: 'CREATE TABLE escuela (id INTEGER)',
      },
    ],
    data: { escuela: [{ id: 1 }] },
  });
}

describe('BackupValidationService', () => {
  let databaseVersion: number;

  async function makePackage(
    manifestOverrides: Partial<BackupManifest> = {},
    databaseJson = makeDumpJson(),
  ): Promise<Uint8Array> {
    const crypto = TestBed.inject(BackupCryptoService);
    const packages = TestBed.inject(BackupPackageService);
    const encrypted = await crypto.encrypt(databaseJson, PASSWORD);
    const checksum = await crypto.sha256Hex(encrypted.cipher);
    const manifest: BackupManifest = {
      application: 'Sports School',
      backupFormatVersion: 1,
      applicationVersion: '0.0.1',
      databaseVersion,
      createdAt: '2026-11-06T12:00:00.000Z',
      database: 'sports_school',
      format: 'json',
      compression: 'zip',
      encryption: {
        algorithm: 'AES-256-GCM',
        enabled: true,
        kdf: 'PBKDF2-HMAC-SHA256',
        salt: encrypted.salt,
        iterations: encrypted.iterations,
        nonce: encrypted.nonce,
      },
      integrity: { algorithm: 'SHA-256', checksum },
      ...manifestOverrides,
    };
    return packages.buildPackage(
      JSON.stringify(manifest),
      encrypted.cipher,
      checksum,
    );
  }

  beforeEach(() => {
    databaseVersion = 8;
    const connection = {
      query: vi.fn(async () => ({ values: [{ version: databaseVersion }] })),
    } as unknown as SQLiteDBConnection;

    TestBed.configureTestingModule({
      providers: [
        BackupValidationService,
        {
          provide: DatabaseService,
          useValue: {
            getConnection: async () => connection,
          },
        },
      ],
    });
  });

  it('accepts a well-formed package and decrypts it', async () => {
    const service = TestBed.inject(BackupValidationService);
    const zip = await makePackage();

    const validated = await service.validatePackage(zip);
    expect(validated.manifest.databaseVersion).toBe(8);

    const decrypted = await service.decryptPackage(validated, PASSWORD);
    expect(decrypted.dump.database).toBe('sports_school');
    expect(decrypted.dump.data['escuela']).toEqual([{ id: 1 }]);
  });

  it('rejects a package from another application', async () => {
    const service = TestBed.inject(BackupValidationService);
    const zip = await makePackage({ application: 'Otra App' });

    await expect(service.validatePackage(zip)).rejects.toThrow(
      'MANIFEST_FOREIGN_APP',
    );
  });

  it('rejects an unknown backup format version', async () => {
    const service = TestBed.inject(BackupValidationService);
    const zip = await makePackage({ backupFormatVersion: 99 });

    await expect(service.validatePackage(zip)).rejects.toThrow(
      'MANIFEST_UNSUPPORTED_FORMAT',
    );
  });

  it('rejects a tampered payload via checksum', async () => {
    const service = TestBed.inject(BackupValidationService);
    const packages = TestBed.inject(BackupPackageService);
    const zip = await makePackage();
    const entries = await packages.readPackageEntries(zip);

    const tamperedPayload = new Uint8Array(
      entries.get(BACKUP_PAYLOAD_ENTRY)!,
    );
    tamperedPayload[0] ^= 0xff;
    const rebuilt = packages.buildPackage(
      new TextDecoder().decode(entries.get(BACKUP_MANIFEST_ENTRY)),
      tamperedPayload,
      'deadbeef'.padEnd(64, '0'),
    );

    await expect(service.validatePackage(rebuilt)).rejects.toThrow(
      'CHECKSUM',
    );
  });

  it('rejects a wrong password at decryption', async () => {
    const service = TestBed.inject(BackupValidationService);
    const validated = await service.validatePackage(await makePackage());

    await expect(
      service.decryptPackage(validated, 'ClaveIncorrecta123'),
    ).rejects.toThrow('BACKUP_PASSWORD_OR_DATA_INVALID');
  });

  it('rejects a database version newer than the app', async () => {
    const service = TestBed.inject(BackupValidationService);
    const validated = await service.validatePackage(
      await makePackage({}, makeDumpJson(99)),
    );

    await expect(
      service.decryptPackage(validated, PASSWORD),
    ).rejects.toThrow('SCHEMA_TOO_NEW');
  });

  it('rejects a dump that is not our format', async () => {
    const service = TestBed.inject(BackupValidationService);
    const validated = await service.validatePackage(
      await makePackage({}, JSON.stringify({ database: 'sports_school' })),
    );

    await expect(
      service.decryptPackage(validated, PASSWORD),
    ).rejects.toThrow('BACKUP_JSON_INVALID');
  });

  it('rejects dumps with statements that are not CREATE', async () => {
    const service = TestBed.inject(BackupValidationService);
    const hostile = JSON.parse(makeDumpJson());
    hostile.objects.push({
      type: 'table',
      name: 'evil',
      tbl_name: 'evil',
      sql: 'DROP TABLE escuela',
    });
    const validated = await service.validatePackage(
      await makePackage({}, JSON.stringify(hostile)),
    );

    await expect(
      service.decryptPackage(validated, PASSWORD),
    ).rejects.toThrow('BACKUP_JSON_INVALID');
  });
});
