import { Injectable } from '@angular/core';
import { Unzip, UnzipInflate, zipSync } from 'fflate';

import {
  BACKUP_CHECKSUM_ENTRY,
  BACKUP_MANIFEST_ENTRY,
  BACKUP_MAX_ENTRY_BYTES,
  BACKUP_MAX_PACKAGE_BYTES,
  BACKUP_MAX_ZIP_ENTRIES,
  BACKUP_PAYLOAD_ENTRY,
} from './backup-config';

const EXPECTED_ENTRIES = new Set([
  BACKUP_MANIFEST_ENTRY,
  BACKUP_PAYLOAD_ENTRY,
  BACKUP_CHECKSUM_ENTRY,
]);

@Injectable({ providedIn: 'root' })
export class BackupPackageService {
  private readonly encoder = new TextEncoder();

  buildPackage(
    manifestJson: string,
    payload: Uint8Array,
    checksumHex: string,
  ): Uint8Array {
    return zipSync({
      [BACKUP_MANIFEST_ENTRY]: this.encoder.encode(manifestJson) as Uint8Array<ArrayBuffer>,
      [BACKUP_PAYLOAD_ENTRY]: payload as Uint8Array<ArrayBuffer>,
      [BACKUP_CHECKSUM_ENTRY]: this.encoder.encode(
        `${checksumHex}\n`,
      ) as Uint8Array<ArrayBuffer>,
    });
  }

  readPackageEntries(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
    if (zipBytes.length === 0) {
      return Promise.reject(new Error('PACKAGE_EMPTY'));
    }
    if (zipBytes.length > BACKUP_MAX_PACKAGE_BYTES) {
      return Promise.reject(new Error('PACKAGE_TOO_LARGE'));
    }
    if (!this.hasEndOfCentralDirectory(zipBytes)) {
      return Promise.reject(new Error('PACKAGE_INVALID_ZIP'));
    }

    return new Promise((resolve, reject) => {
      const entries = new Map<string, Uint8Array>();
      const seen = new Set<string>();
      let entryCount = 0;
      let suspicious = false;

      const unzip = new Unzip();
      unzip.register(UnzipInflate);
      unzip.onfile = (file) => {
        entryCount += 1;
        const name = file.name;
        if (
          entryCount > BACKUP_MAX_ZIP_ENTRIES ||
          seen.has(name) ||
          !EXPECTED_ENTRIES.has(name) ||
          name.startsWith('/') ||
          name.includes('..') ||
          name.includes('\\') ||
          (file.originalSize ?? 0) > BACKUP_MAX_ENTRY_BYTES
        ) {
          suspicious = true;
          return;
        }
        seen.add(name);
        const chunks: Uint8Array[] = [];
        let received = 0;
        let failed = false;
        file.ondata = (error, chunk, final) => {
          if (error || failed) {
            failed = true;
            return;
          }
          received += chunk.length;
          if (received > BACKUP_MAX_ENTRY_BYTES) {
            failed = true;
            file.terminate();
            return;
          }
          chunks.push(chunk);
          if (final) {
            const total = chunks.reduce((sum, part) => sum + part.length, 0);
            const data = new Uint8Array(total);
            let offset = 0;
            for (const part of chunks) {
              data.set(part, offset);
              offset += part.length;
            }
            entries.set(name, data);
          }
        };
        file.start();
      };

      try {
        unzip.push(zipBytes, true);
      } catch {
        reject(new Error('PACKAGE_INVALID_ZIP'));
        return;
      }

      if (suspicious) {
        reject(new Error('PACKAGE_SUSPICIOUS_ENTRIES'));
        return;
      }
      if (entries.size !== EXPECTED_ENTRIES.size) {
        reject(new Error('PACKAGE_MISSING_ENTRIES'));
        return;
      }
      resolve(entries);
    });
  }

  private hasEndOfCentralDirectory(bytes: Uint8Array): boolean {
    const start = Math.max(0, bytes.length - (22 + 0xffff));
    for (let index = bytes.length - 22; index >= start; index -= 1) {
      if (
        bytes[index] === 0x50 &&
        bytes[index + 1] === 0x4b &&
        bytes[index + 2] === 0x05 &&
        bytes[index + 3] === 0x06
      ) {
        return true;
      }
    }
    return false;
  }
}
