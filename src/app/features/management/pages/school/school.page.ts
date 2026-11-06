import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';

interface SchoolProfileRow {
  nombre: string;
  identificacion_fiscal: string | null;
  nombre_representante: string;
  fecha_inicio_control_pagos: string | null;
  valor_inscripcion_pesos: number | null;
  dia_vencimiento_mensual: number;
}

@Component({
  selector: 'app-school',
  templateUrl: './school.page.html',
  styleUrls: ['./school.page.scss'],
  standalone: false,
})
export class SchoolPage implements OnInit {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    nit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)],
    }),
    representative: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    billingStartDate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    registrationFee: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+$/)],
    }),
    monthlyDueDay: new FormControl('31', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d+$/),
        Validators.min(1),
        Validators.max(31),
      ],
    }),
  });

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  ngOnInit(): void {
    void this.loadSchool();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving()) {
      return;
    }

    const registrationFee = Number(this.form.controls.registrationFee.value);
    const monthlyDueDay = Number(this.form.controls.monthlyDueDay.value);
    if (
      !Number.isSafeInteger(registrationFee) ||
      registrationFee < 0 ||
      !Number.isInteger(monthlyDueDay) ||
      monthlyDueDay < 1 ||
      monthlyDueDay > 31
    ) {
      this.errorMessage.set('Revisa los valores de configuración de cobros.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const values = this.form.getRawValue();
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        const settingsResult = await database.query(
          `SELECT fecha_inicio_control_pagos FROM escuela WHERE id = 1`,
        );
        const previousStartDate = settingsResult.values?.[0]?.[
          'fecha_inicio_control_pagos'
        ] as string | null | undefined;
        if (
          previousStartDate &&
          previousStartDate !== values.billingStartDate
        ) {
          const chargesResult = await database.query(
            `SELECT
               (SELECT COUNT(*) FROM mensualidades)
               + (SELECT COUNT(*) FROM inscripciones) AS total`,
          );
          if (Number(chargesResult.values?.[0]?.['total'] ?? 0) > 0) {
            throw new Error('BILLING_START_LOCKED');
          }
        }
        await database.run(
          `INSERT INTO escuela
            (id, nombre, identificacion_fiscal, nombre_representante,
             fecha_inicio_control_pagos, valor_inscripcion_pesos,
             dia_vencimiento_mensual)
           VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             nombre = excluded.nombre,
             identificacion_fiscal = excluded.identificacion_fiscal,
             nombre_representante = excluded.nombre_representante,
             fecha_inicio_control_pagos = excluded.fecha_inicio_control_pagos,
             valor_inscripcion_pesos = excluded.valor_inscripcion_pesos,
             dia_vencimiento_mensual = excluded.dia_vencimiento_mensual,
             actualizado_en = CURRENT_TIMESTAMP`,
          [
            values.name.trim(),
            values.nit.trim(),
            values.representative.trim(),
            values.billingStartDate,
            registrationFee,
            monthlyDueDay,
          ],
          false,
        );
        await database.run(
          `INSERT INTO auditoria_financiera
            (id, accion, entidad, entidad_id, actor, detalle)
           VALUES (?, 'CONFIGURACION_COBROS_ACTUALIZADA', 'escuela', '1', ?, ?)`,
          [
            crypto.randomUUID(),
            this.auth.currentUsername ?? 'local',
            JSON.stringify({
              fechaInicioControl: values.billingStartDate,
              valorInscripcion: registrationFee,
              diaVencimiento: monthlyDueDay,
            }),
          ],
          false,
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        if (String(error).includes('BILLING_START_LOCKED')) {
          throw new Error(
            'No se puede cambiar el inicio del control después de generar mensualidades.',
          );
        }
        throw error;
      }
      this.successMessage.set('La información de la escuela fue guardada.');
    } catch (error) {
      this.errorMessage.set(
        String(error).includes('No se puede cambiar el inicio')
          ? String(error).replace(/^Error: /, '')
          : 'No se pudo guardar la información. Inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  backToHome(): Promise<boolean> {
    return this.router.navigateByUrl('/home');
  }

  private async loadSchool(): Promise<void> {
    this.errorMessage.set('');
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT nombre, identificacion_fiscal, nombre_representante,
                fecha_inicio_control_pagos, valor_inscripcion_pesos,
                dia_vencimiento_mensual
         FROM escuela
         WHERE id = 1
         LIMIT 1`,
      );
      const school = result.values?.[0] as SchoolProfileRow | undefined;

      if (school) {
        this.form.patchValue({
          name: school.nombre,
          nit: school.identificacion_fiscal ?? '',
          representative: school.nombre_representante,
          billingStartDate: school.fecha_inicio_control_pagos ?? '',
          registrationFee:
            school.valor_inscripcion_pesos === null
              ? ''
              : String(school.valor_inscripcion_pesos),
          monthlyDueDay: String(school.dia_vencimiento_mensual ?? 31),
        });
      }
    } catch {
      this.errorMessage.set(
        'No se pudo cargar la información de la escuela.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
