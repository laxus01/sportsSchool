import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { CargosAdicionalesPage } from './cargos-adicionales.page';

describe('CargosAdicionalesPage', () => {
  let fixture: ComponentFixture<CargosAdicionalesPage>;
  let connection: SQLiteDBConnection;
  let nextId: number;

  beforeEach(async () => {
    nextId = 0;
    vi.stubGlobal(
      'crypto',
      {
        randomUUID: () => {
          nextId += 1;
          return `additional-charge-test-${nextId}`;
        },
      } as unknown as Crypto,
    );
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string) => {
        if (statement.includes('FROM categorias')) {
          return { values: [{ id: 'category-1', nombre: 'Infantil' }] };
        }
        if (statement.includes('AND c.id = ?')) {
          return {
            values: [
              {
                id: 'athlete-1',
                nombres: 'Lucía',
                apellidos: 'Pérez',
                numero_documento: '123',
                categoria: 'Infantil',
              },
              {
                id: 'athlete-2',
                nombres: 'Tomás',
                apellidos: 'Díaz',
                numero_documento: '456',
                categoria: 'Infantil',
              },
            ],
          };
        }
        if (statement.includes('d.id IN')) {
          return { values: [{ id: 'athlete-1' }, { id: 'athlete-2' }] };
        }
        return { values: [] };
      }),
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

    fixture = TestBed.createComponent(CargosAdicionalesPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('filters athletes by category and creates one full-value charge per selection', async () => {
    const page = fixture.componentInstance;
    await page.openModal();
    await page.selectChargeCategory('category-1');
    page.toggleChargeAthlete('athlete-1', true);
    page.toggleChargeAthlete('athlete-2', true);
    page.additionalChargeForm.setValue({
      descripcion: 'Viáticos de transporte',
      monto: '18000',
    });

    await page.saveAdditionalCharge();

    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('AND c.id = ?'),
      [page.today, page.today, 'category-1'],
    );
    const charges = vi
      .mocked(connection.run)
      .mock.calls.filter(([statement]) =>
        String(statement).includes('INSERT INTO cargos_adicionales'),
      );
    expect(charges).toHaveLength(2);
    expect(charges.map(([, values]) => values?.[1])).toEqual([
      'athlete-1',
      'athlete-2',
    ]);
    expect(charges.map(([, values]) => values?.[3])).toEqual([18000, 18000]);
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });
});
