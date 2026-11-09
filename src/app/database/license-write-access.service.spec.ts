import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { describe, expect, it, vi } from 'vitest';

import {
  LicenseWriteAccessService,
  OperationalWriteBlockedError,
} from './license-write-access.service';

describe('LicenseWriteAccessService', () => {
  const createConnection = () =>
    ({
      run: vi.fn(async () => ({})),
      execute: vi.fn(async () => ({})),
      executeSet: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ values: [] })),
    }) as unknown as SQLiteDBConnection;

  it('preserves writes until license enforcement is configured', async () => {
    const access = new LicenseWriteAccessService();
    const connection = createConnection();
    const guarded = access.guardConnection(connection);

    await guarded.run('INSERT INTO deportistas (id) VALUES (?)', ['athlete-1']);

    expect(connection.run).toHaveBeenCalledOnce();
  });

  it('blocks mutating methods before reaching SQLite when access is denied', () => {
    const access = new LicenseWriteAccessService();
    const connection = createConnection();
    const guarded = access.guardConnection(connection);
    access.setOperationalWritesAllowed(false);

    expect(() =>
      guarded.run('DELETE FROM deportistas WHERE id = ?', ['athlete-1']),
    ).toThrow(OperationalWriteBlockedError);
    expect(() => guarded.execute('DROP TABLE deportistas')).toThrow(
      OperationalWriteBlockedError,
    );
    expect(() => guarded.query('DELETE FROM deportistas')).toThrow(
      OperationalWriteBlockedError,
    );
    expect(() =>
      guarded.query('SELECT 1; DELETE FROM deportistas'),
    ).toThrow(OperationalWriteBlockedError);
    expect(connection.run).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('continues to allow reads and integrity checks while operational writes are blocked', async () => {
    const access = new LicenseWriteAccessService();
    const connection = createConnection();
    const guarded = access.guardConnection(connection);
    access.setOperationalWritesAllowed(false);

    await guarded.query('SELECT * FROM deportistas');
    await guarded.query('PRAGMA integrity_check');

    expect(connection.query).toHaveBeenCalledTimes(2);
  });
});
