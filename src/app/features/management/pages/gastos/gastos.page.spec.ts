import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { GastosPage } from './gastos.page';

interface TestExpense {
  id: string;
  fecha: string;
  descripcion: string;
  monto_pesos: number | null;
}

describe('GastosPage', () => {
  let fixture: ComponentFixture<GastosPage>;
  let query: ReturnType<typeof vi.fn>;
  let run: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.stubGlobal(
      'crypto',
      { randomUUID: () => 'expense-test-id' } as unknown as Crypto,
    );
    query = vi.fn(
      async (): Promise<{ values?: TestExpense[] }> => ({ values: [] }),
    );
    run = vi.fn(async () => ({}));
    const connection = {
      query,
      run,
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

    fixture = TestBed.createComponent(GastosPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('loads and displays expenses ordered by date', async () => {
    const expense = {
      id: 'expense-1',
      fecha: '2026-11-04',
      descripcion: 'Implementos deportivos',
      monto_pesos: 245000,
    };
    query.mockResolvedValue({ values: [expense] });

    await fixture.componentInstance.ionViewWillEnter();

    expect(fixture.componentInstance.expenses()).toEqual([expense]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY fecha DESC, creado_en DESC'),
    );
  });

  it('opens a clean form and saves the expense', async () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      date: '2026-11-05',
      amount: '',
      description: '  Compra de balones  ',
    });

    page.openNewExpense();
    expect(page.isModalOpen()).toBe(true);
    expect(page.form.controls.amount.value).toBe('');
    expect(page.form.controls.description.value).toBe('');

    page.form.setValue({
      date: '2026-11-05',
      amount: '48000',
      description: '  Compra de balones  ',
    });
    query.mockResolvedValue({
      values: [
        {
          id: 'expense-test-id',
          fecha: '2026-11-05',
          descripcion: 'Compra de balones',
          monto_pesos: 48000,
        },
      ],
    });
    await page.saveExpense();

    expect(run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO gastos'),
      ['expense-test-id', '2026-11-05', 'Compra de balones', 48000],
    );
    expect(page.isModalOpen()).toBe(false);
  });

  it('loads an expense in the shared form and updates it', async () => {
    const page = fixture.componentInstance;
    const expense = {
      id: 'expense-1',
      fecha: '2026-11-04',
      descripcion: 'Compra de balones',
      monto_pesos: 48000,
    };

    page.openEditExpense(expense);

    expect(page.isModalOpen()).toBe(true);
    expect(page.editingExpense()).toEqual(expense);
    expect(page.form.getRawValue()).toEqual({
      date: '2026-11-04',
      amount: '48000',
      description: 'Compra de balones',
    });

    page.form.setValue({
      date: '2026-11-05',
      amount: '52000',
      description: 'Compra de balones y petos',
    });
    await page.saveExpense();

    expect(run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE gastos'),
      ['2026-11-05', 'Compra de balones y petos', 52000, 'expense-1'],
    );
    expect(run).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO gastos'),
      expect.anything(),
    );
    expect(page.isModalOpen()).toBe(false);
  });

  it('confirms and deletes an expense', async () => {
    const page = fixture.componentInstance;
    const expense = {
      id: 'expense-1',
      fecha: '2026-11-04',
      descripcion: 'Compra de balones',
      monto_pesos: 48000,
    };

    page.openDeleteExpense(expense);
    expect(page.isDeleteModalOpen()).toBe(true);

    await page.confirmDeleteExpense();

    expect(run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM gastos'),
      ['expense-1'],
    );
    expect(page.isDeleteModalOpen()).toBe(false);
    expect(page.expenseToDelete()).toBeNull();
  });

  it('rejects a zero expense amount', async () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      date: '2026-11-05',
      amount: '0',
      description: 'Compra de balones',
    });

    await page.saveExpense();

    expect(run).not.toHaveBeenCalled();
    expect(page.modalError()).toContain('valor positivo');
  });

  it('does not insert a gasto with a blank description', async () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      date: '2026-11-05',
      amount: '48000',
      description: '   ',
    });

    await page.saveExpense();

    expect(run).not.toHaveBeenCalled();
  });
});
