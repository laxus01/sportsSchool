import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../database.service';
import { BackupLockService } from './backup-lock.service';

const DOCUMENT_TYPES = new Set(['CC', 'CE', 'TI', 'PPT', 'PAS', 'OTRO']);
const RELATIONSHIPS = new Set([
  'MADRE',
  'PADRE',
  'ABUELO',
  'ABUELA',
  'TÍO',
  'TÍA',
  'HERMANO',
  'HERMANA',
  'PADRASTRO',
  'MADRASTRA',
  'PADRINO',
  'MADRINA',
  'TUTOR',
  'TUTORA',
  'OTRO',
]);
const MAX_RECORDS = 5_000;

export interface BasicImportAthlete {
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  fecha_ingreso: string;
  categoria: string;
  entidad_salud: string | null;
}

export interface BasicImportGuardian {
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string | null;
  direccion: string | null;
}

export interface BasicImportRelationship {
  deportista_numero_documento: string;
  acudiente_numero_documento: string;
  parentesco: string;
}

export interface BasicImportPayload {
  deportistas: BasicImportAthlete[];
  acudientes: BasicImportGuardian[];
  relaciones: BasicImportRelationship[];
}

export interface BasicImportPreview {
  deportistas: number;
  acudientes: number;
  relaciones: number;
  deportistasNuevos: number;
  deportistasExistentes: number;
  acudientesNuevos: number;
  acudientesExistentes: number;
  relacionesNuevas: number;
  relacionesExistentes: number;
  problemas: string[];
  puedeImportar: boolean;
}

export interface BasicImportResult {
  deportistasAgregados: number;
  deportistasExistentes: number;
  acudientesAgregados: number;
  acudientesExistentes: number;
  relacionesAgregadas: number;
  relacionesExistentes: number;
}

interface CatalogRow {
  id: string;
  nombre: string;
}

interface PersonRow {
  id: string;
  tipo_documento: string | null;
  numero_documento: string | null;
}

interface PlannedAthlete {
  record: BasicImportAthlete;
  id: string;
  exists: boolean;
  categoriaId: string | null;
  entidadSaludId: string | null;
}

interface PlannedGuardian {
  record: BasicImportGuardian;
  id: string;
  exists: boolean;
}

interface PlannedRelationship {
  record: BasicImportRelationship;
  deportistaId: string;
  acudienteId: string;
  exists: boolean;
}

interface ImportPlan {
  preview: BasicImportPreview;
  deportistas: PlannedAthlete[];
  acudientes: PlannedGuardian[];
  relaciones: PlannedRelationship[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
  label: string,
  maxLength = 500,
): string {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}: falta el campo "${field}".`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label}: el campo "${field}" supera ${maxLength} caracteres.`);
  }
  return normalized;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  label: string,
  maxLength = 500,
): string | null {
  const value = record[field];
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`${label}: el campo "${field}" no es válido.`);
  }
  return value.trim() || null;
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizedName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-CO');
}

function relationshipKey(deportistaId: string, acudienteId: string): string {
  return `${deportistaId}\u0000${acudienteId}`;
}

function documentMap(
  rows: PersonRow[],
  label: string,
  problems: string[],
): Map<string, PersonRow> {
  const result = new Map<string, PersonRow>();
  for (const row of rows) {
    const number = row.numero_documento?.trim();
    if (!number) {
      continue;
    }
    if (result.has(number)) {
      problems.push(`Hay documentos repetidos en la base de datos de ${label}.`);
      continue;
    }
    result.set(number, row);
  }
  return result;
}

function catalogMap(rows: CatalogRow[]): Map<string, CatalogRow[]> {
  const result = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const key = normalizedName(row.nombre);
    const matches = result.get(key) ?? [];
    matches.push(row);
    result.set(key, matches);
  }
  return result;
}

function resolveCatalog(
  catalog: Map<string, CatalogRow[]>,
  value: string,
  label: string,
  problems: string[],
): string | null {
  const matches = catalog.get(normalizedName(value)) ?? [];
  if (matches.length === 1) {
    return matches[0].id;
  }
  if (matches.length === 0) {
    problems.push(`${label} no registrada o inactiva: ${value}.`);
  } else {
    problems.push(`${label} ambigua en el catálogo: ${value}.`);
  }
  return null;
}

