import { Injectable } from '@angular/core';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

export class OperationalWriteBlockedError extends Error {
  readonly code = 'OPERATIONAL_WRITES_BLOCKED';

  constructor() {
    super('La licencia no permite modificar datos en este momento.');
    this.name = 'OperationalWriteBlockedError';
  }
}

@Injectable({ providedIn: 'root' })
export class LicenseWriteAccessService {
  private operationalWritesAllowed = Capacitor.getPlatform() !== 'android';
  private readonly guardedConnections = new WeakMap<
    SQLiteDBConnection,
    SQLiteDBConnection
  >();

  setOperationalWritesAllowed(allowed: boolean | null): void {
    this.operationalWritesAllowed =
      allowed ?? Capacitor.getPlatform() !== 'android';
  }

  assertOperationalWriteAllowed(): void {
    if (this.operationalWritesAllowed === false) {
      throw new OperationalWriteBlockedError();
    }
  }

  guardConnection(connection: SQLiteDBConnection): SQLiteDBConnection {
    const existing = this.guardedConnections.get(connection);
    if (existing) {
      return existing;
    }

    const guardedMethods = new Set(['run', 'execute', 'executeSet']);
    const guardedConnection = new Proxy(connection, {
      get: (target, property) => {
        const method = Reflect.get(target, property, target);
        if (typeof method !== 'function') {
          return method;
        }

        if (guardedMethods.has(String(property))) {
          return (...args: unknown[]) => {
            this.assertOperationalWriteAllowed();
            return Reflect.apply(method, target, args);
          };
        }

        if (property === 'query') {
          return (...args: unknown[]) => {
            if (!this.isReadOnlyQuery(args[0])) {
              this.assertOperationalWriteAllowed();
            }
            return Reflect.apply(method, target, args);
          };
        }

        return method.bind(target);
      },
    });

    this.guardedConnections.set(connection, guardedConnection);
    return guardedConnection;
  }

  private isReadOnlyQuery(statement: unknown): boolean {
    if (typeof statement !== 'string') {
      return false;
    }

    const normalized = statement.trim().replace(/;$/, '').trim();
    if (normalized.includes(';')) {
      return false;
    }

    return (
      /^SELECT\b/i.test(normalized) ||
      /^PRAGMA\s+(integrity_check|foreign_key_check)\b/i.test(normalized)
    );
  }
}
