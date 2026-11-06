import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { ResumenFinanzasPage } from './resumen-finanzas.page';

describe('ResumenFinanzasPage', () => {
  let fixture: ComponentFixture<ResumenFinanzasPage>;
  let query: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    query = vi.fn(async (statement: string) => {
      if (statement.includes('AS total')) {
        return { values: [{ total: 125000 }] };
      }

      return {
        values: [
          {
            deportista_id: 'athlete-1',
            nombre: 'Ana Pérez',
            categoria: 'Sub-15',
            saldo_pendiente: 30000,
          },
          {
            deportista_id: 'athlete-2',
            nombre: 'Luis Gómez',
            categoria: 'Sub-17',
            saldo_pendiente: 50000,
          },
        ],
      };
    });
    const connection = { query } as unknown as SQLiteDBConnection;

    await TestBed.configureTestingModule({
      imports: [ManagementModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: DatabaseService,
          useValue: { getConnection: async () => connection },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResumenFinanzasPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads and displays the three financial indicators', async () => {
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    const page = fixture.componentInstance;
    expect(page.collectedThisMonth()).toBe(125000);
    expect(page.totalPending()).toBe(80000);
    expect(page.athletesWithBalance()).toBe(2);
    expect(query).toHaveBeenCalledTimes(2);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('RESUMEN FINANCIERO');
    expect(text).toContain('Recaudado este mes');
    expect(text).toContain('Saldo pendiente');
    expect(text).toContain('Deportistas con saldo');
  });
});
