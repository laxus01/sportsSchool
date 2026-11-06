import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { CategoriasPage } from './categorias.page';

describe('CategoriasPage', () => {
  let fixture: ComponentFixture<CategoriasPage>;
  let connection: SQLiteDBConnection;
  let tariffs: Array<{
    id: string;
    vigente_desde: string;
    vigente_hasta: string | null;
  }>;
  let nextId: number;

  beforeEach(async () => {
    tariffs = [];
    nextId = 0;
    vi.stubGlobal(
      'crypto',
      {
        randomUUID: () => {
          nextId += 1;
          return `test-id-${nextId}`;
        },
      } as unknown as Crypto,
    );

    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string) => ({
        values: statement.includes('FROM tarifas_categoria\n')
          ? tariffs
          : [],
      })),
      run: vi.fn(async () => ({})),
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

    fixture = TestBed.createComponent(CategoriasPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('creates a category and its initial monthly tariff atomically', async () => {
    const page = fixture.componentInstance;
    page.openNewCategory();
    const effectiveDate = page.categoryForm.controls.vigenteDesde.value;
    page.categoryForm.setValue({
      nombre: 'Infantil',
      descripcion: 'Grupo inicial',
      montoMensual: '80000',
      vigenteDesde: effectiveDate,
    });

    await page.createCategory();

    expect(connection.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO categorias'),
      ['test-id-1', 'Infantil', 'Grupo inicial'],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO tarifas_categoria'),
      ['test-id-2', 'test-id-1', 80000, effectiveDate],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });

  it('closes the previous tariff when adjusting the monthly amount', async () => {
    tariffs = [
      {
        id: 'tarifa-anterior',
        vigente_desde: '2026-01-01',
        vigente_hasta: null,
      },
    ];
    const page = fixture.componentInstance;
    page.openTariffAdjustment({
      id: 'categoria-1',
      nombre: 'Infantil',
      descripcion: null,
      tarifa_id: 'tarifa-anterior',
      monto_pesos: 80000,
      vigente_desde: '2026-01-01',
    });
    page.tariffForm.setValue({
      montoMensual: '95000',
      vigenteDesde: '2026-12-01',
    });

    await page.adjustMonthlyFee();

    expect(connection.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE tarifas_categoria'),
      ['2026-11-30', 'tarifa-anterior'],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO tarifas_categoria'),
      ['test-id-1', 'categoria-1', 95000, '2026-12-01', null],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });
});
