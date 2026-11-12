import { inject, Injectable, InjectionToken } from '@angular/core';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';

import { DatabaseService } from '../../../database/database.service';

const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_KEY_LENGTH = 256;
const REMEMBERED_USERNAME_KEY = 'sports-school.remembered-username';

export interface RememberedSessionStorage {
  getUsername(): Promise<string | null>;
  setUsername(username: string): Promise<void>;
  clear(): Promise<void>;
}

export const REMEMBERED_SESSION_STORAGE =
  new InjectionToken<RememberedSessionStorage>(
    'REMEMBERED_SESSION_STORAGE',
    {
      providedIn: 'root',
      factory: () => ({
        getUsername: async () =>
          (await Preferences.get({ key: REMEMBERED_USERNAME_KEY })).value,
        setUsername: async (username) => {
          await Preferences.set({
            key: REMEMBERED_USERNAME_KEY,
            value: username,
          });
        },
        clear: async () => {
          await Preferences.remove({ key: REMEMBERED_USERNAME_KEY });
        },
      }),
    },
  );

interface StoredUser {
  nombre_usuario: string;
  hash_clave: string;
  salt: string;
  iteraciones: number;
  activo: number;
}

interface StoredAccount extends StoredUser {
  id: string;
}

export class InitialAccountAlreadyExistsError extends Error {}
export class AuthenticationRequiredError extends Error {}
export class InvalidCurrentPasswordError extends Error {}
export class UsernameAlreadyInUseError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly database = inject(DatabaseService);
  private readonly rememberedSession = inject(REMEMBERED_SESSION_STORAGE);
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
      rememberedUsername = await this.rememberedSession.getUsername();
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
      await this.rememberedSession.clear().catch(() => undefined);
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
      await this.rememberedSession.setUsername(user.nombre_usuario);
    } else {
      await this.rememberedSession.clear();
    }

    this.authenticatedUsername = user.nombre_usuario;
    return true;
  }

  async changeUsername(
    currentPassword: string,
    newUsername: string,
  ): Promise<void> {
    const normalizedUsername = this.normalizeUsername(newUsername);
    this.validateUsername(normalizedUsername);
    const { connection, user } =
      await this.getAuthenticatedAccount(currentPassword);

    if (
      normalizedUsername.toLowerCase() === user.nombre_usuario.toLowerCase()
    ) {
      throw new Error('El nuevo usuario debe ser diferente al actual.');
    }

    const duplicate = await connection.query(
      `SELECT id
       FROM usuarios
       WHERE nombre_usuario = ?
       LIMIT 1`,
      [normalizedUsername],
    );
    if (duplicate.values?.length) {
      throw new UsernameAlreadyInUseError();
    }

    const previousUsername = user.nombre_usuario;
    await connection.beginTransaction();
    try {
      await connection.run(
        'UPDATE usuarios SET nombre_usuario = ? WHERE id = ?',
        [normalizedUsername, user.id],
        false,
      );
      await connection.commitTransaction();
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    }

    this.authenticatedUsername = normalizedUsername;
    await this.updateRememberedUsername(
      previousUsername,
      normalizedUsername,
    );
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new Error(
        `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      );
    }

    const { connection, user } =
      await this.getAuthenticatedAccount(currentPassword);
    if (newPassword === currentPassword) {
      throw new Error('La nueva contraseña debe ser diferente a la actual.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this.derivePassword(
      newPassword,
      salt,
      PASSWORD_ITERATIONS,
    );

    await connection.beginTransaction();
    try {
      await connection.run(
        `UPDATE usuarios
         SET hash_clave = ?, salt = ?, iteraciones = ?
         WHERE id = ?`,
        [hash, this.encodeBase64(salt), PASSWORD_ITERATIONS, user.id],
        false,
      );
      await connection.commitTransaction();
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.authenticatedUsername = null;
    await this.rememberedSession.clear();
  }

  private async getAuthenticatedAccount(
    currentPassword: string,
  ): Promise<{ connection: SQLiteDBConnection; user: StoredAccount }> {
    if (!this.authenticatedUsername) {
      throw new AuthenticationRequiredError();
    }

    const connection = await this.database.getMaintenanceConnection();
    const result = await connection.query(
      `SELECT id, nombre_usuario, hash_clave, salt, iteraciones, activo
       FROM usuarios
       WHERE nombre_usuario = ?
       LIMIT 1`,
      [this.authenticatedUsername],
    );
    const user = result.values?.[0] as StoredAccount | undefined;

    if (!user || Number(user.activo) !== 1) {
      this.authenticatedUsername = null;
      throw new AuthenticationRequiredError();
    }

    const candidateHash = await this.derivePassword(
      currentPassword,
      this.decodeBase64(user.salt),
      Number(user.iteraciones),
    );
    if (!this.constantTimeEquals(candidateHash, user.hash_clave)) {
      throw new InvalidCurrentPasswordError();
    }

    return { connection, user };
  }

  private async updateRememberedUsername(
    currentUsername: string,
    newUsername: string,
  ): Promise<void> {
    try {
      const value = await this.rememberedSession.getUsername();
      if (
        value &&
        this.normalizeUsername(value).toLowerCase() ===
          currentUsername.toLowerCase()
      ) {
        await this.rememberedSession.setUsername(newUsername);
      }
    } catch {
      return;
    }
  }

  private normalizeUsername(username: string): string {
    return username.trim();
  }

  private validateUsername(username: string): void {
    if (username.length < 3 || username.length > 50) {
      throw new Error('El usuario debe tener entre 3 y 50 caracteres.');
    }
  }

  private validateCredentials(
    username: string,
    password: string,
    requireStrongPassword: boolean,
  ): void {
    this.validateUsername(username);
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
