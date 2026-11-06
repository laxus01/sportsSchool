import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DatabaseService } from '../../../../database/database.service';

@Component({
  selector: 'app-acudiente-form',
  templateUrl: './acudiente-form.page.html',
  styleUrls: ['./acudiente-form.page.scss'],
  standalone: false,
})
export class AcudienteFormPage {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly editingId = signal<string | null>(
    this.route.snapshot.paramMap.get('id'),
  );
  readonly isLoadingRecord = signal(false);

  readonly documentTypes = [
    { value: 'CC', label: 'Cédula de ciudadanía' },
    { value: 'CE', label: 'Cédula de extranjería' },
    { value: 'TI', label: 'Tarjeta de identidad' },
    { value: 'PPT', label: 'Permiso por protección temporal' },
    { value: 'PAS', label: 'Pasaporte' },
    { value: 'NIT', label: 'NIT' },
    { value: 'OTRO', label: 'Otro' },
  ];

  readonly form = new FormGroup({
    documentType: new FormControl('CC', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    documentNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)],
    }),
    firstNames: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    lastNames: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)],
    }),
    address: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(250)],
    }),
  });

  readonly isSaving = signal(false);
  readonly errorMessage = signal('');

  ionViewWillEnter(): void {
    const id = this.editingId();
    if (id && !this.isLoadingRecord() && !this.form.dirty) {
      void this.loadRecord(id);
    }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      const values = this.form.getRawValue();
      const database = await this.database.getConnection();
      const record = [
        values.firstNames.trim(),
        values.lastNames.trim(),
        values.documentType,
        values.documentNumber.trim(),
        values.phone.trim(),
        values.address.trim() || null,
      ];
      const editingId = this.editingId();
      if (editingId) {
        await database.run(
          `UPDATE acudientes
           SET nombres = ?,
               apellidos = ?,
               tipo_documento = ?,
               numero_documento = ?,
               telefono = ?,
               direccion = ?,
               actualizado_en = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [...record, editingId],
        );
      } else {
        await database.run(
          `INSERT INTO acudientes
            (id, nombres, apellidos, tipo_documento, numero_documento, telefono, direccion)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), ...record],
        );
      }

      await this.router.navigateByUrl('/gestion/acudientes', { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(
        String(error).includes('UNIQUE constraint failed')
          ? 'Ya existe un acudiente con ese tipo y número de identificación.'
          : 'No se pudo guardar el acudiente. Revisa la información e inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): Promise<boolean> {
    return this.router.navigateByUrl('/gestion/acudientes');
  }

  private async loadRecord(id: string): Promise<void> {
    this.isLoadingRecord.set(true);
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT nombres, apellidos, tipo_documento, numero_documento,
                telefono, direccion
         FROM acudientes
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      const row = result.values?.[0] as
        | {
            nombres: string;
            apellidos: string;
            tipo_documento: string | null;
            numero_documento: string | null;
            telefono: string;
            direccion: string | null;
          }
        | undefined;
      if (!row) {
        this.errorMessage.set('No encontramos el acudiente solicitado.');
        return;
      }
      this.form.setValue({
        documentType: row.tipo_documento ?? 'CC',
        documentNumber: row.numero_documento ?? '',
        firstNames: row.nombres,
        lastNames: row.apellidos,
        phone: row.telefono,
        address: row.direccion ?? '',
      });
      this.form.markAsPristine();
      this.form.markAsUntouched();
    } catch {
      this.errorMessage.set('No se pudo cargar el acudiente.');
    } finally {
      this.isLoadingRecord.set(false);
    }
  }
}
