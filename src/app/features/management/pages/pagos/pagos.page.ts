import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  addOutline,
  cardOutline,
  chevronBackOutline,
  chevronDownOutline,
  pencilOutline,
} from 'ionicons/icons';
import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';

interface AthleteRecord {
  id: string;
  nombres: string;
  apellidos: string;
  numero_documento: string | null;
  categoria: string;
}

type ObligationType = 'mensualidad' | 'inscripcion' | 'cargo_adicional';

interface PendingObligation {
  id: string;
  tipo: ObligationType;
  periodo: string | null;
  fecha_vencimiento: string | null;
  descripcion?: string | null;
  monto_pesos: number;
  pagado_pesos: number;
  pendiente_pesos: number;
  orden: string;
}

interface TransferEntity {
  id: string;
  nombre: string;
}

interface PaymentRecord {
  id: string;
  fecha_pago: string;
  monto_pesos: number;
  medio_pago: 'efectivo' | 'transferencia';
  entidad: string | null;
  referencia: string | null;
  observacion: string | null;
  deportistas: string | null;
  periodos: string | null;
  cargos?: string | null;
  estado: 'registrado' | 'anulado';
  motivo_anulacion: string | null;
}

interface PaymentConceptRow {
  label: string;
  value: string;
}

const spanishMonths = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-pagos',
  templateUrl: './pagos.page.html',
  standalone: false,
})
export class PagosPage {
  private readonly database = inject(DatabaseService);
  private readonly auth = inject(AuthService);

