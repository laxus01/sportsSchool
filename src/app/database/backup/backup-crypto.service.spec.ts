import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { BackupCryptoService } from './backup-crypto.service';

describe('BackupCryptoService', () => {
  it('encrypts and decrypts a payload with the right password', async () => {
    const service = TestBed.inject(BackupCryptoService);
    const plaintext = '{"database":"sports_school","version":8}';

    const encrypted = await service.encrypt(plaintext, 'ClaveRespaldo2026');

    expect(encrypted.salt).toBeTruthy();
    expect(encrypted.nonce).toBeTruthy();
    expect(encrypted.iterations).toBeGreaterThanOrEqual(100_000);
    expect(encrypted.cipher.length).toBeGreaterThan(plaintext.length);

    const decrypted = await service.decrypt(encrypted, 'ClaveRespaldo2026');
    expect(decrypted).toBe(plaintext);
  });

  it('rejects decryption with a wrong password', async () => {
    const service = TestBed.inject(BackupCryptoService);
    const encrypted = await service.encrypt('secreto', 'ClaveRespaldo2026');

    await expect(
      service.decrypt(encrypted, 'OtraClaveDistinta'),
    ).rejects.toThrow();
  });

  it('rejects a tampered ciphertext', async () => {
    const service = TestBed.inject(BackupCryptoService);
    const encrypted = await service.encrypt('secreto', 'ClaveRespaldo2026');
    encrypted.cipher[0] ^= 0xff;

    await expect(
      service.decrypt(encrypted, 'ClaveRespaldo2026'),
    ).rejects.toThrow();
  });

  it('computes a SHA-256 hex digest', async () => {
    const service = TestBed.inject(BackupCryptoService);
    const digest = await service.sha256Hex(
      new TextEncoder().encode('abc'),
    );
    expect(digest).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
