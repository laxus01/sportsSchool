import { Injector } from '@angular/core';
import '@angular/compiler';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database.service';
import { BackupLockService } from './backup-lock.service';
import {
  BasicDataImportService,
  parseBasicImportJson,
} from './basic-data-import.service';

const VALID_PAYLOAD = {
  version: 1,
  deportistas: [
    {
      tipo_documento: 'TI',
      numero_documento: '1001',
      nombres: 'Deportista',
      apellidos: 'Uno',
      fecha_nacimiento: '2015-10-26',
      fecha_ingreso: '2020-03-07',
      categoria: 'PONY',
      entidad_salud: 'Coosalud EPS',
    },
  ],
  acudientes: [
    {
      tipo_documento: 'CC',
      numero_documento: '2001',
      nombres: 'Acudiente',
      apellidos: 'Uno',
      telefono: '3001234567',
      direccion: null,
    },
    {
      tipo_documento: 'CC',
      numero_documento: '2002',
      nombres: 'Acudiente',
      apellidos: 'Dos',
      telefono: '3001234568',
      direccion: null,
    },
  ],
  relaciones: [
    {
      deportista_numero_documento: '1001',
      acudiente_numero_documento: '2001',
      parentesco: 'MADRE',
    },
    {
      deportista_numero_documento: '1001',
      acudiente_numero_documento: '2002',
      parentesco: 'PADRE',
    },
  ],
};

describe('BasicDataImportService', () => {
  let connection: SQLiteDBConnection;
  let categoryExists: boolean;
  let injector: Injector;

  beforeEach(() => {
    categoryExists = true;
    connection = {
      beginTransaction: vi.fn(async () => ({})),
      commitTransaction: vi.fn(async () => ({})),
      rollbackTransaction: vi.fn(async () => ({})),
      query: vi.fn(async (statement: string) => {
        if (statement.includes('FROM categorias')) {
          return {
            values: categoryExists ? [{ id: 'category-1', nombre: 'PONY' }] : [],
          };
        }
        if (statement.includes('FROM entidades_salud')) {
          return { values: [{ id: 'health-1', nombre: 'Coosalud EPS' }] };
        }
        return { values: [] };
      }),
      run: vi.fn(async () => ({ changes: { changes: 1 } })),
    } as unknown as SQLiteDBConnection;

    injector = Injector.create({
      providers: [
        BasicDataImportService,
        BackupLockService,
        { provide: DatabaseService, useValue: { getConnection: async () => connection } },
      ],
    });
  });

  it('parses a valid import with multiple guardians for one athlete', () => {
    const payload = parseBasicImportJson(JSON.stringify(VALID_PAYLOAD));

    expect(payload.deportistas).toHaveLength(1);
    expect(payload.acudientes).toHaveLength(2);
    expect(payload.relaciones).toHaveLength(2);
  });

  it('rejects an entry date before the athlete birth date', () => {
    const invalidPayload = structuredClone(VALID_PAYLOAD);
    invalidPayload.deportistas[0].fecha_ingreso = '2000-03-07';

    expect(() =>
      parseBasicImportJson(JSON.stringify(invalidPayload)),
    ).toThrow('la fecha de ingreso es anterior al nacimiento');
  });

  it('imports one athlete with both guardian links in one transaction', async () => {
    const service = injector.get(BasicDataImportService);

    const result = await service.import(JSON.stringify(VALID_PAYLOAD));
    const insertStatements = (connection.run as ReturnType<typeof vi.fn>).mock
      .calls.map(([statement]) => String(statement));

    expect(result).toEqual({
      deportistasAgregados: 1,
      deportistasExistentes: 0,
      acudientesAgregados: 2,
      acudientesExistentes: 0,
      relacionesAgregadas: 2,
      relacionesExistentes: 0,
    });
    expect(
      insertStatements.filter((statement) =>
        statement.includes('INSERT INTO deportista_acudiente'),
      ),
    ).toHaveLength(2);
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
    expect(connection.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('does not insert records when a category is not registered', async () => {
    categoryExists = false;
    const service = injector.get(BasicDataImportService);

    const preview = await service.preview(JSON.stringify(VALID_PAYLOAD));

    expect(preview.puedeImportar).toBe(false);
    expect(preview.problemas).toContain('Categoría no registrada o inactiva: PONY.');
    expect(connection.run).not.toHaveBeenCalled();
  });

  it('keeps existing people unchanged and only adds a missing relationship', async () => {
    (connection.query as ReturnType<typeof vi.fn>).mockImplementation(
      async (statement: string) => {
        if (statement.includes('FROM deportistas')) {
          return {
            values: [
              {
                id: 'athlete-existing',
                tipo_documento: 'TI',
                numero_documento: '1001',
              },
            ],
          };
        }
        if (statement.includes('FROM acudientes')) {
          return {
            values: [
              {
                id: 'guardian-existing-1',
                tipo_documento: 'CC',
                numero_documento: '2001',
              },
              {
                id: 'guardian-existing-2',
                tipo_documento: 'CC',
                numero_documento: '2002',
              },
            ],
          };
        }
        if (statement.includes('FROM deportista_acudiente')) {
          return {
            values: [
              {
                deportista_id: 'athlete-existing',
                acudiente_id: 'guardian-existing-1',
              },
            ],
          };
        }
        return { values: [] };
      },
    );
    const service = injector.get(BasicDataImportService);

    const result = await service.import(JSON.stringify(VALID_PAYLOAD));
    const insertStatements = (connection.run as ReturnType<typeof vi.fn>).mock
      .calls.map(([statement]) => String(statement));

    expect(result).toEqual({
      deportistasAgregados: 0,
      deportistasExistentes: 1,
      acudientesAgregados: 0,
      acudientesExistentes: 2,
      relacionesAgregadas: 1,
      relacionesExistentes: 1,
    });
    expect(insertStatements).toHaveLength(1);
    expect(insertStatements[0]).toContain('INSERT INTO deportista_acudiente');
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });

  it('rolls back the whole import when a database insert fails', async () => {
    let insertCount = 0;
    (connection.run as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      insertCount += 1;
      if (insertCount === 2) {
        throw new Error('write failed');
      }
      return { changes: { changes: 1 } };
    });
    const service = injector.get(BasicDataImportService);

    await expect(
      service.import(JSON.stringify(VALID_PAYLOAD)),
    ).rejects.toThrow('write failed');

    expect(connection.rollbackTransaction).toHaveBeenCalledOnce();
    expect(connection.commitTransaction).not.toHaveBeenCalled();
  });
});
