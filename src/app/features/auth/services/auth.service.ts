import { inject, Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { DatabaseService } from '../../../database/database.service';

const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_KEY_LENGTH = 256;
const REMEMBERED_USERNAME_KEY = 'sports-school.remembered-username';

interface StoredUser {
  nombre_usuario: string;
  hash_clave: string;
  salt: string;
  iteraciones: number;
  activo: number;
}

export class InitialAccountAlreadyExistsError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly database = inject(DatabaseService);
  private authenticatedUsername: string | null = null;

  get isAuthenticated(): boolean {
    return this.authenticatedUsername !== null;
  }

  get currentUsername(): string | null {
    return this.authenticatedUsername;
  }

  async restoreSession(): Promise<boolean> {
    let rememberedUsername: string | null;
    try {
      rememberedUsername = (
        await Preferences.get({ key: REMEMBERED_USERNAME_KEY })
      ).value;
    } catch {
      return false;
    }

    if (!rememberedUsername) {
      return false;
    }

    const normalizedUsername = this.normalizeUsername(rememberedUsername);
    const connection = await this.database.getMaintenanceConnection();
    const result = await connection.query(
      `SELECT nombre_usuario, activo
       FROM usuarios
       WHERE nombre_usuario = ?
       LIMIT 1`,
      [normalizedUsername],
    );
    const user = result.values?.[0] as
      | Pick<StoredUser, 'nombre_usuario' | 'activo'>
      | undefined;

    if (!user || Number(user.activo) !== 1) {
      await Preferences.remove({ key: REMEMBERED_USERNAME_KEY }).catch(
        () => undefined,
      );
      return false;
    }

    this.authenticatedUsername = user.nombre_usuario;
    return true;
  }

  async hasAccounts(): Promise<boolean> {
    const connection = await this.database.getMaintenanceConnection();
    const result = await connection.query(
      'SELECT COUNT(*) AS total FROM usuarios',
    );

    return Number(result.values?.[0]?.['total'] ?? 0) > 0;
  }

  async createInitialAccount(username: string, password: string): Promise<void> {
    const normalizedUsername = this.normalizeUsername(username);
    this.validateCredentials(normalizedUsername, password, true);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this.derivePassword(password, salt, PASSWORD_ITERATIONS);
    const connection = await this.database.getMaintenanceConnection();

    await connection.beginTransaction();
    try {
      const result = await connection.query(
        'SELECT COUNT(*) AS total FROM usuarios',
      );
      if (Number(result.values?.[0]?.['total'] ?? 0) > 0) {
        throw new InitialAccountAlreadyExistsError();
      }

      await connection.run(
        `INSERT INTO usuarios
          (id, nombre_usuario, hash_clave, salt, iteraciones)
         VALUES (?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          normalizedUsername,
          hash,
          this.encodeBase64(salt),
          PASSWORD_ITERATIONS,
        ],
        false,
      );
      await connection.commitTransaction();
      this.authenticatedUsername = normalizedUsername;
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    }
  }

  async login(
    username: string,
    password: string,
    rememberMe = false,
  ): Promise<boolean> {
    const normalizedUsername = this.normalizeUsername(username);
    const connection = await this.database.getMaintenanceConnection();
    const result = await connection.query(
      `SELECT nombre_usuario, hash_clave, salt, iteraciones, activo
       FROM usuarios
       WHERE nombre_usuario = ?
       LIMIT 1`,
      [normalizedUsername],
    );
    const user = result.values?.[0] as StoredUser | undefined;

    if (!user || Number(user.activo) !== 1) {
      await this.logout();
      return false;
    }

    const candidateHash = await this.derivePassword(
      password,
      this.decodeBase64(user.salt),
      Number(user.iteraciones),
    );
    if (!this.constantTimeEquals(candidateHash, user.hash_clave)) {
      await this.logout();
      return false;
    }

    if (rememberMe) {
      await Preferences.set({
        key: REMEMBERED_USERNAME_KEY,
        value: user.nombre_usuario,
      });
    } else {
      await Preferences.remove({ key: REMEMBERED_USERNAME_KEY });
    }

    this.authenticatedUsername = user.nombre_usuario;
    return true;
  }

  async logout(): Promise<void> {
    this.authenticatedUsername = null;
    await Preferences.remove({ key: REMEMBERED_USERNAME_KEY });
  }

  private normalizeUsername(username: string): string {
    return username.trim();
  }

  private validateCredentials(
    username: string,
    password: string,
    requireStrongPassword: boolean,
  ): void {
    if (username.length < 3 || username.length > 50) {
      throw new Error('El usuario debe tener entre 3 y 50 caracteres.');
    }
    if (requireStrongPassword && password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(
        `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      );
    }
  }

  private async derivePassword(
    password: string,
    salt: Uint8Array,
    iterations: number,
  ): Promise<string> {
    // PBKDF2 keeps only a salted, slow-to-derive verifier in the local database.
    const saltBuffer = new ArrayBuffer(salt.byteLength);
    new Uint8Array(saltBuffer).set(salt);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBuffer, iterations, hash: 'SHA-256' },
      keyMaterial,
      PASSWORD_KEY_LENGTH,
    );

    return this.encodeBase64(new Uint8Array(derivedBits));
  }

  private encodeBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  private decodeBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  private constantTimeEquals(left: string, right: string): boolean {
    if (left.length !== right.length) {
      return false;
    }

    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }
}
