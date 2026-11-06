import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { AcudienteFormPage } from './acudiente-form.page';

describe('AcudienteFormPage', () => {
  let fixture: ComponentFixture<AcudienteFormPage>;
  let connection: SQLiteDBConnection;

  beforeEach(async () => {
    vi.stubGlobal(
      'crypto',
      { randomUUID: () => 'guardian-test-id' } as unknown as Crypto,
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

    fixture = TestBed.createComponent(AcudienteFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('inserts the guardian contact fields in the acudientes table', async () => {
    fixture.componentInstance.form.setValue({
      documentType: 'CC',
      documentNumber: '123456789',
      firstNames: 'Camila',
      lastNames: 'Rojas',
      phone: '3001234567',
      address: 'Calle 10',
    });

    await fixture.componentInstance.save();

    expect(connection.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO acudientes'),
      [
        'guardian-test-id',
        'Camila',
        'Rojas',
        'CC',
        '123456789',
        '3001234567',
        'Calle 10',
      ],
    );
  });
});