  readonly icons = {
    addOutline,
    cardOutline,
    chevronBackOutline,
    chevronDownOutline,
    pencilOutline,
  };
  readonly payments = signal<PaymentRecord[]>([]);
  readonly athletes = signal<AthleteRecord[]>([]);
  readonly transferEntities = signal<TransferEntity[]>([]);
  readonly pendingObligations = signal<PendingObligation[]>([]);
  readonly selectedAthlete = signal<AthleteRecord | null>(null);
  readonly selectedObligationIds = signal<string[]>([]);
  readonly athleteSearch = signal('');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isPaymentModalOpen = signal(false);
  readonly isVoidModalOpen = signal(false);
  readonly selectedPaymentToVoid = signal<PaymentRecord | null>(null);
  readonly isEditModalOpen = signal(false);
  readonly editingPayment = signal<PaymentRecord | null>(null);
  readonly pageError = signal('');
  readonly modalError = signal('');
  readonly editPaymentForm = new FormGroup({
    referencia: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(240)],
    }),
  });
  readonly cancelReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(240)],
  });
  readonly filteredAthletes = computed(() => {
    const query = this.normalize(this.athleteSearch());
    if (!query) {
      return this.athletes();
    }
    return this.athletes().filter((athlete) =>
      [
        athlete.nombres,
        athlete.apellidos,
        athlete.numero_documento ?? '',
        athlete.categoria,
      ].some((value) => this.normalize(value).includes(query)),
    );
  });

  readonly selectedObligations = computed(() =>
    this.pendingObligations()
      .filter((obligation) =>
        this.selectedObligationIds().includes(obligation.id),
      )
      .sort((a, b) => a.orden.localeCompare(b.orden)),
  );

  readonly selectedPendingTotal = computed(() =>
    this.selectedObligations().reduce(
      (total, obligation) => total + obligation.pendiente_pesos,
      0,
    ),
  );

  readonly paymentForm = new FormGroup({
    fechaPago: new FormControl(localDateString(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    monto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+$/)],
    }),
    medioPago: new FormControl<'efectivo' | 'transferencia'>('efectivo', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    entidadId: new FormControl('', { nonNullable: true }),
    referencia: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(240)],
    }),
  });

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  get today(): string {
    return localDateString();
  }

  ionViewWillEnter(): Promise<void> {
    return this.loadPage();
  }

  async openPaymentModal(): Promise<void> {
    this.resetPaymentForm();
    this.isPaymentModalOpen.set(true);
    this.modalError.set('');
    this.selectedAthlete.set(null);
    this.selectedObligationIds.set([]);
    this.pendingObligations.set([]);
    this.athleteSearch.set('');

    try {
      const database = await this.database.getConnection();
      const [athletesResult, entitiesResult] = await Promise.all([
        database.query(
          `SELECT d.id, d.nombres, d.apellidos, d.numero_documento,
                  c.nombre AS categoria
           FROM deportistas d
           LEFT JOIN deportista_categoria_historial h
             ON h.deportista_id = d.id
            AND h.vigente_desde <= ?
            AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
           LEFT JOIN categorias c
             ON c.id = COALESCE(h.categoria_id, d.categoria_id)
           WHERE d.estado = 'activo'
             OR EXISTS (
               SELECT 1 FROM mensualidades m
               WHERE m.deportista_id = d.id
             )
             OR EXISTS (
               SELECT 1 FROM inscripciones i
               WHERE i.deportista_id = d.id
             )
           ORDER BY d.apellidos COLLATE NOCASE, d.nombres COLLATE NOCASE`,
          [this.today, this.today],
        ),
        database.query(
          `SELECT id, nombre
           FROM entidades_transferencia
           WHERE activa = 1
           ORDER BY nombre COLLATE NOCASE`,
        ),
      ]);
      this.athletes.set((athletesResult.values ?? []) as AthleteRecord[]);
      this.transferEntities.set(
        (entitiesResult.values ?? []) as TransferEntity[],
      );
    } catch {
      this.modalError.set('No se pudieron cargar deportistas y medios de pago.');
    }
  }

  closePaymentModal(): void {
    if (this.isSaving()) {
      return;
    }
    this.isPaymentModalOpen.set(false);
    this.modalError.set('');
  }

  updateAthleteSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.athleteSearch.set(event.detail.value ?? '');
  }

  async chooseAthlete(athlete: AthleteRecord): Promise<void> {
    this.selectedAthlete.set(athlete);
    this.athleteSearch.set('');
    this.selectedObligationIds.set([]);
    this.pendingObligations.set([]);
    this.paymentForm.controls.monto.setValue('');
    this.modalError.set('');

    try {
      const database = await this.database.getConnection();
      this.pendingObligations.set(
        await this.queryPendingObligations(database, athlete.id),
      );
    } catch {
      this.modalError.set('No se pudieron consultar las obligaciones pendientes.');
    }
  }

  changeAthlete(): void {
    this.selectedAthlete.set(null);
    this.selectedObligationIds.set([]);
    this.pendingObligations.set([]);
    this.paymentForm.controls.monto.setValue('');
  }

  toggleObligation(obligation: PendingObligation, checked: boolean): void {
    const selected = new Set(this.selectedObligationIds());
    if (checked) {
      selected.add(obligation.id);
    } else {
      selected.delete(obligation.id);
    }
    this.selectedObligationIds.set([...selected]);
    this.paymentForm.controls.monto.setValue(
      this.selectedPendingTotal() ? String(this.selectedPendingTotal()) : '',
    );
  }

  setPaymentMethod(value: 'efectivo' | 'transferencia'): void {
    this.paymentForm.controls.medioPago.setValue(value);
    this.paymentForm.controls.entidadId.setValue('');
    this.paymentForm.controls.entidadId.setValidators(
      value === 'transferencia' ? [Validators.required] : [],
    );
    this.paymentForm.controls.entidadId.updateValueAndValidity();
  }

  formatAmount(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  formatPeriod(period: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) {
      return period;
    }
    const month = Number(match[2]);
    return month >= 1 && month <= 12
      ? `${spanishMonths[month - 1]} ${match[1]}`
      : period;
  }

  paymentConceptRows(payment: PaymentRecord): PaymentConceptRow[] {
    const concepts = (payment.periodos ?? '')
      .split(',')
      .map((concept) => concept.trim())
      .filter(Boolean);
    const rows = concepts
      .filter((concept) => concept !== 'Inscripción')
      .sort()
      .map((period) => ({
        label: 'Mensualidad',
        value: this.formatPeriod(period),
      }));

    if (concepts.includes('Inscripción')) {
      rows.push({
        label: 'Inscripción',
        value: 'Incluida',
      });
    }
    if (payment.cargos) {
      rows.push({
        label: 'Cargo adicional',
        value: payment.cargos,
      });
    }

    return rows.length
      ? rows
      : [{ label: 'Concepto', value: 'No especificado' }];
  }

  obligationLabel(obligation: PendingObligation): string {
    if (obligation.tipo === 'inscripcion') {
      return 'Inscripción';
    }
    if (obligation.tipo === 'cargo_adicional') {
      return obligation.descripcion ?? 'Cargo adicional';
    }
    return `Mensualidad ${this.formatPeriod(obligation.periodo ?? '')}`;
  }

  paymentMethodLabel(payment: PaymentRecord): string {
    return payment.medio_pago === 'efectivo'
      ? 'Efectivo'
      : payment.entidad ?? 'Transferencia';
  }

  async savePayment(): Promise<void> {
    this.paymentForm.markAllAsTouched();
    if (
      this.paymentForm.invalid ||
      !this.selectedAthlete() ||
      !this.selectedObligations().length ||
      this.isSaving()
    ) {
      return;
    }

    const amount = Number(this.paymentForm.controls.monto.value);
    if (this.paymentForm.controls.fechaPago.value > localDateString()) {
      this.modalError.set('La fecha del pago no puede ser futura.');
      return;
    }
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > this.selectedPendingTotal()
    ) {
      this.modalError.set(
        'El pago debe ser mayor que cero y no superar el saldo seleccionado.',
      );
      return;
    }

    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      const values = this.paymentForm.getRawValue();
      const paymentId = crypto.randomUUID();
      const transferEntityId =
        values.medioPago === 'transferencia' ? values.entidadId : null;

      await database.beginTransaction();
      try {
        const selectedIds = new Set(this.selectedObligationIds());
        const currentObligations = (
          await this.queryPendingObligations(database, this.selectedAthlete()!.id)
        ).filter((obligation) => selectedIds.has(obligation.id));
        const currentTotal = currentObligations.reduce(
          (total, obligation) => total + obligation.pendiente_pesos,
          0,
        );
        if (
          currentObligations.length !== selectedIds.size ||
          amount > currentTotal
        ) {
          throw new Error('BALANCE_CHANGED');
        }

        await database.run(
          `INSERT INTO pagos
            (id, acudiente_id, fecha_pago, monto_pesos, medio_pago,
             entidad_transferencia_id, referencia, observacion, creado_por,
             estado)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'registrado')`,
          [
            paymentId,
            values.fechaPago,
            amount,
            values.medioPago,
            transferEntityId,
            values.referencia.trim() || null,
            values.observacion.trim() || null,
            this.auth.currentUsername,
          ],
          false,
        );

        let remainingAmount = amount;
        const applied: string[] = [];
        for (const obligation of currentObligations.sort((a, b) =>
          a.orden.localeCompare(b.orden),
        )) {
          if (remainingAmount === 0) {
            break;
          }
          const appliedAmount = Math.min(
            obligation.pendiente_pesos,
            remainingAmount,
          );
          if (obligation.tipo === 'mensualidad') {
            await database.run(
              `INSERT INTO pago_mensualidad
                (pago_id, mensualidad_id, monto_aplicado_pesos)
               VALUES (?, ?, ?)`,
              [paymentId, obligation.id, appliedAmount],
              false,
            );
          } else if (obligation.tipo === 'inscripcion') {
            await database.run(
              `INSERT INTO pago_inscripcion
                (pago_id, inscripcion_id, monto_aplicado_pesos)
               VALUES (?, ?, ?)`,
              [paymentId, obligation.id, appliedAmount],
              false,
            );
          } else {
            await database.run(
              `INSERT INTO pago_cargo_adicional
                (pago_id, cargo_adicional_id, monto_aplicado_pesos)
               VALUES (?, ?, ?)`,
              [paymentId, obligation.id, appliedAmount],
              false,
            );
          }
          applied.push(
            `${obligation.tipo}:${obligation.id}:${appliedAmount}`,
          );
          remainingAmount -= appliedAmount;
        }
        if (remainingAmount !== 0) {
          throw new Error('PAYMENT_REMAINDER');
        }
        await this.writeFinancialAudit(
          database,
          'PAGO_REGISTRADO',
          'pago',
          paymentId,
          JSON.stringify({ deportistaId: this.selectedAthlete()!.id, applied }),
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      this.isPaymentModalOpen.set(false);
      await this.loadPage();
    } catch (error) {
      this.modalError.set(
        String(error).includes('BALANCE_CHANGED')
          ? 'El saldo cambió mientras registrabas el pago. Actualiza las obligaciones y vuelve a intentarlo.'
          : 'No se pudo guardar el pago. Inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadPage(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT
           p.id,
           p.fecha_pago,
           p.monto_pesos,
           p.medio_pago,
           p.referencia,
           p.observacion,
           p.estado,
           p.motivo_anulacion,
           et.nombre AS entidad,
           applied.deportistas,
           applied.periodos,
           applied.cargos
         FROM pagos p
         LEFT JOIN entidades_transferencia et
           ON et.id = p.entidad_transferencia_id
         LEFT JOIN (
           SELECT
             pago_id,
             GROUP_CONCAT(DISTINCT nombre) AS deportistas,
             GROUP_CONCAT(DISTINCT concepto) AS periodos,
             GROUP_CONCAT(DISTINCT cargo) AS cargos
           FROM (
             SELECT
               pm.pago_id,
               d.nombres || ' ' || d.apellidos AS nombre,
               m.periodo AS concepto,
               NULL AS cargo
             FROM pago_mensualidad pm
             JOIN mensualidades m ON m.id = pm.mensualidad_id
             JOIN deportistas d ON d.id = m.deportista_id
             UNION ALL
             SELECT
               pi.pago_id,
               d.nombres || ' ' || d.apellidos AS nombre,
               'Inscripción' AS concepto,
               NULL AS cargo
             FROM pago_inscripcion pi
             JOIN inscripciones i ON i.id = pi.inscripcion_id
             JOIN deportistas d ON d.id = i.deportista_id
             UNION ALL
             SELECT
               pc.pago_id,
               d.nombres || ' ' || d.apellidos AS nombre,
               NULL AS concepto,
               ca.descripcion AS cargo
             FROM pago_cargo_adicional pc
             JOIN cargos_adicionales ca
               ON ca.id = pc.cargo_adicional_id
             JOIN deportistas d ON d.id = ca.deportista_id
           )
           GROUP BY pago_id
         ) applied ON applied.pago_id = p.id
         ORDER BY p.fecha_pago DESC, p.creado_en DESC`,
      );
      this.payments.set((result.values ?? []) as PaymentRecord[]);
    } catch {
      this.pageError.set('No se pudieron cargar los pagos.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async queryPendingObligations(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    athleteId: string,
  ): Promise<PendingObligation[]> {
    const result = await database.query(
      `SELECT
         id,
         tipo,
         periodo,
         fecha_vencimiento,
         descripcion,
         monto_pesos,
         pagado_pesos,
         monto_pesos - pagado_pesos AS pendiente_pesos,
         COALESCE(fecha_vencimiento, periodo) AS orden
       FROM (
         SELECT
           m.id,
           'mensualidad' AS tipo,
           m.periodo,
           m.fecha_vencimiento,
           NULL AS descripcion,
           m.monto_pesos,
           COALESCE((
             SELECT SUM(pm.monto_aplicado_pesos)
             FROM pago_mensualidad pm
             JOIN pagos p ON p.id = pm.pago_id
             WHERE pm.mensualidad_id = m.id
               AND p.estado = 'registrado'
           ), 0) AS pagado_pesos
         FROM mensualidades m
         WHERE m.deportista_id = ? AND m.estado = 'activa'
         UNION ALL
         SELECT
           i.id,
           'inscripcion' AS tipo,
           NULL AS periodo,
           i.fecha_inscripcion AS fecha_vencimiento,
           NULL AS descripcion,
           i.monto_pesos,
           COALESCE((
             SELECT SUM(pi.monto_aplicado_pesos)
             FROM pago_inscripcion pi
             JOIN pagos p ON p.id = pi.pago_id
             WHERE pi.inscripcion_id = i.id
               AND p.estado = 'registrado'
           ), 0) AS pagado_pesos
         FROM inscripciones i
         WHERE i.deportista_id = ? AND i.estado = 'activa'
         UNION ALL
         SELECT
           c.id,
           'cargo_adicional' AS tipo,
           c.fecha_cargo AS periodo,
           NULL AS fecha_vencimiento,
           c.descripcion,
           c.monto_pesos,
           COALESCE((
             SELECT SUM(pc.monto_aplicado_pesos)
             FROM pago_cargo_adicional pc
             JOIN pagos p ON p.id = pc.pago_id
             WHERE pc.cargo_adicional_id = c.id
               AND p.estado = 'registrado'
           ), 0) AS pagado_pesos
         FROM cargos_adicionales c
         WHERE c.deportista_id = ?
       )
       WHERE monto_pesos > pagado_pesos
       ORDER BY orden, tipo`,
      [athleteId, athleteId, athleteId],
    );
    return (result.values ?? []).map((row) => {
      const obligation = row as PendingObligation;
      const amount = Number(obligation.monto_pesos);
      const paid = Number(obligation.pagado_pesos);
      return {
        ...obligation,
        monto_pesos: amount,
        pagado_pesos: paid,
        pendiente_pesos: amount - paid,
        orden: String(obligation.orden),
      };
    });
  }

  private async writeFinancialAudit(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    action: string,
    entity: string,
    entityId: string | null,
    detail: string,
    reason: string | null = null,
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
        reason,
        detail,
      ],
      false,
    );
  }

  async voidPayment(): Promise<void> {
    const payment = this.selectedPaymentToVoid();
    this.cancelReason.markAsTouched();
    const reason = this.cancelReason.value.trim();
    if (!payment || !reason || this.cancelReason.invalid || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        const result = await database.query(
          `SELECT estado FROM pagos WHERE id = ? LIMIT 1`,
          [payment.id],
        );
        if (result.values?.[0]?.['estado'] !== 'registrado') {
          throw new Error('PAYMENT_ALREADY_VOIDED');
        }
        await database.run(
          `UPDATE pagos
           SET estado = 'anulado',
               motivo_anulacion = ?,
               anulado_en = ?,
               anulado_por = ?
           WHERE id = ? AND estado = 'registrado'`,
          [
            reason,
            localDateString(),
            this.auth.currentUsername,
            payment.id,
          ],
          false,
        );
        await this.writeFinancialAudit(
          database,
          'PAGO_ANULADO',
          'pago',
          payment.id,
          `Pago por ${payment.monto_pesos} COP`,
          reason,
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      this.isVoidModalOpen.set(false);
      this.selectedPaymentToVoid.set(null);
      this.cancelReason.reset('');
      await this.loadPage();
    } catch {
      this.modalError.set('No se pudo anular el pago. Actualiza la lista e inténtalo de nuevo.');
    } finally {
      this.isSaving.set(false);
    }
  }

  openEditPayment(payment: PaymentRecord): void {
    this.editingPayment.set(payment);
    this.editPaymentForm.reset({
      referencia: payment.referencia ?? '',
      observacion: payment.observacion ?? '',
    });
    this.modalError.set('');
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    if (this.isSaving()) {
      return;
    }
    this.isEditModalOpen.set(false);
    this.editingPayment.set(null);
  }

  async savePaymentEdit(): Promise<void> {
    this.editPaymentForm.markAllAsTouched();
    const payment = this.editingPayment();
    if (!payment || this.editPaymentForm.invalid || this.isSaving()) {
      return;
    }
    const values = this.editPaymentForm.getRawValue();
    const referencia = values.referencia.trim() || null;
    const observacion = values.observacion.trim() || null;
    if (
      referencia === payment.referencia &&
      observacion === payment.observacion
    ) {
      this.isEditModalOpen.set(false);
      this.editingPayment.set(null);
      return;
    }

    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        await database.run(
          `UPDATE pagos
           SET referencia = ?, observacion = ?
           WHERE id = ?`,
          [referencia, observacion, payment.id],
          false,
        );
        await this.writeFinancialAudit(
          database,
          'PAGO_EDITADO',
          'pago',
          payment.id,
          JSON.stringify({
            referenciaAntes: payment.referencia,
            referenciaDespues: referencia,
            observacionAntes: payment.observacion,
            observacionDespues: observacion,
          }),
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      this.isEditModalOpen.set(false);
      this.editingPayment.set(null);
      await this.loadPage();
    } catch {
      this.modalError.set(
        'No se pudo actualizar el pago. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  openVoidPayment(payment: PaymentRecord): void {
    this.selectedPaymentToVoid.set(payment);
    this.cancelReason.reset('');
    this.modalError.set('');
    this.isVoidModalOpen.set(true);
  }

  closeVoidModal(): void {
    if (this.isSaving()) {
      return;
    }
    this.isVoidModalOpen.set(false);
    this.selectedPaymentToVoid.set(null);
    this.cancelReason.reset('');
  }

  private resetPaymentForm(): void {
    this.paymentForm.reset({
      fechaPago: localDateString(),
      monto: '',
      medioPago: 'efectivo',
      entidadId: '',
      referencia: '',
      observacion: '',
    });
    this.paymentForm.controls.entidadId.clearValidators();
    this.paymentForm.controls.entidadId.updateValueAndValidity();
  }

  private normalize(value: string): string {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  }
}
