import { TestBed } from '@angular/core/testing';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  BACKUP_CHECKSUM_ENTRY,
  BACKUP_MANIFEST_ENTRY,
  BACKUP_PAYLOAD_ENTRY,
} from './backup-config';
import { BackupPackageService } from './backup-package.service';

describe('BackupPackageService', () => {
  it('round-trips the three expected entries', async () => {
    const service = TestBed.inject(BackupPackageService);
    const payload = new Uint8Array([1, 2, 3, 4]);

    const zip = service.buildPackage('{"a":1}', payload, 'deadbeef');
    const entries = await service.readPackageEntries(zip);

    expect(entries.size).toBe(3);
    expect(new TextDecoder().decode(entries.get(BACKUP_MANIFEST_ENTRY))).toBe(
      '{"a":1}',
    );
    expect(Array.from(entries.get(BACKUP_PAYLOAD_ENTRY) ?? [])).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      new TextDecoder().decode(entries.get(BACKUP_CHECKSUM_ENTRY)),
    ).toBe('deadbeef\n');
  });

  it('rejects a non-zip buffer', async () => {
    const service = TestBed.inject(BackupPackageService);
    await expect(
      service.readPackageEntries(strToU8('esto no es un zip')),
    ).rejects.toThrow('PACKAGE_INVALID_ZIP');
  });

  it('rejects an empty buffer', async () => {
    const service = TestBed.inject(BackupPackageService);
    await expect(
      service.readPackageEntries(new Uint8Array(0)),
    ).rejects.toThrow('PACKAGE_EMPTY');
  });

  it('rejects a zip missing required entries', async () => {
    const service = TestBed.inject(BackupPackageService);
    const zip = zipSync({ 'manifest.json': strToU8('{}') });

    await expect(service.readPackageEntries(zip)).rejects.toThrow(
      'PACKAGE_MISSING_ENTRIES',
    );
  });

  it('rejects packages with unexpected or suspicious entries', async () => {
    const service = TestBed.inject(BackupPackageService);
    const zip = zipSync({
      'manifest.json': strToU8('{}'),
      [BACKUP_PAYLOAD_ENTRY]: new Uint8Array([9]),
      [BACKUP_CHECKSUM_ENTRY]: strToU8('aa\n'),
      'extras/nota.txt': strToU8('y'),
    });

    await expect(service.readPackageEntries(zip)).rejects.toThrow(
      'PACKAGE_SUSPICIOUS_ENTRIES',
    );
  });
});
