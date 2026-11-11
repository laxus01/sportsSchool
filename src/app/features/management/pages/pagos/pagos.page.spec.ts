import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { PagosPage } from './pagos.page';

describe('PagosPage', () => {
  let fixture: ComponentFixture<PagosPage>;
  let connection: SQLiteDBConnection;
  let nextId: number;
  let freshPendingRows: Array<Record<string, unknown>>;

  beforeEach(async () => {
    nextId = 0;
    freshPendingRows = [
      {
        id: 'monthly-1',
        tipo: 'mensualidad',
        periodo: '2026-11',
        fecha_vencimiento: '2026-11-30',
        monto_pesos: 82000,
        pagado_pesos: 0,
        pendiente_pesos: 82000,
        orden: '2026-11-30',
      },
    ];
    vi.stubGlobal(
      'crypto',
      {
        randomUUID: () => {
          nextId += 1;
          return `payment-test-${nextId}`;
        },
      } as unknown as Crypto,
    );
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string) => {
        if (statement.includes("'mensualidad' AS tipo")) {
          return { values: freshPendingRows };
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

    fixture = TestBed.createComponent(PagosPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('keeps the financial summary on its dedicated page', () => {
    expect(
      fixture.nativeElement.querySelector('.summary-section'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(
      'RESUMEN FINANCIERO',
    );
  });

  it('keeps obligation generation and additional charge assignment out of payments', () => {
    const text = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelector('.initial-charges')).toBeNull();
    expect(text).not.toContain('GENERACIÓN DE OBLIGACIONES');
    expect(text).not.toContain('CARGOS ADICIONALES');
  });

  it('formats periods with a Spanish month name and year', () => {
    expect(fixture.componentInstance.formatPeriod('2026-11')).toBe(
      'Noviembre 2026',
    );
  });

  it('shows monthly and inscription concepts in separate rows', () => {
    expect(
      fixture.componentInstance.paymentConceptRows({
        id: 'payment-1',
        fecha_pago: '2026-11-05',
        monto_pesos: 100000,
        medio_pago: 'efectivo',
        entidad: null,
        referencia: null,
        observacion: null,
        deportistas: 'Lucía Pérez',
        periodos: '2026-11,Inscripción,2026-10',
        estado: 'registrado',
        motivo_anulacion: null,
      }),
    ).toEqual([
      { label: 'Mensualidad', value: 'Octubre 2026' },
      { label: 'Mensualidad', value: 'Noviembre 2026' },
      { label: 'Inscripción', value: 'Incluida' },
    ]);
  });

  it('shows additional charge descriptions in payment concepts', () => {
    expect(
      fixture.componentInstance.paymentConceptRows({
        id: 'payment-1',
        fecha_pago: '2026-11-05',
        monto_pesos: 15000,
        medio_pago: 'efectivo',
        entidad: null,
        referencia: null,
        observacion: null,
        deportistas: 'Lucía Pérez',
        periodos: null,
        cargos: 'Arbitraje del torneo',
        estado: 'registrado',
        motivo_anulacion: null,
      }),
    ).toEqual([
      { label: 'Cargo adicional', value: 'Arbitraje del torneo' },
    ]);
  });

  it('applies a partial payment to the selected monthly charge', async () => {
    const page = fixture.componentInstance;
    page.selectedAthlete.set({
      id: 'athlete-1',
      nombres: 'Lucía',
      apellidos: 'Pérez',
      numero_documento: '123',
      categoria: 'Infantil',
    });
    page.pendingObligations.set([
      {
        id: 'monthly-1',
        tipo: 'mensualidad',
        periodo: '2026-10',
        fecha_vencimiento: '2026-10-31',
        monto_pesos: 82000,
        pagado_pesos: 0,
        pendiente_pesos: 82000,
        orden: '2026-10-31',
      },
    ]);
    page.selectedObligationIds.set(['monthly-1']);
    page.paymentForm.setValue({
      fechaPago: '2026-11-04',
      monto: '30000',
      medioPago: 'efectivo',
      entidadId: '',
      referencia: '',
      observacion: '',
    });

    await page.savePayment();

    expect(connection.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO pagos'),
      [
        'payment-test-1',
        '2026-11-04',
        30000,
        'efectivo',
        null,
        null,
        null,
        null,
      ],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO pago_mensualidad'),
      ['payment-test-1', 'monthly-1', 30000],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });

  it('applies a partial payment to an additional charge', async () => {
    const page = fixture.componentInstance;
    const athlete = {
      id: 'athlete-1',
      nombres: 'Lucía',
      apellidos: 'Pérez',
      numero_documento: '123',
      categoria: 'Infantil',
    };
    const obligation = {
      id: 'charge-1',
      tipo: 'cargo_adicional' as const,
      periodo: '2026-11-03',
      fecha_vencimiento: null,
      descripcion: 'Arbitraje del torneo',
      monto_pesos: 25000,
      pagado_pesos: 0,
      pendiente_pesos: 25000,
      orden: '2026-11-03',
    };
    page.selectedAthlete.set(athlete);
    page.pendingObligations.set([obligation]);
    freshPendingRows = [obligation];
    page.selectedObligationIds.set(['charge-1']);
    page.paymentForm.setValue({
      fechaPago: '2026-11-04',
      monto: '10000',
      medioPago: 'efectivo',
      entidadId: '',
      referencia: '',
      observacion: '',
    });

    await page.savePayment();

    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO pago_cargo_adicional'),
      ['payment-test-1', 'charge-1', 10000],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });

  it('rejects saving a payment with a future date', async () => {
    const page = fixture.componentInstance;
    const athlete = {
      id: 'athlete-1',
      nombres: 'Lucía',
      apellidos: 'Pérez',
      numero_documento: '123',
      categoria: 'Infantil',
    };
    page.selectedAthlete.set(athlete);
    page.pendingObligations.set([
      {
        id: 'monthly-1',
        tipo: 'mensualidad',
        periodo: '2026-10',
        fecha_vencimiento: '2026-10-31',
        monto_pesos: 82000,
        pagado_pesos: 0,
        pendiente_pesos: 82000,
        orden: '2026-10-31',
      },
    ]);
    page.selectedObligationIds.set(['monthly-1']);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureDate = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-');
    page.paymentForm.setValue({
      fechaPago: futureDate,
      monto: '30000',
      medioPago: 'efectivo',
      entidadId: '',
      referencia: '',
      observacion: '',
    });

    await page.savePayment();

    expect(connection.run).not.toHaveBeenCalled();
    expect(page.modalError()).toBe('La fecha del pago no puede ser futura.');
  });

  it('rejects an amount larger than selected debt instead of leaving an excess', async () => {
    const page = fixture.componentInstance;
    page.selectedAthlete.set({
      id: 'athlete-1',
      nombres: 'Lucía',
      apellidos: 'Pérez',
      numero_documento: '123',
      categoria: 'Infantil',
    });
    page.pendingObligations.set([
      {
        id: 'monthly-1',
        tipo: 'mensualidad',
        periodo: '2026-11',
        fecha_vencimiento: '2026-11-30',
        monto_pesos: 40000,
        pagado_pesos: 0,
        pendiente_pesos: 40000,
        orden: '2026-11-30',
      },
    ]);
    page.selectedObligationIds.set(['monthly-1']);
    page.paymentForm.setValue({
      fechaPago: '2026-11-04',
      monto: '50000',
      medioPago: 'efectivo',
      entidadId: '',
      referencia: '',
      observacion: '',
    });

    await page.savePayment();

    expect(connection.run).not.toHaveBeenCalled();
    expect(page.modalError()).toContain('no superar el saldo seleccionado');
  });

  it('applies one payment to an inscription and a monthly charge', async () => {
    const page = fixture.componentInstance;
    page.selectedAthlete.set({
      id: 'athlete-1',
      nombres: 'Lucía',
      apellidos: 'Pérez',
      numero_documento: '123',
      categoria: 'Infantil',
    });
    const obligations = [
      {
        id: 'registration-1',
        tipo: 'inscripcion' as const,
        periodo: null,
        fecha_vencimiento: '2026-11-05',
        monto_pesos: 20000,
        pagado_pesos: 0,
        pendiente_pesos: 20000,
        orden: '2026-11-05',
      },
      {
        id: 'monthly-1',
        tipo: 'mensualidad' as const,
        periodo: '2026-11',
        fecha_vencimiento: '2026-11-30',
        monto_pesos: 80000,
        pagado_pesos: 0,
        pendiente_pesos: 80000,
        orden: '2026-11-30',
      },
    ];
    page.pendingObligations.set(obligations);
    freshPendingRows = obligations;
    page.selectedObligationIds.set(obligations.map((item) => item.id));
    page.paymentForm.setValue({
      fechaPago: '2026-11-05',
      monto: '100000',
      medioPago: 'efectivo',
      entidadId: '',
      referencia: '',
      observacion: '',
    });

    await page.savePayment();

    expect(connection.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO pago_inscripcion'),
      ['payment-test-1', 'registration-1', 20000],
      false,
    );
    expect(connection.run).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO pago_mensualidad'),
      ['payment-test-1', 'monthly-1', 80000],
      false,
    );
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });
});
