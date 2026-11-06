import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { MedioPagoFormPage } from './medio-pago-form.page';

describe('MedioPagoFormPage', () => {
  let fixture: ComponentFixture<MedioPagoFormPage>;
  let connection: SQLiteDBConnection;

  beforeEach(async () => {
    vi.stubGlobal(
      'crypto',
      { randomUUID: () => 'payment-method-test-id' } as unknown as Crypto,
    );
    connection = {
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

    fixture = TestBed.createComponent(MedioPagoFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('inserts the named transfer entity as an active bank', async () => {
    fixture.componentInstance.form.setValue({
      name: 'Banco de Bogotá',
      type: 'banco',
      active: true,
    });

    await fixture.componentInstance.save();

    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO entidades_transferencia'),
      ['payment-method-test-id', 'Banco de Bogotá', 'banco'],
    );
  });
});