export function parseBasicImportJson(json: string): BasicImportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El archivo no contiene un JSON válido.');
  }
  if (!isRecord(parsed) || parsed['version'] !== 1) {
    throw new Error('El JSON no tiene una versión de importación compatible.');
  }
  const athleteRows = parsed['deportistas'];
  const guardianRows = parsed['acudientes'];
  const relationshipRows = parsed['relaciones'];
  if (
    !Array.isArray(athleteRows) ||
    !Array.isArray(guardianRows) ||
    !Array.isArray(relationshipRows)
  ) {
    throw new Error('El JSON debe incluir deportistas, acudientes y relaciones.');
  }
  if (
    athleteRows.length > MAX_RECORDS ||
    guardianRows.length > MAX_RECORDS ||
    relationshipRows.length > MAX_RECORDS
  ) {
    throw new Error(`El archivo supera el límite de ${MAX_RECORDS} registros por lista.`);
  }

  const deportistas = athleteRows.map((value, index) => {
    const label = `Deportista ${index + 1}`;
    if (!isRecord(value)) {
      throw new Error(`${label}: el registro no es un objeto.`);
    }
    const tipoDocumento = requiredString(
      value,
      'tipo_documento',
      label,
      10,
    ).toUpperCase();
    if (!DOCUMENT_TYPES.has(tipoDocumento)) {
      throw new Error(`${label}: tipo de documento no permitido.`);
    }
    const fechaNacimiento = requiredString(
      value,
      'fecha_nacimiento',
      label,
      10,
    );
    const fechaIngreso = requiredString(value, 'fecha_ingreso', label, 10);
    if (!isValidIsoDate(fechaNacimiento) || !isValidIsoDate(fechaIngreso)) {
      throw new Error(`${label}: las fechas deben tener formato YYYY-MM-DD válido.`);
    }
    if (fechaIngreso < fechaNacimiento) {
      throw new Error(`${label}: la fecha de ingreso es anterior al nacimiento.`);
    }
    const entidadSalud = optionalString(value, 'entidad_salud', label, 120);
    return {
      tipo_documento: tipoDocumento,
      numero_documento: requiredString(
        value,
        'numero_documento',
        label,
        30,
      ),
      nombres: requiredString(value, 'nombres', label, 120),
      apellidos: requiredString(value, 'apellidos', label, 120),
      fecha_nacimiento: fechaNacimiento,
      fecha_ingreso: fechaIngreso,
      categoria: requiredString(value, 'categoria', label, 120),
      entidad_salud: entidadSalud,
    };
  });

  const acudientes = guardianRows.map((value, index) => {
    const label = `Acudiente ${index + 1}`;
    if (!isRecord(value)) {
      throw new Error(`${label}: el registro no es un objeto.`);
    }
    const tipoDocumento = requiredString(
      value,
      'tipo_documento',
      label,
      10,
    ).toUpperCase();
    if (!DOCUMENT_TYPES.has(tipoDocumento)) {
      throw new Error(`${label}: tipo de documento no permitido.`);
    }
    return {
      tipo_documento: tipoDocumento,
      numero_documento: requiredString(
        value,
        'numero_documento',
        label,
        30,
      ),
      nombres: requiredString(value, 'nombres', label, 120),
      apellidos: requiredString(value, 'apellidos', label, 120),
      telefono: requiredString(value, 'telefono', label, 30),
      correo: optionalString(value, 'correo', label, 254),
      direccion: optionalString(value, 'direccion', label, 500),
    };
  });

  const athleteNumbers = new Set<string>();
  for (const athlete of deportistas) {
    if (athleteNumbers.has(athlete.numero_documento)) {
      throw new Error('El JSON contiene documentos de deportista repetidos.');
    }
    athleteNumbers.add(athlete.numero_documento);
  }
  const guardianNumbers = new Set<string>();
  for (const guardian of acudientes) {
    if (guardianNumbers.has(guardian.numero_documento)) {
      throw new Error('El JSON contiene documentos de acudiente repetidos.');
    }
    guardianNumbers.add(guardian.numero_documento);
  }

  const relationshipKeys = new Set<string>();
  const relaciones = relationshipRows.map((value, index) => {
    const label = `Relación ${index + 1}`;
    if (!isRecord(value)) {
      throw new Error(`${label}: el registro no es un objeto.`);
    }
    const deportistaNumber = requiredString(
      value,
      'deportista_numero_documento',
      label,
      30,
    );
    const guardianNumber = requiredString(
      value,
      'acudiente_numero_documento',
      label,
      30,
    );
    const parentesco = requiredString(value, 'parentesco', label, 40)
      .toLocaleUpperCase('es-CO');
    if (!RELATIONSHIPS.has(parentesco)) {
      throw new Error(`${label}: parentesco no permitido.`);
    }
    if (!athleteNumbers.has(deportistaNumber)) {
      throw new Error(`${label}: el deportista relacionado no está en el JSON.`);
    }
    if (!guardianNumbers.has(guardianNumber)) {
      throw new Error(`${label}: el acudiente relacionado no está en el JSON.`);
    }
    const key = relationshipKey(deportistaNumber, guardianNumber);
    if (relationshipKeys.has(key)) {
      throw new Error('El JSON contiene vínculos deportista-acudiente repetidos.');
    }
    relationshipKeys.add(key);
    return {
      deportista_numero_documento: deportistaNumber,
      acudiente_numero_documento: guardianNumber,
      parentesco,
    };
  });

  return { deportistas, acudientes, relaciones };
}

