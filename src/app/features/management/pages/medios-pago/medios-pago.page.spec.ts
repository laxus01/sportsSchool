import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { MediosPagoPage } from './medios-pago.page';

describe('MediosPagoPage', () => {
  let fixture: ComponentFixture<MediosPagoPage>;

  beforeEach(async () => {
    const connection = {
      query: vi.fn(async () => ({
        values: [
          {
            id: 'entity-1',
            nombre: 'Bancolombia',
            tipo: 'banco',
            activa: 1,
          },
          {
            id: 'entity-2',
            nombre: 'Neki',
            tipo: 'billetera',
            activa: 1,
          },
        ],
      })),
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

    fixture = TestBed.createComponent(MediosPagoPage);
    fixture.detectChanges();
  });

  it('lists the transfer entities available for payments', async () => {
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Bancolombia');
    expect(content).toContain('Banco');
    expect(content).toContain('Neki');
    expect(content).toContain('Billetera');
  });
});
