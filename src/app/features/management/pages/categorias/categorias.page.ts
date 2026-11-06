import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  addOutline,
  chevronBackOutline,
  pencilOutline,
  pricetagsOutline,
  trashOutline,
} from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';

interface CategoryRecord {
  id: string;
  nombre: string;
  descripcion: string | null;
  tarifa_id: string | null;
  monto_pesos: number | null;
  vigente_desde: string | null;
}

interface TariffPeriod {
  id: string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

type ModalMode = 'new-category' | 'edit-category' | 'adjust-tariff' | null;

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const offsetDate = (value: string, days: number): string => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateString(date);
};

@Component({
  selector: 'app-categorias',
  templateUrl: './categorias.page.html',
  standalone: false,
})
export class CategoriasPage implements OnInit {
  private readonly database = inject(DatabaseService);
  private readonly auth = inject(AuthService);

  readonly addIcon = addOutline;
  readonly backIcon = chevronBackOutline;
  readonly categoryIcon = pricetagsOutline;
  readonly editIcon = pencilOutline;
  readonly deleteIcon = trashOutline;
  readonly today = localDateString();
  readonly currentMonthStart = `${this.today.slice(0, 7)}-01`;
  readonly nextMonthStart = this.firstOfNextMonth();
  readonly categories = signal<CategoryRecord[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly pageError = signal('');
  readonly modalError = signal('');
  readonly modalMode = signal<ModalMode>(null);
  readonly selectedCategory = signal<CategoryRecord | null>(null);
  readonly categoryToDelete = signal<CategoryRecord | null>(null);
  readonly isDeleteModalOpen = signal(false);
  readonly deleteWillDeactivate = signal(false);
  readonly isCheckingDelete = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');

  readonly categoryForm = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(120),
        Validators.pattern(/\S/),
      ],
    }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(300)],
    }),
    montoMensual: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+$/)],
    }),
    vigenteDesde: new FormControl(this.today, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly tariffForm = new FormGroup({
    montoMensual: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+$/)],
    }),
    vigenteDesde: new FormControl(this.today, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  ngOnInit(): void {
    void this.loadCategories();
  }

  ionViewWillEnter(): Promise<void> {
    return this.loadCategories();
  }

  openNewCategory(): void {
    this.categoryForm.reset({
      nombre: '',
      descripcion: '',
      montoMensual: '',
      vigenteDesde: this.currentMonthStart,
    });
    this.modalError.set('');
    this.modalMode.set('new-category');
  }

  openEditCategory(category: CategoryRecord): void {
    this.selectedCategory.set(category);
    this.categoryForm.reset({
      nombre: category.nombre,
      descripcion: category.descripcion ?? '',
      montoMensual:
        category.monto_pesos === null ? '' : String(category.monto_pesos),
      vigenteDesde: this.currentMonthStart,
    });
    this.modalError.set('');
    this.modalMode.set('edit-category');
  }

  openTariffAdjustment(category: CategoryRecord): void {
    this.selectedCategory.set(category);
    this.tariffForm.reset({
      montoMensual:
        category.monto_pesos === null ? '' : String(category.monto_pesos),
      vigenteDesde: this.nextMonthStart,
    });
    this.modalError.set('');
    this.modalMode.set('adjust-tariff');
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.selectedCategory.set(null);
    this.modalError.set('');
  }

  formatAmount(amount: number | null): string {
    return amount === null
      ? 'Sin tarifa vigente'
      : this.currencyFormatter.format(amount);
  }

  async saveCategoryEdit(): Promise<void> {
    this.categoryForm.markAllAsTouched();
    const category = this.selectedCategory();
    if (!category || this.categoryForm.invalid || this.isSaving()) {
      return;
    }
    const values = this.categoryForm.getRawValue();
    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      await database.run(
        `UPDATE categorias
         SET nombre = ?, descripcion = ?, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [values.nombre.trim(), values.descripcion.trim() || null, category.id],
      );
      this.closeModal();
      await this.loadCategories();
    } catch (error) {
      this.modalError.set(
        String(error).includes('UNIQUE constraint failed')
          ? 'Ya existe una categor\u00eda con ese nombre.'
          : 'No se pudo actualizar la categor\u00eda. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  async openDeleteCategory(category: CategoryRecord): Promise<void> {
    this.categoryToDelete.set(category);
    this.deleteWillDeactivate.set(false);
    this.deleteError.set('');
    this.isDeleteModalOpen.set(true);
    this.isCheckingDelete.set(true);
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT
           (SELECT COUNT(*) FROM deportistas WHERE categoria_id = ?)
             AS athletes,
           (SELECT COUNT(*) FROM deportista_categoria_historial
             WHERE categoria_id = ?) AS history,
           (SELECT COUNT(*)
             FROM mensualidades m
             JOIN tarifas_categoria t ON t.id = m.tarifa_id
             WHERE t.categoria_id = ?) AS monthly`,
        [category.id, category.id, category.id],
      );
      const row = result.values?.[0] as
        | { athletes: number; history: number; monthly: number }
        | undefined;
      const references =
        Number(row?.athletes ?? 0) +
        Number(row?.history ?? 0) +
        Number(row?.monthly ?? 0);
      this.deleteWillDeactivate.set(references > 0);
    } catch {
      this.deleteError.set(
        'No se pudieron revisar las relaciones de la categor\u00eda.',
      );
    } finally {
      this.isCheckingDelete.set(false);
    }
  }

  closeDeleteModal(): void {
    if (this.isDeleting()) {
      return;
    }
    this.isDeleteModalOpen.set(false);
    this.categoryToDelete.set(null);
  }

  async confirmDeleteCategory(): Promise<void> {
    const category = this.categoryToDelete();
    if (!category || this.isCheckingDelete() || this.isDeleting()) {
      return;
    }
    this.isDeleting.set(true);
    this.deleteError.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        if (this.deleteWillDeactivate()) {
          await database.run(
            `UPDATE categorias
             SET activa = 0, actualizado_en = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [category.id],
            false,
          );
          await this.writeFinancialAudit(
            database,
            'CATEGORIA_DESACTIVADA',
            category.id,
            category.nombre,
          );
        } else {
          await database.run(
            `DELETE FROM tarifas_categoria WHERE categoria_id = ?`,
            [category.id],
            false,
          );
          await database.run(
            `DELETE FROM categorias WHERE id = ?`,
            [category.id],
            false,
          );
        }
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }
      this.isDeleteModalOpen.set(false);
      this.categoryToDelete.set(null);
      await this.loadCategories();
    } catch {
      this.deleteError.set(
        'No se pudo completar la operaci\u00f3n. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  async createCategory(): Promise<void> {
    this.categoryForm.markAllAsTouched();
    if (this.categoryForm.invalid || this.isSaving()) {
      return;
    }

    const values = this.categoryForm.getRawValue();
    const amount = Number(values.montoMensual);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      this.modalError.set('Ingresa un valor mensual válido en pesos.');
      return;
    }
    if (
      !/^\d{4}-\d{2}-01$/.test(values.vigenteDesde) ||
      values.vigenteDesde < this.currentMonthStart
    ) {
      this.modalError.set(
        'La tarifa inicial debe comenzar el primer día de un mes desde el inicio del mes actual.',
      );
      return;
    }

    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      const categoryId = crypto.randomUUID();
      await database.beginTransaction();
      try {
        await database.run(
          `INSERT INTO categorias (id, nombre, descripcion)
           VALUES (?, ?, ?)`,
          [
            categoryId,
            values.nombre.trim(),
            values.descripcion.trim() || null,
          ],
          false,
        );
        await database.run(
          `INSERT INTO tarifas_categoria
            (id, categoria_id, monto_pesos, vigente_desde, vigente_hasta)
           VALUES (?, ?, ?, ?, NULL)`,
          [
            crypto.randomUUID(),
            categoryId,
            amount,
            values.vigenteDesde,
          ],
          false,
        );
        await this.writeFinancialAudit(
          database,
          'CATEGORIA_TARIFA_CREADA',
          categoryId,
          JSON.stringify({
            nombre: values.nombre.trim(),
            montoPesos: amount,
            vigenteDesde: values.vigenteDesde,
          }),
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      this.closeModal();
      await this.loadCategories();
    } catch (error) {
      this.modalError.set(
        String(error).includes('UNIQUE constraint failed')
          ? 'Ya existe una categoría con ese nombre.'
          : 'No se pudo guardar la categoría. Inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  async adjustMonthlyFee(): Promise<void> {
    this.tariffForm.markAllAsTouched();
    const category = this.selectedCategory();
    if (!category || this.tariffForm.invalid || this.isSaving()) {
      return;
    }

    const values = this.tariffForm.getRawValue();
    const amount = Number(values.montoMensual);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      this.modalError.set('Ingresa un valor mensual válido en pesos.');
      return;
    }
    if (
      !/^\d{4}-\d{2}-01$/.test(values.vigenteDesde) ||
      values.vigenteDesde < this.nextMonthStart
    ) {
      this.modalError.set(
        'El ajuste debe comenzar el primer día de un mes futuro.',
      );
      return;
    }

    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        const result = await database.query(
          `SELECT id, vigente_desde, vigente_hasta
           FROM tarifas_categoria
           WHERE categoria_id = ?
           ORDER BY vigente_desde`,
          [category.id],
        );
        const tariffs = (result.values ?? []) as TariffPeriod[];

        if (tariffs.some((tariff) => tariff.vigente_desde === values.vigenteDesde)) {
          throw new Error('TARIFF_DATE_CONFLICT');
        }

        const overlappingTariffs = tariffs.filter(
          (tariff) =>
            tariff.vigente_desde < values.vigenteDesde &&
            (!tariff.vigente_hasta ||
              tariff.vigente_hasta >= values.vigenteDesde),
        );
        if (overlappingTariffs.length > 1) {
          throw new Error('TARIFF_SCHEDULE_OVERLAP');
        }

        const nextTariff = tariffs.find(
          (tariff) => tariff.vigente_desde > values.vigenteDesde,
        );
        const newEndDate = nextTariff
          ? offsetDate(nextTariff.vigente_desde, -1)
          : null;

        if (newEndDate && newEndDate < values.vigenteDesde) {
          throw new Error('TARIFF_DATE_CONFLICT');
        }

        const currentTariff = overlappingTariffs[0];
        if (currentTariff) {
          await database.run(
            `UPDATE tarifas_categoria
             SET vigente_hasta = ?
             WHERE id = ?`,
            [offsetDate(values.vigenteDesde, -1), currentTariff.id],
            false,
          );
        }

        await database.run(
          `INSERT INTO tarifas_categoria
            (id, categoria_id, monto_pesos, vigente_desde, vigente_hasta)
           VALUES (?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            category.id,
            amount,
            values.vigenteDesde,
            newEndDate,
          ],
          false,
        );
        await this.writeFinancialAudit(
          database,
          'TARIFA_ACTUALIZADA',
          category.id,
          JSON.stringify({
            montoPesos: amount,
            vigenteDesde: values.vigenteDesde,
          }),
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }

      this.closeModal();
      await this.loadCategories();
    } catch (error) {
      const message = String(error);
      this.modalError.set(
        message.includes('TARIFF_DATE_CONFLICT') ||
          message.includes('TARIFF_SCHEDULE_OVERLAP') ||
          message.includes('UNIQUE constraint failed')
          ? 'Esa fecha se cruza con una tarifa existente. Elige otra fecha de vigencia.'
          : 'No se pudo ajustar la mensualidad. Inténtalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadCategories(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');
    try {
      const database = await this.database.getConnection();
      const today = localDateString();
      const result = await database.query(
        `SELECT
           c.id,
           c.nombre,
           c.descripcion,
           t.id AS tarifa_id,
           t.monto_pesos,
           t.vigente_desde
         FROM categorias c
         LEFT JOIN tarifas_categoria t
           ON t.categoria_id = c.id
          AND t.vigente_desde <= ?
          AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= ?)
         WHERE c.activa = 1
         ORDER BY c.nombre COLLATE NOCASE`,
        [today, today],
      );
      this.categories.set(
        (result.values ?? []).map((row) => {
          const category = row as CategoryRecord;
          return {
            ...category,
            monto_pesos:
              category.monto_pesos === null
                ? null
                : Number(category.monto_pesos),
          };
        }),
      );
    } catch {
      this.pageError.set('No se pudieron cargar las categorías.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private firstOfNextMonth(): string {
    const now = new Date();
    return localDateString(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  }

  private async writeFinancialAudit(
    database: Awaited<ReturnType<DatabaseService['getConnection']>>,
    action: string,
    entityId: string,
    detail: string,
  ): Promise<void> {
    await database.run(
      `INSERT INTO auditoria_financiera
        (id, accion, entidad, entidad_id, actor, detalle)
       VALUES (?, ?, 'tarifa_categoria', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        action,
        entityId,
        this.auth.currentUsername ?? 'local',
        detail,
      ],
      false,
    );
  }
}
