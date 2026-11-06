import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DatabaseService } from '../../../../database/database.service';

@Component({
  selector: 'app-medio-pago-form',
  templateUrl: './medio-pago-form.page.html',
  styleUrls: ['./medio-pago-form.page.scss'],
  standalone: false,
})
export class MedioPagoFormPage {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly methodTypes = [
    { value: 'banco', label: 'Banco' },
    { value: 'billetera', label: 'Billetera' },
    { value: 'sistema_transferencia', label: 'Sistema de transferencia' },
  ];

  readonly editingId = signal<string | null>(
    this.route.snapshot.paramMap.get('id'),
  );
  readonly isLoadingRecord = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(120),
        Validators.pattern(/\S/),
      ],
    }),
    type: new FormControl('banco', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    active: new FormControl(true, { nonNullable: true }),
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
      const database = await this.database.getConnection();
      const values = this.form.getRawValue();
      const editingId = this.editingId();
      if (editingId) {
        await database.run(
          `UPDATE entidades_transferencia
           SET nombre = ?, tipo = ?, activa = ?
           WHERE id = ?`,
          [
            values.name.trim(),
            values.type,
            values.active ? 1 : 0,
            editingId,
          ],
        );
      } else {
        await database.run(
          `INSERT INTO entidades_transferencia (id, nombre, tipo, activa)
           VALUES (?, ?, ?, 1)`,
          [crypto.randomUUID(), values.name.trim(), values.type],
        );
      }

      await this.router.navigateByUrl('/gestion/medios-de-pago', {
        replaceUrl: true,
      });
    } catch (error) {
      this.errorMessage.set(
        String(error).includes('UNIQUE constraint failed')
          ? 'Ya existe un medio de pago con ese nombre.'
          : 'No se pudo guardar el medio de pago. Inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): Promise<boolean> {
    return this.router.navigateByUrl('/gestion/medios-de-pago');
  }

  private async loadRecord(id: string): Promise<void> {
    this.isLoadingRecord.set(true);
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT nombre, tipo, activa
         FROM entidades_transferencia
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      const row = result.values?.[0] as
        | { nombre: string; tipo: string; activa: number }
        | undefined;
      if (!row) {
        this.errorMessage.set('No encontramos el medio de pago solicitado.');
        return;
      }
      this.form.setValue({
        name: row.nombre,
        type: row.tipo,
        active: row.activa === 1,
      });
      this.form.markAsPristine();
      this.form.markAsUntouched();
    } catch {
      this.errorMessage.set('No se pudo cargar el medio de pago.');
    } finally {
      this.isLoadingRecord.set(false);
    }
  }
}
