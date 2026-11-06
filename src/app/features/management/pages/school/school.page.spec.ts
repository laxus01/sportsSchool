import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { SchoolPage } from './school.page';

describe('SchoolPage', () => {
  let fixture: ComponentFixture<SchoolPage>;
  let connection: SQLiteDBConnection;

  beforeEach(async () => {
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async () => ({ values: [] })),
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

    fixture = TestBed.createComponent(SchoolPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('saves the school name, tax ID and representative to the singleton school row', async () => {
    fixture.componentInstance.form.setValue({
      name: 'Escuela del Norte',
      nit: '900123456-7',
      representative: 'Ana García',
      billingStartDate: '2026-11-01',
      registrationFee: '50000',
      monthlyDueDay: '10',
    });

    await fixture.componentInstance.save();

    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(id) DO UPDATE'),
      ['Escuela del Norte', '900123456-7', 'Ana García', '2026-11-01', 50000, 10],
      false,
    );
  });
});
