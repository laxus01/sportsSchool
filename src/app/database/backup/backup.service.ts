import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../database.service';
import {
  BACKUP_APPLICATION,
  BACKUP_APPLICATION_VERSION,
  BACKUP_DATABASE_NAME,
  BACKUP_FILE_PREFIX,
  BACKUP_FORMAT_VERSION,
  BACKUP_MIN_PASSWORD_LENGTH,
} from './backup-config';
import { BackupCryptoService } from './backup-crypto.service';
import { BackupFileService } from './backup-file.service';
import { BackupHistoryService } from './backup-history.service';
import { BackupLockService } from './backup-lock.service';
import {
  BackupManifest,
  BackupResult,
  ExportedDatabase,
} from './backup.models';
import { BackupPackageService } from './backup-package.service';
import { SqliteDumpService } from './sqlite-dump.service';

interface BuiltBackup {
  fileName: string;
  data: Uint8Array;
  manifest: BackupManifest;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly database = inject(DatabaseService);
  private readonly lock = inject(BackupLockService);
  private readonly crypto = inject(BackupCryptoService);
  private readonly packages = inject(BackupPackageService);
  private readonly files = inject(BackupFileService);
  private readonly history = inject(BackupHistoryService);
  private readonly dumps = inject(SqliteDumpService);

  readonly isBusy = this.lock.isBusy;

  async createBackup(password: string): Promise<BackupResult> {
    if (password.length < BACKUP_MIN_PASSWORD_LENGTH) {
      return { success: false, error: 'BACKUP_PASSWORD_TOO_SHORT' };
    }
    try {
      const { built, saved } = await this.lock.runExclusive(async () => {
        const built = await this.buildBackup(password);
        const saved = await this.files.saveBackupToCache(
          built.fileName,
          built.data,
        );
        return { built, saved };
      });
      await this.history.setLastBackup(saved);
      await this.history.record({
        type: 'backup',
        fileName: built.fileName,
        size: built.data.length,
        status: 'success',
      });
      return {
        success: true,
        fileName: built.fileName,
        filePath: saved.path,
        size: built.data.length,
        createdAt: saved.createdAt,
      };
    } catch (error) {
      await this.history.record({
        type: 'backup',
        fileName: '-',
        status: 'error',
        message: this.safeMessage(error),
      });
      return { success: false, error: this.safeMessage(error) };
    }
  }

  async exportDatabaseJson(): Promise<ExportedDatabase> {
    return this.lock.runExclusive(() => this.exportDatabaseJsonInternal());
  }

  private async buildBackup(password: string): Promise<BuiltBackup> {
    const exported = await this.exportDatabaseJsonInternal();
    const encrypted = await this.crypto.encrypt(exported.json, password);
    const checksum = await this.crypto.sha256Hex(encrypted.cipher);
    const createdAt = new Date();
    const manifest: BackupManifest = {
      application: BACKUP_APPLICATION,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      applicationVersion: BACKUP_APPLICATION_VERSION,
      databaseVersion: exported.databaseVersion,
      createdAt: createdAt.toISOString(),
      database: BACKUP_DATABASE_NAME,
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
      integrity: {
        algorithm: 'SHA-256',
        checksum,
      },
    };
    const data = this.packages.buildPackage(
      JSON.stringify(manifest),
      encrypted.cipher,
      checksum,
    );
    return {
      fileName: this.buildFileName(createdAt),
      data,
      manifest,
    };
  }

  private async exportDatabaseJsonInternal(): Promise<ExportedDatabase> {
    const connection = await this.database.getConnection();
    const { json, schemaVersion } = await this.dumps.exportDump(connection);
    return { json, databaseVersion: schemaVersion };
  }

  private buildFileName(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp =
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `-${pad(date.getHours())}${pad(date.getMinutes())}`;
    return `${BACKUP_FILE_PREFIX}_${stamp}.zip`;
  }

  private safeMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error ?? 'UNKNOWN');
    return message.replace(/\s+/g, ' ').slice(0, 200);
  }
}
