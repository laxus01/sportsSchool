import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { GeneracionObligacionesPage } from './generacion-obligaciones.page';

describe('GeneracionObligacionesPage', () => {
  let fixture: ComponentFixture<GeneracionObligacionesPage>;
  let connection: SQLiteDBConnection;
  let nextId: number;
  let generated: boolean;

  beforeEach(async () => {
    nextId = 0;
    generated = false;
    vi.stubGlobal(
      'crypto',
      {
        randomUUID: () => {
          nextId += 1;
          return `obligation-test-${nextId}`;
        },
      } as unknown as Crypto,
    );
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string) => {
        if (statement.includes('AS tarifa_id')) {
          return {
            values: generated
              ? []
              : [
                  {
                    deportista_id: 'athlete-1',
                    nombre: 'Lucía Pérez',
                    categoria: 'Infantil',
                    tarifa_id: 'tariff-1',
                    monto_pesos: 82000,
                  },
                ],
          };
        }
        if (statement.includes('FROM escuela')) {
          return {
            values: [
              {
                fecha_inicio_control_pagos: '2026-10-15',
                dia_vencimiento_mensual: 31,
              },
            ],
          };
        }
        return { values: [] };
      }),
      run: vi.fn(async (statement: string) => {
        if (statement.includes('INSERT INTO mensualidades')) {
          generated = true;
        }
        return {};
      }),
    } as unknown as SQLiteDBConnection;

    await TestBed.configureTestingModule({
      imports: [ManagementModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: DatabaseService,
          useValue: { getConnection: async () => connection },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneracionObligacionesPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('generates the selected period with the configured due day', async () => {
    const page = fixture.componentInstance;
    page.billingSettings.set({
      fecha_inicio_control_pagos: '2026-10-15',
      dia_vencimiento_mensual: 31,
    });
    page.billingPeriod.set('2026-11');
    page.chargeableCount.set(1);

    await page.generatePeriodCharges();

    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mensualidades'),
      [
        'obligation-test-1',
        'athlete-1',
        'tariff-1',
        '2026-11',
        '2026-11-30',
        82000,
        null,
      ],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });
});
