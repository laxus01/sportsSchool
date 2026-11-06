import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { describe, expect, it, vi } from 'vitest';

import { seedDemoPaymentData } from './demo-payment-data';

describe('seedDemoPaymentData', () => {
  it('loads the payment test scenarios transactionally into an empty database', async () => {
    const database = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ values: [{ total: 0 }] })),
      run: vi.fn(async () => ({})),
    } as unknown as SQLiteDBConnection;

    await seedDemoPaymentData(database, 'admin-demo');

    expect(database.commitTransaction).toHaveBeenCalledOnce();
    expect(database.rollbackTransaction).not.toHaveBeenCalled();
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO escuela'),
      expect.arrayContaining([
        'Club Deportivo Demo Halcones',
        '2026-11-01',
        50000,
        10,
      ]),
      false,
    );
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pago_inscripcion'),
      [],
      false,
    );
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pago_mensualidad'),
      [],
      false,
    );
  });

  it('refuses to add sample records when the database already has data', async () => {
    const database = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ values: [{ total: 1 }] })),
      run: vi.fn(async () => ({})),
    } as unknown as SQLiteDBConnection;

    await expect(seedDemoPaymentData(database, 'admin-demo')).rejects.toThrow(
      'DEMO_REQUIRES_EMPTY_DATABASE',
    );

    expect(database.run).not.toHaveBeenCalled();
    expect(database.rollbackTransaction).toHaveBeenCalledOnce();
  });
});
