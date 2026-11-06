import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { RouterModule } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../../../../database/database.service';
import { ManagementModule } from '../../management.module';
import { AcudientesPage } from './acudientes.page';

describe('AcudientesPage', () => {
  let fixture: ComponentFixture<AcudientesPage>;

  beforeEach(async () => {
    const connection = {
      query: vi.fn(async () => ({
        values: [
          {
            id: 'guardian-1',
            nombres: 'Camila',
            apellidos: 'Rojas',
            tipo_documento: 'CC',
            numero_documento: '123456789',
            telefono: '3001234567',
            direccion: 'Calle 10',
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

    fixture = TestBed.createComponent(AcudientesPage);
    fixture.detectChanges();
  });

  it('lists identification, contact and address details', async () => {
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Camila Rojas');
    expect(content).toContain('CC 123456789');
    expect(content).toContain('3001234567');
    expect(content).toContain('Calle 10');
  });
});
