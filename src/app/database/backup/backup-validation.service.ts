import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../database.service';
import {
  BACKUP_APPLICATION,
  BACKUP_CHECKSUM_ENTRY,
  BACKUP_DATABASE_NAME,
  BACKUP_FORMAT_VERSION,
  BACKUP_MANIFEST_ENTRY,
  BACKUP_PAYLOAD_ENTRY,
} from './backup-config';
import { BackupCryptoService } from './backup-crypto.service';
import {
  BackupManifest,
  DecryptedBackup,
  SqliteDump,
  ValidatedBackupPackage,
} from './backup.models';
import { BackupPackageService } from './backup-package.service';
import {
  DUMP_FORMAT,
  DUMP_FORMAT_VERSION,
} from './sqlite-dump.service';

const CHECKSUM_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const SAFE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_OBJECT_TYPES = new Set([
  'table',
  'index',
  'trigger',
  'view',
]);
const CREATE_STATEMENT_PATTERN =
  /^CREATE\s+(UNIQUE\s+INDEX|INDEX|TABLE|TRIGGER|VIEW)\b/i;
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 5_000_000;

@Injectable({ providedIn: 'root' })
export class BackupValidationService {
  private readonly packages = inject(BackupPackageService);
  private readonly crypto = inject(BackupCryptoService);
  private readonly database = inject(DatabaseService);

  async validatePackage(
    zipBytes: Uint8Array,
  ): Promise<ValidatedBackupPackage> {
    const entries = await this.packages.readPackageEntries(zipBytes);

    const manifest = this.parseManifest(
      new TextDecoder().decode(entries.get(BACKUP_MANIFEST_ENTRY)),
    );
    this.assertManifest(manifest);

    const payload = entries.get(BACKUP_PAYLOAD_ENTRY)!;
    const checksumFile = new TextDecoder()
      .decode(entries.get(BACKUP_CHECKSUM_ENTRY))
      .trim();
    if (checksumFile !== manifest.integrity.checksum) {
      throw new Error('CHECKSUM_FILE_MISMATCH');
    }
    const computed = await this.crypto.sha256Hex(payload);
    if (computed.toLowerCase() !== manifest.integrity.checksum.toLowerCase()) {
      throw new Error('CHECKSUM_MISMATCH');
    }
    return { manifest, payload };
  }

  async decryptPackage(
    validated: ValidatedBackupPackage,
    password: string,
  ): Promise<DecryptedBackup> {
    const { manifest } = validated;
    let databaseJson: string;
    try {
      databaseJson = await this.crypto.decrypt(
        {
          cipher: validated.payload,
          salt: manifest.encryption.salt,
          nonce: manifest.encryption.nonce,
          iterations: manifest.encryption.iterations,
        },
        password,
      );
    } catch {
      throw new Error('BACKUP_PASSWORD_OR_DATA_INVALID');
    }

    const dump = this.parseDump(databaseJson);
    const currentDbVersion = await this.currentDatabaseVersion();
    if (dump.schemaVersion > currentDbVersion) {
      throw new Error('SCHEMA_TOO_NEW');
    }

    return { manifest, dump };
  }

  private parseDump(databaseJson: string): SqliteDump {
    let parsed: SqliteDump;
    try {
      parsed = JSON.parse(databaseJson) as SqliteDump;
    } catch {
      throw new Error('BACKUP_JSON_INVALID');
    }
    if (
      parsed.format !== DUMP_FORMAT ||
      parsed.formatVersion !== DUMP_FORMAT_VERSION ||
      parsed.database !== BACKUP_DATABASE_NAME ||
      !Number.isInteger(parsed.schemaVersion) ||
      parsed.schemaVersion < 1 ||
      !Array.isArray(parsed.objects) ||
      typeof parsed.data !== 'object' ||
      parsed.data === null ||
      Array.isArray(parsed.data)
    ) {
      throw new Error('BACKUP_JSON_INVALID');
    }
    for (const object of parsed.objects) {
      if (
        typeof object !== 'object' ||
        object === null ||
        !ALLOWED_OBJECT_TYPES.has(object.type) ||
        typeof object.name !== 'string' ||
        !SAFE_NAME_PATTERN.test(object.name) ||
        typeof object.sql !== 'string' ||
        !CREATE_STATEMENT_PATTERN.test(object.sql.trimStart())
      ) {
        throw new Error('BACKUP_JSON_INVALID');
      }
      if (object.type !== 'trigger' && object.sql.includes(';')) {
        throw new Error('BACKUP_JSON_INVALID');
      }
    }
    for (const [table, rows] of Object.entries(parsed.data)) {
      if (!SAFE_NAME_PATTERN.test(table) || !Array.isArray(rows)) {
        throw new Error('BACKUP_JSON_INVALID');
      }
      for (const row of rows) {
        if (typeof row !== 'object' || row === null || Array.isArray(row)) {
          throw new Error('BACKUP_JSON_INVALID');
        }
      }
    }
    return parsed;
  }

  private async currentDatabaseVersion(): Promise<number> {
    const connection = await this.database.getConnection();
    const result = await connection.query(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    );
    return Number(result.values?.[0]?.['version'] ?? 0);
  }

  private parseManifest(raw: string): BackupManifest {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('MANIFEST_MALFORMED');
    }
    return parsed as BackupManifest;
  }

  private assertManifest(manifest: BackupManifest): void {
    if (manifest.application !== BACKUP_APPLICATION) {
      throw new Error('MANIFEST_FOREIGN_APP');
    }
    if (manifest.backupFormatVersion !== BACKUP_FORMAT_VERSION) {
      throw new Error('MANIFEST_UNSUPPORTED_FORMAT');
    }
    if (manifest.database !== BACKUP_DATABASE_NAME) {
      throw new Error('MANIFEST_WRONG_DATABASE');
    }
    const encryption = manifest.encryption;
    if (
      !encryption ||
      encryption.enabled !== true ||
      encryption.algorithm !== 'AES-256-GCM' ||
      encryption.kdf !== 'PBKDF2-HMAC-SHA256' ||
      !Number.isInteger(encryption.iterations) ||
      encryption.iterations < MIN_PBKDF2_ITERATIONS ||
      encryption.iterations > MAX_PBKDF2_ITERATIONS ||
      typeof encryption.salt !== 'string' ||
      !BASE64_PATTERN.test(encryption.salt) ||
      typeof encryption.nonce !== 'string' ||
      !BASE64_PATTERN.test(encryption.nonce)
    ) {
      throw new Error('MANIFEST_ENCRYPTION_INVALID');
    }
    if (
      manifest.integrity?.algorithm !== 'SHA-256' ||
      typeof manifest.integrity.checksum !== 'string' ||
      !CHECKSUM_HEX_PATTERN.test(manifest.integrity.checksum)
    ) {
      throw new Error('MANIFEST_INTEGRITY_INVALID');
    }
  }
}