@Injectable({ providedIn: 'root' })
export class BasicDataImportService {
  private readonly database = inject(DatabaseService);
  private readonly lock = inject(BackupLockService);

  readonly isBusy = this.lock.isBusy;

  async preview(json: string): Promise<BasicImportPreview> {
    const payload = parseBasicImportJson(json);
    const connection = await this.database.getConnection();
    return (await this.buildPlan(connection, payload)).preview;
  }

  async import(json: string): Promise<BasicImportResult> {
    const payload = parseBasicImportJson(json);
    return this.lock.runExclusive(async () => {
      const connection = await this.database.getConnection();
      let transactionStarted = false;
      try {
        await connection.beginTransaction();
        transactionStarted = true;
        const plan = await this.buildPlan(connection, payload);
        if (!plan.preview.puedeImportar) {
          throw new Error(plan.preview.problemas.join(' '));
        }

        for (const athlete of plan.deportistas) {
          if (athlete.exists) {
            continue;
          }
          await connection.run(
            `INSERT INTO deportistas
              (id, categoria_id, nombres, apellidos, tipo_documento,
               numero_documento, fecha_nacimiento, fecha_ingreso,
               entidad_salud_id, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
            [
              athlete.id,
              athlete.categoriaId,
              athlete.record.nombres,
              athlete.record.apellidos,
              athlete.record.tipo_documento,
              athlete.record.numero_documento,
              athlete.record.fecha_nacimiento,
              athlete.record.fecha_ingreso,
              athlete.entidadSaludId,
            ],
            false,
          );
        }

        for (const guardian of plan.acudientes) {
          if (guardian.exists) {
            continue;
          }
          await connection.run(
            `INSERT INTO acudientes
              (id, nombres, apellidos, tipo_documento, numero_documento,
               telefono, correo, direccion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              guardian.id,
              guardian.record.nombres,
              guardian.record.apellidos,
              guardian.record.tipo_documento,
              guardian.record.numero_documento,
              guardian.record.telefono,
              guardian.record.correo,
              guardian.record.direccion,
            ],
            false,
          );
        }

        for (const relationship of plan.relaciones) {
          if (relationship.exists) {
            continue;
          }
          await connection.run(
            `INSERT INTO deportista_acudiente
              (deportista_id, acudiente_id, parentesco)
             VALUES (?, ?, ?)`,
            [
              relationship.deportistaId,
              relationship.acudienteId,
              relationship.record.parentesco,
            ],
            false,
          );
        }

        await connection.commitTransaction();
        transactionStarted = false;
        return {
          deportistasAgregados: plan.preview.deportistasNuevos,
          deportistasExistentes: plan.preview.deportistasExistentes,
          acudientesAgregados: plan.preview.acudientesNuevos,
          acudientesExistentes: plan.preview.acudientesExistentes,
          relacionesAgregadas: plan.preview.relacionesNuevas,
          relacionesExistentes: plan.preview.relacionesExistentes,
        };
      } catch (error) {
        if (transactionStarted) {
          await connection.rollbackTransaction();
        }
        throw error;
      }
    });
  }

