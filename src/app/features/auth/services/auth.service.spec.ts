import { TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../database/database.service';
import { AuthService } from './auth.service';

interface StoredCredential {
  id: string;
  nombre_usuario: string;
  hash_clave: string;
  salt: string;
  iteraciones: number;
  activo: number;
}

describe('AuthService', () => {
  let users: StoredCredential[];
  let preferences: Map<string, string>;
  let connection: SQLiteDBConnection;

  beforeEach(() => {
    preferences = new Map();
    vi.spyOn(Preferences, 'get').mockImplementation(async ({ key }) => ({
      value: preferences.get(key) ?? null,
    }));
    vi.spyOn(Preferences, 'set').mockImplementation(async ({ key, value }) => {
      preferences.set(key, value);
    });
    vi.spyOn(Preferences, 'remove').mockImplementation(async ({ key }) => {
      preferences.delete(key);
    });
    vi.stubGlobal(
      'crypto',
      {
        getRandomValues: (value: Uint8Array) => {
          value.fill(42);
          return value;
        },
        randomUUID: () => 'test-user-id',
        subtle: {
          importKey: async (_format: string, keyData: BufferSource) =>
            keyData as unknown as CryptoKey,
          deriveBits: async (
            parameters: Pbkdf2Params,
            keyMaterial: CryptoKey,
            bitLength: number,
          ) => {
            const passwordBytes = keyMaterial as unknown as Uint8Array;
            const saltBytes = new Uint8Array(parameters.salt as ArrayBuffer);
            const hash = new Uint8Array(bitLength / 8);
            for (let index = 0; index < hash.length; index += 1) {
              hash[index] =
                passwordBytes[index % passwordBytes.length] ^
                saltBytes[index % saltBytes.length];
            }
            return hash.buffer;
          },
        },
      } as unknown as Crypto,
    );
    users = [];
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string, values?: unknown[]) => {
        if (statement.includes('COUNT(*)')) {
          return { values: [{ total: users.length }] };
        }

        const username = String(values?.[0] ?? '').toLowerCase();
        return {
          values: users.filter(
            (user) => user.nombre_usuario.toLowerCase() === username,
          ),
        };
      }),
      run: vi.fn(async (_statement: string, values?: unknown[]) => {
        users.push({
          id: String(values?.[0]),
          nombre_usuario: String(values?.[1]),
          hash_clave: String(values?.[2]),
          salt: String(values?.[3]),
          iteraciones: Number(values?.[4]),
          activo: 1,
        });
        return {};
      }),
    } as unknown as SQLiteDBConnection;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: DatabaseService,
          useValue: { getMaintenanceConnection: async () => connection },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores a password verifier and authenticates with the matching password', async () => {
    const auth = TestBed.inject(AuthService);
    const password = 'EscuelaDeportiva2026!';

    await auth.createInitialAccount('  coach  ', password);

    expect(users).toHaveLength(1);
    expect(users[0].nombre_usuario).toBe('coach');
    expect(users[0].hash_clave).not.toBe(password);
    expect(users[0].salt).toBeTruthy();
    expect(users[0].iteraciones).toBe(600_000);

    await auth.logout();
    expect(await auth.login('COACH', 'incorrecta')).toBe(false);
    expect(await auth.login(' COACH ', password)).toBe(true);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.currentUsername).toBe('coach');
  });

  it('restores a remembered session and clears it when logging out', async () => {
    const auth = TestBed.inject(AuthService);
    const password = 'EscuelaDeportiva2026!';

    await auth.createInitialAccount('coach', password);
    await auth.logout();
    expect(await auth.login('coach', password, true)).toBe(true);
    expect(preferences.get('sports-school.remembered-username')).toBe('coach');

    const restartedAuth = TestBed.runInInjectionContext(
      () => new AuthService(),
    );
    expect(await restartedAuth.restoreSession()).toBe(true);
    expect(restartedAuth.currentUsername).toBe('coach');

    await restartedAuth.logout();
    expect(preferences.has('sports-school.remembered-username')).toBe(false);
  });

  it('does not retain the session when remember me is disabled', async () => {
    const auth = TestBed.inject(AuthService);
    const password = 'EscuelaDeportiva2026!';

    await auth.createInitialAccount('coach', password);
    await auth.logout();
    expect(await auth.login('coach', password)).toBe(true);
    expect(preferences.has('sports-school.remembered-username')).toBe(false);
  });
});
