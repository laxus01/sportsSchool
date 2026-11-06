import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  addOutline,
  cameraOutline,
  closeCircleOutline,
  imagesOutline,
} from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';

interface CategoryOption {
  id: string;
  nombre: string;
}

interface GuardianOption {
  id: string;
  nombres: string;
  apellidos: string;
  tipo_documento: string | null;
  numero_documento: string | null;
}

interface SchoolBillingSettings {
  fecha_inicio_control_pagos: string | null;
  valor_inscripcion_pesos: number | null;
  dia_vencimiento_mensual: number;
}

interface AthleteRecord {
  id: string;
  categoria_id: string;
  categoria_vigente: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  fecha_ingreso: string;
  estado: string;
  foto_data_url: string | null;
}

interface GuardianLinkRecord {
  acudiente_id: string;
  parentesco: string | null;
}

interface AthleteFormValues {
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  fechaIngreso: string;
  categoriaId: string;
  guardianLinks: {
    acudienteId: string;
    busqueda: string;
    parentesco: string;
  }[];
}

type GuardianLinkForm = FormGroup<{
  acudienteId: FormControl<string>;
  busqueda: FormControl<string>;
  parentesco: FormControl<string>;
}>;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTO_DIMENSION = 1200;

@Component({
  selector: 'app-deportista-form',
  templateUrl: './deportista-form.page.html',
  standalone: false,
})
export class DeportistaFormPage implements OnInit {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  readonly categories = signal<CategoryOption[]>([]);
  readonly guardians = signal<GuardianOption[]>([]);
  readonly billingSettings = signal<SchoolBillingSettings | null>(null);
  readonly isLoadingOptions = signal(true);
  readonly isLoadingRecord = signal(false);
  readonly isSaving = signal(false);
  readonly canEditSchedule = signal(true);
  readonly editingId = signal<string | null>(
    this.route.snapshot.paramMap.get('id'),
  );
  private readonly originalSchedule = signal<{
    categoriaId: string;
    fechaIngreso: string;
  } | null>(null);
  readonly photoDataUrl = signal<string | null>(null);
  readonly photoError = signal('');
  readonly errorMessage = signal('');
  readonly cameraIcon = cameraOutline;
  readonly galleryIcon = imagesOutline;
  readonly addIcon = addOutline;
  readonly removePhotoIcon = closeCircleOutline;
  readonly parentescos = [
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
  ];

