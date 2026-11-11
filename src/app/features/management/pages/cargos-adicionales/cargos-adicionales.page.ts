import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';

interface AthleteRecord {
  id: string;
  nombres: string;
  apellidos: string;
  numero_documento: string | null;
  categoria: string;
}

interface CategoryRecord {
  id: string;
  nombre: string;
}

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-cargos-adicionales',
  templateUrl: './cargos-adicionales.page.html',
  styleUrls: ['./cargos-adicionales.page.scss'],
  standalone: false,
})
export class CargosAdicionalesPage {
  private readonly database = inject(DatabaseService);
  private readonly auth = inject(AuthService);

  readonly icons = { addOutline, chevronBackOutline };
  readonly chargeCategories = signal<CategoryRecord[]>([]);
  readonly chargeAthletes = signal<AthleteRecord[]>([]);
  readonly selectedChargeAthleteIds = signal<string[]>([]);
  readonly chargeCategoryId = signal('');
  readonly chargeAthleteSearch = signal('');
  readonly isModalOpen = signal(false);
  readonly isLoadingCategories = signal(false);
  readonly isCreatingCharge = signal(false);
  readonly additionalChargeMessage = signal('');
  readonly additionalChargeError = signal('');
  readonly additionalChargeForm = new FormGroup({
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(240)],
    }),
    monto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+$/)],
    }),
  });

  readonly filteredChargeAthletes = computed(() => {
    const query = this.normalize(this.chargeAthleteSearch());
    if (!query) {
      return this.chargeAthletes();
    }
    return this.chargeAthletes().filter((athlete) =>
      [athlete.nombres, athlete.apellidos, athlete.numero_documento ?? ''].some(
        (value) => this.normalize(value).includes(query),
      ),
    );
  });

  readonly allVisibleChargeAthletesSelected = computed(() => {
    const visible = this.filteredChargeAthletes();
    const selected = new Set(this.selectedChargeAthleteIds());
    return (
      visible.length > 0 && visible.every((athlete) => selected.has(athlete.id))
    );
  });

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  get today(): string {
    return localDateString();
  }

  async openModal(): Promise<void> {
    this.additionalChargeForm.reset({ descripcion: '', monto: '' });
    this.chargeCategoryId.set('');
    this.chargeCategories.set([]);
    this.chargeAthletes.set([]);
    this.selectedChargeAthleteIds.set([]);
    this.chargeAthleteSearch.set('');
    this.additionalChargeError.set('');
    this.additionalChargeMessage.set('');
    this.isModalOpen.set(true);
    this.isLoadingCategories.set(true);

    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT id, nombre
         FROM categorias
         WHERE activa = 1
         ORDER BY nombre COLLATE NOCASE`,
      );
      this.chargeCategories.set((result.values ?? []) as CategoryRecord[]);
    } catch {
      this.additionalChargeError.set('No se pudieron cargar las categorías.');
    } finally {
      this.isLoadingCategories.set(false);
    }
  }

  closeModal(): void {
    if (this.isCreatingCharge()) {
      return;
    }
    this.isModalOpen.set(false);
    this.additionalChargeError.set('');
  }

  async selectChargeCategory(categoryId: string): Promise<void> {
    this.chargeCategoryId.set(categoryId);
    this.chargeAthletes.set([]);
    this.selectedChargeAthleteIds.set([]);
    this.chargeAthleteSearch.set('');
    this.additionalChargeError.set('');
    if (!categoryId) {
      return;
    }

    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT d.id, d.nombres, d.apellidos, d.numero_documento,
                c.nombre AS categoria
         FROM deportistas d
         LEFT JOIN deportista_categoria_historial h
           ON h.deportista_id = d.id
          AND h.vigente_desde <= ?
          AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
         JOIN categorias c
           ON c.id = COALESCE(h.categoria_id, d.categoria_id)
         WHERE d.estado = 'activo'
           AND c.id = ?
         ORDER BY d.apellidos COLLATE NOCASE, d.nombres COLLATE NOCASE`,
        [this.today, this.today, categoryId],
      );
      this.chargeAthletes.set((result.values ?? []) as AthleteRecord[]);
    } catch {
      this.additionalChargeError.set(
        'No se pudieron cargar los deportistas de la categoría.',
      );
    }
  }

  updateChargeAthleteSearch(
    event: CustomEvent<{ value?: string | null }>,
  ): void {
    this.chargeAthleteSearch.set(event.detail.value ?? '');
  }

  toggleChargeAthlete(athleteId: string, checked: boolean): void {
    const selected = new Set(this.selectedChargeAthleteIds());
    if (checked) {
      selected.add(athleteId);
    } else {
      selected.delete(athleteId);
    }
    this.selectedChargeAthleteIds.set([...selected]);
  }

  toggleAllVisibleChargeAthletes(): void {
    const selected = new Set(this.selectedChargeAthleteIds());
    const visibleIds = this.filteredChargeAthletes().map(
      (athlete) => athlete.id,
    );
    if (this.allVisibleChargeAthletesSelected()) {
      visibleIds.forEach((id) => selected.delete(id));
    } else {
      visibleIds.forEach((id) => selected.add(id));
    }
    this.selectedChargeAthleteIds.set([...selected]);
  }

  formatAmount(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  async saveAdditionalCharge(): Promise<void> {
    this.additionalChargeForm.markAllAsTouched();
    const description = this.additionalChargeForm.controls.descripcion.value.trim();
    const amount = Number(this.additionalChargeForm.controls.monto.value);
    const categoryId = this.chargeCategoryId();
    const selectedIds = this.selectedChargeAthleteIds();
    if (
      this.additionalChargeForm.invalid ||
      !categoryId ||
      !selectedIds.length ||
      this.isCreatingCharge()
    ) {
      return;
    }
    if (!description) {
      this.additionalChargeError.set('Ingresa una descripción para el cargo.');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      this.additionalChargeError.set('Ingresa un valor entero mayor que cero.');
      return;
    }

    this.isCreatingCharge.set(true);
    this.additionalChargeError.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        const placeholders = selectedIds.map(() => '?').join(', ');
        const currentAthletes = await database.query(
          `SELECT d.id
           FROM deportistas d
           LEFT JOIN deportista_categoria_historial h
             ON h.deportista_id = d.id
            AND h.vigente_desde <= ?
            AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
           WHERE d.estado = 'activo'
             AND COALESCE(h.categoria_id, d.categoria_id) = ?
             AND d.id IN (${placeholders})`,
          [this.today, this.today, categoryId, ...selectedIds],
        );
        if ((currentAthletes.values ?? []).length !== selectedIds.length) {
          throw new Error('CHARGE_SELECTION_CHANGED');
        }

        for (const athleteId of selectedIds) {
          const chargeId = crypto.randomUUID();
          await database.run(
            `INSERT INTO cargos_adicionales
              (id, deportista_id, descripcion, monto_pesos, fecha_cargo,
               creado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              chargeId,
              athleteId,
              description,
              amount,
              this.today,
              this.auth.currentUsername,
            ],
            false,
          );
          await this.writeFinancialAudit(
            database,
            'OBLIGACION_GENERADA',
            'cargo_adicional',
            chargeId,
            JSON.stringify({
              deportistaId: athleteId,
              descripcion: description,
              montoPesos: amount,
            }),
          );
        }
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      this.additionalChargeMessage.set(
        `Se asignó “${description}” por ${this.formatAmount(amount)} a ${selectedIds.length} deportista(s).`,
      );
      this.isModalOpen.set(false);
    } catch (error) {
      this.additionalChargeError.set(
        String(error).includes('CHARGE_SELECTION_CHANGED')
          ? 'La categoría o selección cambió. Vuelve a seleccionar los deportistas.'
          : 'No se pudo asignar el cargo. Inténtalo de nuevo.',
      );
    } finally {
      this.isCreatingCharge.set(false);
    }
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

  private normalize(value: string): string {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  }
}
