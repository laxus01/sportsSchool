import { Component, inject, signal } from '@angular/core';

import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';

interface ChargeCandidate {
  deportista_id: string;
  nombre: string;
  categoria: string | null;
  tarifa_id: string | null;
  monto_pesos: number | null;
}

interface BillingSettings {
  fecha_inicio_control_pagos: string | null;
  dia_vencimiento_mensual: number;
}

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-generacion-obligaciones',
  templateUrl: './generacion-obligaciones.page.html',
  styleUrls: ['./generacion-obligaciones.page.scss'],
  standalone: false,
})
export class GeneracionObligacionesPage {
  private readonly database = inject(DatabaseService);
  private readonly auth = inject(AuthService);

  readonly billingSettings = signal<BillingSettings | null>(null);
  readonly billingPeriod = signal(this.currentPeriod());
  readonly chargePreview = signal<ChargeCandidate[]>([]);
  readonly skippedChargePreview = signal<ChargeCandidate[]>([]);
  readonly chargeableCount = signal(0);
  readonly missingTariffCount = signal(0);
  readonly isLoading = signal(true);
  readonly isGenerating = signal(false);
  readonly isGenerationAlertOpen = signal(false);
  readonly pageError = signal('');
  readonly generationMessage = signal('');
  readonly generationAlertButtons = [
    { text: 'Cancelar', role: 'cancel' },
    {
      text: 'Generar',
      role: 'confirm',
      handler: () => {
        void this.generatePeriodCharges();
      },
    },
  ];

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  ionViewWillEnter(): Promise<void> {
    return this.loadPage();
  }

  get today(): string {
    return localDateString();
  }

  updateBillingPeriod(event: CustomEvent<{ value?: string | null }>): void {
    this.billingPeriod.set(event.detail.value ?? this.currentPeriod());
    void this.loadChargePreview();
  }

  askToGeneratePeriodCharges(): void {
    const startDate = this.billingSettings()?.fecha_inicio_control_pagos;
    if (!startDate) {
      this.generationMessage.set(
        'Configura primero la fecha de inicio del control en Datos de la escuela.',
      );
      return;
    }
    if (this.billingPeriod() < startDate.slice(0, 7)) {
      this.generationMessage.set(
        'No se pueden generar cargos anteriores al inicio del control.',
      );
      return;
    }
    if (this.billingPeriod() > this.currentPeriod()) {
      this.generationMessage.set(
        'No se pueden generar mensualidades de periodos futuros.',
      );
      return;
    }
    this.generationMessage.set('');
    this.isGenerationAlertOpen.set(true);
  }

