import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Router, RouterModule } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { DeportistaFormPage } from './deportista-form.page';

describe('DeportistaFormPage', () => {
  let fixture: ComponentFixture<DeportistaFormPage>;
  let connection: SQLiteDBConnection;
  let nextId: number;
  let billingStartDate: string;

  beforeEach(async () => {
    nextId = 0;
    billingStartDate = '2000-01-01';
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
      query: vi.fn(async (statement: string) => {
        if (statement.includes('FROM categorias')) {
          return { values: [{ id: 'category-1', nombre: 'Sub 10' }] };
        }
        if (statement.includes('FROM escuela')) {
          return {
            values: [
              {
                fecha_inicio_control_pagos: billingStartDate,
                valor_inscripcion_pesos: 85000,
                dia_vencimiento_mensual: 31,
              },
            ],
          };
        }
        if (statement.includes('FROM tarifas_categoria')) {
          return { values: [{ id: 'tariff-1', monto_pesos: 82000 }] };
        }
        return {
          values: [{ id: 'guardian-1', nombres: 'Ana', apellidos: 'Rojas' }],
        };
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

    fixture = TestBed.createComponent(DeportistaFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('saves athlete details, photo, registration value and guardian relationship atomically', async () => {
    const page = fixture.componentInstance;
    page.addGuardianLink();
    page.form.patchValue({
      nombres: 'Luis',
      apellidos: 'Rojas',
      fechaNacimiento: '2015-04-12',
      fechaIngreso: page.today,
      categoriaId: 'category-1',
    });
    page.guardianLinks.at(0).patchValue({
      acudienteId: 'guardian-1',
      parentesco: 'Madre',
    });
    page.photoDataUrl.set('data:image/jpeg;base64,photo');

    await page.save();

    expect(connection.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO deportistas'),
      expect.arrayContaining([
        'test-id-1',
        'category-1',
        'Luis',
        'Rojas',
        '2015-04-12',
        'data:image/jpeg;base64,photo',
      ]),
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO deportista_categoria_historial'),
      ['test-id-2', 'test-id-1', 'category-1', page.today],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO inscripciones'),
      ['test-id-3', 'test-id-1', page.today, 85000],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO mensualidades'),
      [
        'test-id-5',
        'test-id-1',
        'tariff-1',
        page.today.slice(0, 7),
        expect.any(String),
        82000,
        null,
      ],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining('INSERT INTO deportista_acudiente'),
      ['test-id-1', 'guardian-1', 'Madre'],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });

  it('does not generate inscription or monthly charges for a legacy athlete', async () => {
    billingStartDate = '2026-11-01';
    const page = fixture.componentInstance;
    page.billingSettings.set({
      fecha_inicio_control_pagos: '2026-11-01',
      valor_inscripcion_pesos: 85000,
      dia_vencimiento_mensual: 31,
    });
    page.form.patchValue({
      nombres: 'Sofía',
      apellidos: 'Vargas',
      fechaNacimiento: '2014-08-20',
      fechaIngreso: '2026-10-30',
      categoriaId: 'category-1',
    });

    await page.save();

    expect(connection.run).toHaveBeenCalledTimes(2);
    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO deportista_categoria_historial'),
      ['test-id-2', 'test-id-1', 'category-1', '2026-10-30'],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });
});