  private async buildPlan(
    connection: Awaited<ReturnType<DatabaseService['getConnection']>>,
    payload: BasicImportPayload,
  ): Promise<ImportPlan> {
    const problems: string[] = [];
    const categoriesResult = await connection.query(
      'SELECT id, nombre FROM categorias WHERE activa = 1',
    );
    const healthResult = await connection.query(
      'SELECT id, nombre FROM entidades_salud WHERE activa = 1',
    );
    const athleteResult = await connection.query(
      `SELECT id, tipo_documento, numero_documento
       FROM deportistas WHERE numero_documento IS NOT NULL`,
    );
    const guardianResult = await connection.query(
      `SELECT id, tipo_documento, numero_documento
       FROM acudientes WHERE numero_documento IS NOT NULL`,
    );
    const relationshipResult = await connection.query(
      'SELECT deportista_id, acudiente_id FROM deportista_acudiente',
    );

    const categories = catalogMap(
      (categoriesResult.values ?? []) as CatalogRow[],
    );
    const healthEntities = catalogMap(
      (healthResult.values ?? []) as CatalogRow[],
    );
    const existingAthletes = documentMap(
      (athleteResult.values ?? []) as PersonRow[],
      'deportistas',
      problems,
    );
    const existingGuardians = documentMap(
      (guardianResult.values ?? []) as PersonRow[],
      'acudientes',
      problems,
    );
    const existingRelationships = new Set(
      (relationshipResult.values ?? []).map((row) =>
        relationshipKey(
          String(row['deportista_id']),
          String(row['acudiente_id']),
        ),
      ),
    );

    const athletesByNumber = new Map<string, PlannedAthlete>();
    const deportistas = payload.deportistas.map((record) => {
      const existing = existingAthletes.get(record.numero_documento);
      if (
        existing &&
        existing.tipo_documento?.toUpperCase() !== record.tipo_documento
      ) {
        problems.push(
          `El documento ${record.numero_documento} ya existe con otro tipo en deportistas.`,
        );
      }
      const categoryId = existing
        ? null
        : resolveCatalog(
            categories,
            record.categoria,
            'Categoría',
            problems,
          );
      const healthId =
        existing || !record.entidad_salud
          ? null
          : resolveCatalog(
              healthEntities,
              record.entidad_salud,
              'Entidad de salud',
              problems,
            );
      const planned: PlannedAthlete = {
        record,
        id: existing?.id ?? crypto.randomUUID(),
        exists: Boolean(existing),
        categoriaId: categoryId,
        entidadSaludId: healthId,
      };
      athletesByNumber.set(record.numero_documento, planned);
      return planned;
    });

    const guardiansByNumber = new Map<string, PlannedGuardian>();
    const acudientes = payload.acudientes.map((record) => {
      const existing = existingGuardians.get(record.numero_documento);
      if (
        existing &&
        existing.tipo_documento?.toUpperCase() !== record.tipo_documento
      ) {
        problems.push(
          `El documento ${record.numero_documento} ya existe con otro tipo en acudientes.`,
        );
      }
      const planned: PlannedGuardian = {
        record,
        id: existing?.id ?? crypto.randomUUID(),
        exists: Boolean(existing),
      };
      guardiansByNumber.set(record.numero_documento, planned);
      return planned;
    });

    const relaciones = payload.relaciones.map((record) => {
      const athlete = athletesByNumber.get(
        record.deportista_numero_documento,
      )!;
      const guardian = guardiansByNumber.get(
        record.acudiente_numero_documento,
      )!;
      const key = relationshipKey(athlete.id, guardian.id);
      return {
        record,
        deportistaId: athlete.id,
        acudienteId: guardian.id,
        exists: existingRelationships.has(key),
      };
    });

    const preview: BasicImportPreview = {
      deportistas: deportistas.length,
      acudientes: acudientes.length,
      relaciones: relaciones.length,
      deportistasNuevos: deportistas.filter((record) => !record.exists).length,
      deportistasExistentes: deportistas.filter((record) => record.exists).length,
      acudientesNuevos: acudientes.filter((record) => !record.exists).length,
      acudientesExistentes: acudientes.filter((record) => record.exists).length,
      relacionesNuevas: relaciones.filter((record) => !record.exists).length,
      relacionesExistentes: relaciones.filter((record) => record.exists).length,
      problemas: [...new Set(problems)],
      puedeImportar: problems.length === 0,
    };

    return { preview, deportistas, acudientes, relaciones };
  }
}