  async generatePeriodCharges(): Promise<void> {
    if (this.isGenerating() || this.chargeableCount() === 0) {
      return;
    }
    const settings = this.billingSettings();
    const period = this.billingPeriod();
    if (
      !settings?.fecha_inicio_control_pagos ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
      period < settings.fecha_inicio_control_pagos.slice(0, 7) ||
      period > this.currentPeriod()
    ) {
      this.generationMessage.set(
        'El periodo no es válido o está fuera del control de cobros.',
      );
      return;
    }

    this.isGenerationAlertOpen.set(false);
    this.isGenerating.set(true);
    this.generationMessage.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        const candidates = await this.queryChargeCandidates(database, period);
        const chargeable = candidates.filter(
          (candidate) =>
            candidate.tarifa_id !== null && candidate.monto_pesos !== null,
        );
        if (!chargeable.length) {
          await database.commitTransaction();
          this.generationMessage.set(
            'No hay deportistas elegibles con una tarifa vigente para este periodo.',
          );
          return;
        }

        for (const candidate of chargeable) {
          const monthlyId = crypto.randomUUID();
          await database.run(
            `INSERT INTO mensualidades
              (id, deportista_id, tarifa_id, periodo, fecha_vencimiento,
               monto_pesos, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              monthlyId,
              candidate.deportista_id,
              candidate.tarifa_id,
              period,
              this.dueDateForPeriod(
                period,
                settings.dia_vencimiento_mensual,
              ),
              Number(candidate.monto_pesos),
              this.auth.currentUsername,
            ],
            false,
          );
          await this.writeFinancialAudit(
            database,
            'OBLIGACION_GENERADA',
            'mensualidad',
            monthlyId,
            `Generación del periodo ${period}`,
          );
        }
        await database.commitTransaction();
        this.generationMessage.set(
          `Se generaron ${chargeable.length} mensualidades de ${period}. ${
            candidates.length - chargeable.length
          } deportista(s) no tenían tarifa vigente.`,
        );
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      await this.loadPage();
    } catch {
      this.generationMessage.set('No se pudieron generar las mensualidades.');
    } finally {
      this.isGenerating.set(false);
    }
  }

  formatAmount(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  formatCandidateAmount(candidate: ChargeCandidate): string {
    return candidate.monto_pesos === null
      ? 'Sin tarifa'
      : this.formatAmount(Number(candidate.monto_pesos));
  }

  skippedAthleteNames(): string {
    return this.skippedChargePreview()
      .map((candidate) => candidate.nombre)
      .join(', ');
  }

  private async loadPage(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT fecha_inicio_control_pagos, dia_vencimiento_mensual
         FROM escuela WHERE id = 1 LIMIT 1`,
      );
      this.billingSettings.set(
        (result.values?.[0] as BillingSettings | undefined) ?? null,
      );
      await this.refreshChargePreview(database);
    } catch {
      this.pageError.set('No se pudo cargar la generación de obligaciones.');
      this.chargeableCount.set(0);
      this.missingTariffCount.set(0);
      this.chargePreview.set([]);
      this.skippedChargePreview.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async refreshChargePreview(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
  ): Promise<void> {
    this.chargeableCount.set(0);
    this.missingTariffCount.set(0);
    this.chargePreview.set([]);
    this.skippedChargePreview.set([]);
    const startDate = this.billingSettings()?.fecha_inicio_control_pagos;
    const period = this.billingPeriod();
    if (
      !startDate ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
      period < startDate.slice(0, 7) ||
      period > this.currentPeriod()
    ) {
      return;
    }

    const candidates = await this.queryChargeCandidates(database, period);
    const chargeable = candidates.filter(
      (candidate) =>
        candidate.tarifa_id !== null && candidate.monto_pesos !== null,
    );
    const skipped = candidates.filter(
      (candidate) =>
        candidate.tarifa_id === null || candidate.monto_pesos === null,
    );
    this.chargePreview.set(chargeable);
    this.skippedChargePreview.set(skipped);
    this.chargeableCount.set(chargeable.length);
    this.missingTariffCount.set(skipped.length);
  }

  private async loadChargePreview(): Promise<void> {
    try {
      const database = await this.database.getConnection();
      await this.refreshChargePreview(database);
    } catch {
      this.chargeableCount.set(0);
      this.missingTariffCount.set(0);
      this.chargePreview.set([]);
      this.skippedChargePreview.set([]);
    }
  }

  private async queryChargeCandidates(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    period: string,
  ): Promise<ChargeCandidate[]> {
    const periodStart = `${period}-01`;
    const periodEnd = this.lastDateOfPeriod(period);
    const result = await database.query(
      `SELECT
         d.id AS deportista_id,
         d.nombres || ' ' || d.apellidos AS nombre,
         c.nombre AS categoria,
         t.id AS tarifa_id,
         t.monto_pesos
       FROM deportistas d
       LEFT JOIN deportista_categoria_historial h
         ON h.deportista_id = d.id
        AND h.vigente_desde <= ?
        AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
       LEFT JOIN tarifas_categoria t
         ON t.id = (
           SELECT current_tariff.id
           FROM tarifas_categoria current_tariff
           WHERE current_tariff.categoria_id =
             COALESCE(h.categoria_id, d.categoria_id)
             AND current_tariff.vigente_desde <= ?
             AND (current_tariff.vigente_hasta IS NULL
               OR current_tariff.vigente_hasta >= ?)
           ORDER BY current_tariff.vigente_desde DESC
           LIMIT 1
         )
       LEFT JOIN categorias c
         ON c.id = COALESCE(h.categoria_id, d.categoria_id)
       WHERE (d.estado = 'activo' OR d.fecha_retiro IS NOT NULL)
         AND (d.fecha_retiro IS NULL OR d.fecha_retiro > ?)
         AND d.fecha_ingreso <= ?
         AND NOT EXISTS (
           SELECT 1 FROM mensualidades m
           WHERE m.deportista_id = d.id AND m.periodo = ?
         )
       ORDER BY d.id`,
      [
        periodStart,
        periodStart,
        periodStart,
        periodStart,
        periodStart,
        periodEnd,
        period,
      ],
    );
    return (result.values ?? []) as ChargeCandidate[];
  }

  private async writeFinancialAudit(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    action: string,
    entity: string,
    entityId: string | null,
    detail: string,
  ): Promise<void> {
    await database.run(
      `INSERT INTO auditoria_financiera
        (id, accion, entidad, entidad_id, actor, motivo, detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        action,
        entity,
        entityId,
        this.auth.currentUsername ?? 'local',
        null,
        detail,
      ],
      false,
    );
  }

  private currentPeriod(): string {
    return localDateString().slice(0, 7);
  }

  private lastDateOfPeriod(period: string): string {
    const [year, month] = period.split('-').map(Number);
    const day = new Date(year, month, 0).getDate();
    return `${period}-${String(day).padStart(2, '0')}`;
  }

  private dueDateForPeriod(period: string, dueDay: number): string {
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${period}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
  }
}
