import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { DatabaseService } from '../../../../database/database.service';
import { seedDemoPaymentData } from '../../../../database/demo-payment-data';
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
  readonly isExportingBackup = signal(false);
  readonly isDemoDataAvailable = signal(false);
  readonly isDemoSeedAlertOpen = signal(false);
  readonly isSeedingDemo = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly demoSeedAlertButtons = [
    { text: 'Cancelar', role: 'cancel' },
    {
      text: 'Cargar datos demo',
      role: 'confirm',
      handler: () => {
        void this.loadDemoData();
      },
    },
  ];

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

  async exportBackup(): Promise<void> {
    if (this.isExportingBackup()) {
      return;
    }
    this.isExportingBackup.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    try {
      const content = await this.database.exportBackupJson();
      const fileName = `sports-school-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const file = new File([content], fileName, {
        type: 'application/json',
      });
      const shareNavigator = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };

      if (
        shareNavigator.share &&
        shareNavigator.canShare?.({ files: [file] })
      ) {
        await shareNavigator.share({
          files: [file],
          title: 'Respaldo de Sports School',
        });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
      this.successMessage.set('Se exportó el respaldo de la base de datos.');
    } catch {
      this.errorMessage.set(
        'No se pudo exportar el respaldo. Inténtalo de nuevo.',
      );
    } finally {
      this.isExportingBackup.set(false);
    }
  }

  askToLoadDemoData(): void {
    this.isDemoSeedAlertOpen.set(true);
  }

  async loadDemoData(): Promise<void> {
    if (this.isSeedingDemo()) {
      return;
    }
    this.isDemoSeedAlertOpen.set(false);
    this.isSeedingDemo.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    try {
      const database = await this.database.getConnection();
      await seedDemoPaymentData(
        database,
        this.auth.currentUsername ?? 'demo',
      );
      this.isDemoDataAvailable.set(false);
      this.successMessage.set(
        'Se cargaron los datos ficticios. Te llevaremos a Pagos para probarlos.',
      );
      await this.router.navigateByUrl('/gestion/pagos');
    } catch (error) {
      this.errorMessage.set(
        String(error).includes('DEMO_REQUIRES_EMPTY_DATABASE')
          ? 'Los datos demo solo se pueden cargar en una base vacía. No se modificó la información existente.'
          : 'No se pudieron cargar los datos demo.',
      );
      await this.refreshDemoAvailability();
    } finally {
      this.isSeedingDemo.set(false);
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
      await this.refreshDemoAvailability(database);
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

  private async refreshDemoAvailability(
    database?: Awaited<ReturnType<DatabaseService['getConnection']>>,
  ): Promise<void> {
    try {
      const connection = database ?? (await this.database.getConnection());
      const result = await connection.query(
        `SELECT
           (SELECT COUNT(*) FROM escuela)
           + (SELECT COUNT(*) FROM categorias)
           + (SELECT COUNT(*) FROM deportistas)
           + (SELECT COUNT(*) FROM acudientes)
           + (SELECT COUNT(*) FROM pagos)
           + (SELECT COUNT(*) FROM mensualidades)
           + (SELECT COUNT(*) FROM inscripciones) AS total`,
      );
      this.isDemoDataAvailable.set(
        Number(result.values?.[0]?.['total'] ?? 0) === 0,
      );
    } catch {
      this.isDemoDataAvailable.set(false);
    }
  }
}
