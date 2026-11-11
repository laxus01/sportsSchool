import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { describe, expect, it, vi } from 'vitest';

import { FinancialSummaryService } from './financial-summary.service';

describe('FinancialSummaryService', () => {
  it('loads only active obligations with an outstanding balance for the athlete', async () => {
    const connection = {
      query: vi.fn(async () => ({
        values: [
          {
            id: 'monthly-1',
            tipo: 'mensualidad',
            periodo: '2026-11',
            fecha_vencimiento: '2026-11-30',
            descripcion: null,
            monto_pesos: '82000',
            pagado_pesos: '30000',
            pendiente_pesos: '52000',
            orden: '2026-11-30',
          },
          {
            id: 'registration-1',
            tipo: 'inscripcion',
            periodo: null,
            fecha_vencimiento: '2026-09-01',
            descripcion: null,
            monto_pesos: 45000,
            pagado_pesos: 0,
            pendiente_pesos: 45000,
            orden: '2026-09-01',
          },
          {
            id: 'charge-1',
            tipo: 'cargo_adicional',
            periodo: '2026-11-03',
            fecha_vencimiento: null,
            descripcion: 'Arbitraje del torneo',
            monto_pesos: '25000',
            pagado_pesos: '10000',
            pendiente_pesos: '15000',
            orden: '2026-11-03',
          },
        ],
      })),
    } as unknown as SQLiteDBConnection;

    const obligations = await new FinancialSummaryService().loadAthleteObligations(
      connection,
      'athlete-1',
    );

    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE m.deportista_id = ? AND m.estado = 'activa'"),
      ['athlete-1', 'athlete-1', 'athlete-1'],
    );
    expect(obligations).toEqual([
      {
        id: 'monthly-1',
        tipo: 'mensualidad',
        periodo: '2026-11',
        fecha_vencimiento: '2026-11-30',
        descripcion: null,
        monto_pesos: 82000,
        pagado_pesos: 30000,
        pendiente_pesos: 52000,
        orden: '2026-11-30',
      },
      {
        id: 'registration-1',
        tipo: 'inscripcion',
        periodo: null,
        fecha_vencimiento: '2026-09-01',
        descripcion: null,
        monto_pesos: 45000,
        pagado_pesos: 0,
        pendiente_pesos: 45000,
        orden: '2026-09-01',
      },
      {
        id: 'charge-1',
        tipo: 'cargo_adicional',
        periodo: '2026-11-03',
        fecha_vencimiento: null,
        descripcion: 'Arbitraje del torneo',
        monto_pesos: 25000,
        pagado_pesos: 10000,
        pendiente_pesos: 15000,
        orden: '2026-11-03',
      },
    ]);
  });

  it('returns an empty list when the athlete has no outstanding obligations', async () => {
    const connection = {
      query: vi.fn(async () => ({ values: [] })),
    } as unknown as SQLiteDBConnection;

    const obligations = await new FinancialSummaryService().loadAthleteObligations(
      connection,
      'athlete-1',
    );

    expect(obligations).toEqual([]);
  });

  it('includes outstanding additional charges in the athlete balance summary', async () => {
    const connection = {
      query: vi.fn(async (statement: string) =>
        statement.includes('FROM pagos')
          ? { values: [{ total: 0 }] }
          : {
              values: [
                {
                  deportista_id: 'athlete-1',
                  nombre: 'Lucía Pérez',
                  categoria: 'Infantil',
                  saldo_pendiente: '15000',
                },
              ],
            },
      ),
    } as unknown as SQLiteDBConnection;

    const summary = await new FinancialSummaryService().loadSummary(
      connection,
      '2026-11-10',
    );

    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM cargos_adicionales c'),
      ['2026-11-10', '2026-11-10'],
    );
    expect(summary.totalPending).toBe(15000);
    expect(summary.athletesWithBalance).toBe(1);
  });
});
