import { Injectable } from '@angular/core';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

import { normalizeSqlTextValues } from './uppercase-text-normalizer';

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
            return Reflect.apply(
              method,
              target,
              this.normalizeWriteArguments(String(property), args),
            );
          };
        }

        if (property === 'query') {
          return (...args: unknown[]) => {
            const isReadOnly = this.isReadOnlyQuery(args[0]);
            if (!isReadOnly) {
              this.assertOperationalWriteAllowed();
            }
            return Reflect.apply(
              method,
              target,
              isReadOnly
                ? args
                : this.normalizeWriteArguments(String(property), args),
            );
          };
        }

        return method.bind(target);
      },
    });

    this.guardedConnections.set(connection, guardedConnection);
    return guardedConnection;
  }

  private normalizeWriteArguments(
    method: string,
    args: unknown[],
  ): unknown[] {
    const normalizedArgs = [...args];
    const statement = args[0];

    if (
      (method === 'run' || method === 'query') &&
      typeof statement === 'string'
    ) {
      normalizedArgs[1] = normalizeSqlTextValues(statement, args[1]);
      return normalizedArgs;
    }

    if (method === 'executeSet' && Array.isArray(args[0])) {
      normalizedArgs[0] = args[0].map((entry: unknown) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('statement' in entry) ||
          typeof entry.statement !== 'string' ||
          !('values' in entry)
        ) {
          return entry;
        }
        return {
          ...entry,
          values: normalizeSqlTextValues(entry.statement, entry.values),
        };
      });
    }

    return normalizedArgs;
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
