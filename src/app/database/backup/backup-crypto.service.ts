import { Injectable } from '@angular/core';

import { BACKUP_PBKDF2_ITERATIONS } from './backup-config';

export interface EncryptedPayload {
  cipher: Uint8Array;
  salt: string;
  nonce: string;
  iterations: number;
}

export interface DecryptionInput {
  cipher: Uint8Array;
  salt: string;
  nonce: string;
  iterations: number;
}

const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const CHUNK_SIZE = 0x8000;

@Injectable({ providedIn: 'root' })
export class BackupCryptoService {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  async encrypt(plaintext: string, password: string): Promise<EncryptedPayload> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const key = await this.deriveKey(
      password,
      salt,
      BACKUP_PBKDF2_ITERATIONS,
    );
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource },
        key,
        this.encoder.encode(plaintext) as BufferSource,
      ),
    );
    return {
      cipher,
      salt: this.toBase64(salt),
      nonce: this.toBase64(nonce),
      iterations: BACKUP_PBKDF2_ITERATIONS,
    };
  }

  async decrypt(input: DecryptionInput, password: string): Promise<string> {
    const key = await this.deriveKey(
      password,
      this.fromBase64(input.salt),
      input.iterations,
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.fromBase64(input.nonce) as BufferSource },
      key,
      input.cipher as BufferSource,
    );
    return this.decoder.decode(plain);
  }

  async sha256Hex(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      data as BufferSource,
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private async deriveKey(
    password: string,
    salt: Uint8Array,
    iterations: number,
  ): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(password) as BufferSource,
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
      binary += String.fromCharCode(
        ...bytes.subarray(index, index + CHUNK_SIZE),
      );
    }
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
}