  readonly form = new FormGroup({
    nombres: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    apellidos: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    fechaNacimiento: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    fechaIngreso: new FormControl(this.getLocalDate(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    categoriaId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    guardianLinks: new FormArray<GuardianLinkForm>([]),
  });

  get guardianLinks(): FormArray<GuardianLinkForm> {
    return this.form.controls.guardianLinks;
  }

  get today(): string {
    return this.getLocalDate();
  }

  ngOnInit(): void {
    void this.loadInitialData();
  }

  registrationAmount(): number {
    const settings = this.billingSettings();
    const entryDate = this.form.controls.fechaIngreso.value;
    if (
      !settings?.fecha_inicio_control_pagos ||
      entryDate < settings.fecha_inicio_control_pagos
    ) {
      return 0;
    }
    return Number(settings.valor_inscripcion_pesos ?? 0);
  }

  isLegacyAthlete(): boolean {
    const startDate = this.billingSettings()?.fecha_inicio_control_pagos;
    return Boolean(startDate && this.form.controls.fechaIngreso.value < startDate);
  }

  addGuardianLink(): void {
    this.guardianLinks.push(this.createGuardianLinkForm());
  }

  removeGuardianLink(index: number): void {
    this.guardianLinks.removeAt(index);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.photoError.set('');
    if (!file.type.startsWith('image/')) {
      this.photoError.set('Selecciona un archivo de imagen.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.photoError.set('La foto debe pesar menos de 8 MB.');
      return;
    }

    void this.compressPhoto(file)
      .then((dataUrl) => this.photoDataUrl.set(dataUrl))
      .catch(() =>
        this.photoError.set('No se pudo cargar la foto. Inténtalo de nuevo.'),
      );
  }

  removePhoto(): void {
    this.photoDataUrl.set(null);
    this.photoError.set('');
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving()) {
      return;
    }

    const values = this.form.getRawValue();
    const guardianIds = values.guardianLinks.map((link) => link.acudienteId);
    if (new Set(guardianIds).size !== guardianIds.length) {
      this.errorMessage.set('No repitas el mismo acudiente en la lista.');
      return;
    }
    if (values.fechaIngreso > this.getLocalDate()) {
      this.errorMessage.set('La fecha de ingreso no puede estar en el futuro.');
      return;
    }

    const editingId = this.editingId();
    if (editingId) {
      await this.updateAthlete(editingId, values);
      return;
    }

    const settings = this.billingSettings();
    const controlStartDate = settings?.fecha_inicio_control_pagos;
    if (!settings || !controlStartDate) {
      this.errorMessage.set(
        'Configura primero la fecha de inicio del control en Datos de la escuela.',
      );
      return;
    }

    const isNewForBilling = values.fechaIngreso >= controlStartDate;
    if (
      isNewForBilling &&
      settings.valor_inscripcion_pesos === null
    ) {
      this.errorMessage.set(
        'Configura primero el valor de inscripción en Datos de la escuela.',
      );
      return;
    }
    const registrationFee = isNewForBilling
      ? Number(settings.valor_inscripcion_pesos)
      : 0;
    if (!Number.isSafeInteger(registrationFee) || registrationFee < 0) {
      this.errorMessage.set(
        'Configura primero el valor de inscripción en Datos de la escuela.',
      );
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      const database = await this.database.getConnection();
      const athleteId = crypto.randomUUID();
      const registrationDate = values.fechaIngreso;
      const billingPeriod = registrationDate.slice(0, 7);
      const periodStart = `${billingPeriod}-01`;
      let initialMonthly: { tariffId: string; amount: number } | null = null;

      if (isNewForBilling) {
        const tariffResult = await database.query(
          `SELECT id, monto_pesos
           FROM tarifas_categoria
           WHERE categoria_id = ?
             AND vigente_desde <= ?
             AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
           ORDER BY vigente_desde DESC
           LIMIT 1`,
          [values.categoriaId, periodStart, periodStart],
        );
        const tariff = tariffResult.values?.[0] as
          | { id: string; monto_pesos: number }
          | undefined;
        if (!tariff) {
          this.errorMessage.set(
            'La categoría no tiene una tarifa vigente para el mes de ingreso.',
          );
          return;
        }
        initialMonthly = {
          tariffId: tariff.id,
          amount: Number(tariff.monto_pesos),
        };
      }

      await database.beginTransaction();
      try {
        await database.run(
          `INSERT INTO deportistas
            (id, categoria_id, nombres, apellidos, fecha_nacimiento,
             fecha_ingreso, estado, foto_data_url)
           VALUES (?, ?, ?, ?, ?, ?, 'activo', ?)`,
          [
            athleteId,
            values.categoriaId,
            values.nombres.trim(),
            values.apellidos.trim(),
            values.fechaNacimiento,
            registrationDate,
            this.photoDataUrl(),
          ],
          false,
        );

        await database.run(
          `INSERT INTO deportista_categoria_historial
            (id, deportista_id, categoria_id, vigente_desde)
           VALUES (?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            athleteId,
            values.categoriaId,
            registrationDate,
          ],
          false,
        );

        if (isNewForBilling && registrationFee > 0) {
          const registrationId = crypto.randomUUID();
          await database.run(
            `INSERT INTO inscripciones
              (id, deportista_id, fecha_inscripcion, monto_pesos)
             VALUES (?, ?, ?, ?)`,
            [registrationId, athleteId, registrationDate, registrationFee],
            false,
          );
          await this.writeFinancialAudit(
            database,
            'OBLIGACION_GENERADA',
            'inscripcion',
            registrationId,
            `Inscripción de ${values.nombres.trim()} ${values.apellidos.trim()}`,
          );
        }

        if (isNewForBilling && initialMonthly) {
          const monthlyId = crypto.randomUUID();
          await database.run(
            `INSERT INTO mensualidades
              (id, deportista_id, tarifa_id, periodo, fecha_vencimiento,
               monto_pesos, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              monthlyId,
              athleteId,
              initialMonthly.tariffId,
              billingPeriod,
              this.dueDateForPeriod(
                billingPeriod,
                settings.dia_vencimiento_mensual,
              ),
              initialMonthly.amount,
              this.auth.currentUsername,
            ],
            false,
          );
          await this.writeFinancialAudit(
            database,
            'OBLIGACION_GENERADA',
            'mensualidad',
            monthlyId,
            `Mensualidad de ingreso ${billingPeriod}`,
          );
        }

        for (const link of values.guardianLinks) {
          await database.run(
            `INSERT INTO deportista_acudiente
              (deportista_id, acudiente_id, parentesco)
             VALUES (?, ?, ?)`,
            [athleteId, link.acudienteId, link.parentesco.trim()],
            false,
          );
        }
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      await this.router.navigateByUrl('/gestion/deportistas', {
        replaceUrl: true,
      });
    } catch {
      this.errorMessage.set(
        'No se pudo guardar el deportista. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  private async updateAthlete(
    athleteId: string,
    values: AthleteFormValues,
  ): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        const scheduleEditable = await this.canUpdateSchedule(
          database,
          athleteId,
        );
        const original = this.originalSchedule();
        if (!scheduleEditable && !original) {
          throw new Error('ATHLETE_NOT_LOADED');
        }
        const categoriaId = scheduleEditable
          ? values.categoriaId
          : original?.categoriaId;
        const fechaIngreso = scheduleEditable
          ? values.fechaIngreso
          : original?.fechaIngreso;

        await database.run(
          `UPDATE deportistas
           SET categoria_id = ?,
               nombres = ?,
               apellidos = ?,
               fecha_nacimiento = ?,
               fecha_ingreso = ?,
               foto_data_url = ?,
               actualizado_en = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            categoriaId,
            values.nombres.trim(),
            values.apellidos.trim(),
            values.fechaNacimiento,
            fechaIngreso,
            this.photoDataUrl(),
            athleteId,
          ],
          false,
        );

        if (scheduleEditable) {
          await database.run(
            `DELETE FROM deportista_categoria_historial
             WHERE deportista_id = ?`,
            [athleteId],
            false,
          );
          await database.run(
            `INSERT INTO deportista_categoria_historial
              (id, deportista_id, categoria_id, vigente_desde)
             VALUES (?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              athleteId,
              categoriaId,
              fechaIngreso,
            ],
            false,
          );
        }

        await database.run(
          `DELETE FROM deportista_acudiente WHERE deportista_id = ?`,
          [athleteId],
          false,
        );
        for (const link of values.guardianLinks) {
          await database.run(
            `INSERT INTO deportista_acudiente
              (deportista_id, acudiente_id, parentesco)
             VALUES (?, ?, ?)`,
            [athleteId, link.acudienteId, link.parentesco.trim()],
            false,
          );
        }
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      await this.router.navigateByUrl('/gestion/deportistas', {
        replaceUrl: true,
      });
    } catch {
      this.errorMessage.set(
        'No se pudo actualizar el deportista. Inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): Promise<boolean> {
    return this.router.navigateByUrl('/gestion/deportistas');
  }

  formatGuardian(guardian: GuardianOption): string {
    const identification = [
      guardian.tipo_documento,
      guardian.numero_documento,
    ]
      .filter(Boolean)
      .join(' ');
    return `${guardian.nombres} ${guardian.apellidos}${
      identification ? ` · ${identification}` : ''
    }`;
  }

  guardianById(id: string): GuardianOption | undefined {
    return this.guardians().find((guardian) => guardian.id === id);
  }

  filteredGuardians(link: GuardianLinkForm): GuardianOption[] {
    const takenIds = new Set(
      this.guardianLinks.controls
        .filter((other) => other !== link)
        .map((other) => other.controls.acudienteId.value),
    );
    const query = this.normalize(link.controls.busqueda.value);
    return this.guardians().filter(
      (guardian) =>
        !takenIds.has(guardian.id) &&
        (!query ||
          [
            guardian.nombres,
            guardian.apellidos,
            guardian.tipo_documento,
            guardian.numero_documento,
          ].some((value) => this.normalize(value ?? '').includes(query))),
    );
  }

  selectGuardian(link: GuardianLinkForm, guardianId: string): void {
    link.controls.acudienteId.setValue(guardianId);
    link.controls.acudienteId.markAsTouched();
    link.controls.busqueda.setValue('');
  }

  clearGuardianSelection(link: GuardianLinkForm): void {
    link.controls.acudienteId.setValue('');
  }

  private async loadInitialData(): Promise<void> {
    const tasks = [
      this.loadCategories(),
      this.loadGuardians(),
      this.loadBillingSettings(),
    ];
    const editingId = this.editingId();
    if (editingId) {
      tasks.push(this.loadAthlete(editingId));
    }

    try {
      await Promise.all(tasks);
    } finally {
      this.isLoadingOptions.set(false);
    }
  }

  private createGuardianLinkForm(
    acudienteId = '',
    parentesco = '',
  ): GuardianLinkForm {
    return new FormGroup({
      acudienteId: new FormControl(acudienteId, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      busqueda: new FormControl('', {
        nonNullable: true,
      }),
      parentesco: new FormControl(parentesco, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(60)],
      }),
    });
  }

  private async loadAthlete(athleteId: string): Promise<void> {
    this.isLoadingRecord.set(true);
    try {
      const database = await this.database.getConnection();
      const today = this.getLocalDate();
      const [athleteResult, guardianLinksResult] = await Promise.all([
        database.query(
          `SELECT
             d.id,
             d.categoria_id,
             COALESCE(h.categoria_id, d.categoria_id) AS categoria_vigente,
             d.nombres,
             d.apellidos,
             d.fecha_nacimiento,
             d.fecha_ingreso,
             d.estado,
             d.foto_data_url
           FROM deportistas d
           LEFT JOIN deportista_categoria_historial h
             ON h.deportista_id = d.id
            AND h.vigente_desde <= ?
            AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
           WHERE d.id = ?
           LIMIT 1`,
          [today, today, athleteId],
        ),
        database.query(
          `SELECT acudiente_id, parentesco
           FROM deportista_acudiente
           WHERE deportista_id = ?`,
          [athleteId],
        ),
      ]);
      const athlete = athleteResult.values?.[0] as AthleteRecord | undefined;
      if (!athlete || athlete.estado !== 'activo') {
        this.errorMessage.set('No encontramos el deportista solicitado.');
        return;
      }

      const scheduleEditable = await this.canUpdateSchedule(database, athleteId);
      const schedule = {
        categoriaId: athlete.categoria_vigente,
        fechaIngreso: athlete.fecha_ingreso,
      };
      this.canEditSchedule.set(scheduleEditable);
      this.originalSchedule.set(schedule);
      this.form.patchValue({
        nombres: athlete.nombres,
        apellidos: athlete.apellidos,
        fechaNacimiento: athlete.fecha_nacimiento,
        fechaIngreso: athlete.fecha_ingreso,
        categoriaId: athlete.categoria_vigente,
      });
      this.setScheduleEditable(scheduleEditable);
      this.photoDataUrl.set(athlete.foto_data_url);
      this.guardianLinks.clear();
      for (const link of (guardianLinksResult.values ?? []) as GuardianLinkRecord[]) {
        this.guardianLinks.push(
          this.createGuardianLinkForm(
            link.acudiente_id,
            link.parentesco ?? '',
          ),
        );
      }
      this.form.markAsPristine();
      this.form.markAsUntouched();
    } catch {
      this.errorMessage.set('No se pudo cargar el deportista.');
    } finally {
      this.isLoadingRecord.set(false);
    }
  }

  private async canUpdateSchedule(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    athleteId: string,
  ): Promise<boolean> {
    const result = await database.query(
      `SELECT
         EXISTS(SELECT 1 FROM mensualidades WHERE deportista_id = ?)
           OR EXISTS(SELECT 1 FROM inscripciones WHERE deportista_id = ?)
           AS obligations,
         (SELECT COUNT(*) FROM deportista_categoria_historial
           WHERE deportista_id = ?) AS history`,
      [athleteId, athleteId, athleteId],
    );
    const row = result.values?.[0] as
      | { obligations: number; history: number }
      | undefined;
    return !Number(row?.obligations ?? 0) && Number(row?.history ?? 0) <= 1;
  }

  private setScheduleEditable(editable: boolean): void {
    const options = { emitEvent: false };
    if (editable) {
      this.form.controls.fechaIngreso.enable(options);
      this.form.controls.categoriaId.enable(options);
      return;
    }
    this.form.controls.fechaIngreso.disable(options);
    this.form.controls.categoriaId.disable(options);
  }

  private async loadCategories(): Promise<void> {
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT id, nombre
         FROM categorias
         WHERE activa = 1
         ORDER BY nombre COLLATE NOCASE`,
      );
      this.categories.set((result.values ?? []) as CategoryOption[]);
    } catch {
      this.errorMessage.set('No se pudieron cargar las categorías.');
    }
  }

  private async loadGuardians(): Promise<void> {
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT id, nombres, apellidos, tipo_documento, numero_documento
         FROM acudientes
         ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE`,
      );
      this.guardians.set((result.values ?? []) as GuardianOption[]);
    } catch {
      this.errorMessage.set('No se pudieron cargar los acudientes.');
    }
  }

  private async loadBillingSettings(): Promise<void> {
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT fecha_inicio_control_pagos, valor_inscripcion_pesos,
                dia_vencimiento_mensual
         FROM escuela
         WHERE id = 1
         LIMIT 1`,
      );
      this.billingSettings.set(
        (result.values?.[0] as SchoolBillingSettings | undefined) ?? null,
      );
    } catch {
      this.errorMessage.set('No se pudo cargar la configuración de cobros.');
    }
  }

  private async writeFinancialAudit(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    action: string,
    entity: string,
    entityId: string,
    detail: string,
  ): Promise<void> {
    await database.run(
      `INSERT INTO auditoria_financiera
        (id, accion, entidad, entidad_id, actor, detalle)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        action,
        entity,
        entityId,
        this.auth.currentUsername ?? 'local',
        detail,
      ],
      false,
    );
  }

  private dueDateForPeriod(period: string, dueDay: number): string {
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${period}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
  }

  private normalize(value: string): string {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  }

  private getLocalDate(): string {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }

  private async compressPhoto(file: File): Promise<string> {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Unsupported image data'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image decoding failed'));
      image.src = source;
    });

    const scale = Math.min(
      1,
      MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is unavailable');
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.78);
  }
}
