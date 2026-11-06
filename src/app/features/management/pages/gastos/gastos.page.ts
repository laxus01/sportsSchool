import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  addOutline,
  cashOutline,
  chevronBackOutline,
  pencilOutline,
  trashOutline,
} from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';

interface ExpenseRecord {
  id: string;
  fecha: string;
  descripcion: string;
  monto_pesos: number | null;
}

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


@Component({
  selector: 'app-gastos',
  templateUrl: './gastos.page.html',
  styleUrls: ['./gastos.page.scss'],
  standalone: false,
})
export class GastosPage {
  private readonly database = inject(DatabaseService);

  readonly icons = {
    addOutline,
    cashOutline,
    chevronBackOutline,
    pencilOutline,
    trashOutline,
  };
  readonly today = localDateString();
  readonly expenses = signal<ExpenseRecord[]>([]);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isModalOpen = signal(false);
  readonly editingExpense = signal<ExpenseRecord | null>(null);
  readonly expenseToDelete = signal<ExpenseRecord | null>(null);
  readonly isDeleteModalOpen = signal(false);
  readonly deleteError = signal('');
  readonly pageError = signal('');
  readonly modalError = signal('');
  private readonly dateFormatter = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  readonly form = new FormGroup({
    date: new FormControl(this.today, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    amount: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+$/)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(250),
        Validators.pattern(/\S/),
      ],
    }),
  });

  ionViewWillEnter(): Promise<void> {
    return this.loadExpenses();
  }

  openNewExpense(): void {
    this.editingExpense.set(null);
    this.form.reset({ date: this.today, amount: '', description: '' });
    this.modalError.set('');
    this.isModalOpen.set(true);
  }

  openEditExpense(expense: ExpenseRecord): void {
    this.editingExpense.set(expense);
    this.form.reset({
      date: expense.fecha,
      amount: expense.monto_pesos === null ? '' : String(expense.monto_pesos),
      description: expense.descripcion,
    });
    this.modalError.set('');
    this.isModalOpen.set(true);
  }

  openDeleteExpense(expense: ExpenseRecord): void {
    this.expenseToDelete.set(expense);
    this.deleteError.set('');
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    if (this.isSaving()) {
      return;
    }
    this.isDeleteModalOpen.set(false);
    this.expenseToDelete.set(null);
  }

  async confirmDeleteExpense(): Promise<void> {
    const expense = this.expenseToDelete();
    if (!expense || this.isSaving()) {
      return;
    }
    this.isSaving.set(true);
    this.deleteError.set('');
    try {
      const database = await this.database.getConnection();
      await database.run(`DELETE FROM gastos WHERE id = ?`, [expense.id]);
      this.isDeleteModalOpen.set(false);
      this.expenseToDelete.set(null);
      await this.loadExpenses();
    } catch {
      this.deleteError.set(
        'No se pudo eliminar el gasto. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  closeModal(): void {
    if (!this.isSaving()) {
      this.isModalOpen.set(false);
    }
  }

  handleModalDismiss(): void {
    this.isModalOpen.set(false);
    this.editingExpense.set(null);
    this.form.reset({ date: this.today, amount: '', description: '' });
    this.modalError.set('');
  }

  formatDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    return this.dateFormatter.format(new Date(year, month - 1, day));
  }

  formatAmount(amount: number | null): string {
    return amount === null
      ? 'Valor pendiente'
      : this.currencyFormatter.format(amount);
  }

  async saveExpense(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving()) {
      return;
    }

    const values = this.form.getRawValue();
    const description = values.description.trim();
    const amount = Number(values.amount);
    if (!description) {
      this.form.controls.description.setErrors({ whitespace: true });
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      this.modalError.set('Ingresa un valor positivo en pesos colombianos.');
      return;
    }

    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      const expense = this.editingExpense();
      if (expense) {
        await database.run(
          `UPDATE gastos
           SET fecha = ?, descripcion = ?, monto_pesos = ?
           WHERE id = ?`,
          [values.date, description, amount, expense.id],
        );
      } else {
        await database.run(
          `INSERT INTO gastos (id, fecha, descripcion, monto_pesos)
           VALUES (?, ?, ?, ?)`,
          [crypto.randomUUID(), values.date, description, amount],
        );
      }

      this.isModalOpen.set(false);
      await this.loadExpenses();
    } catch {
      this.modalError.set('No se pudo guardar el gasto. Inténtalo de nuevo.');
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadExpenses(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');

    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT id, fecha, descripcion, monto_pesos
         FROM gastos
         ORDER BY fecha DESC, creado_en DESC`,
      );
      const records = (result.values ?? []) as ExpenseRecord[];
      this.expenses.set(records);
    } catch {
      this.pageError.set('No se pudieron cargar los gastos.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
