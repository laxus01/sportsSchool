import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  addOutline,
  cardOutline,
  chevronBackOutline,
  pencilOutline,
  trashOutline,
} from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';

interface PaymentMethodRecord {
  id: string;
  nombre: string;
  tipo: string;
  activa: number;
}

@Component({
  selector: 'app-medios-pago',
  templateUrl: './medios-pago.page.html',
  styleUrls: ['./medios-pago.page.scss'],
  standalone: false,
})
export class MediosPagoPage {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);

  readonly icons = {
    addOutline,
    cardOutline,
    chevronBackOutline,
    pencilOutline,
    trashOutline,
  };
  readonly paymentMethods = signal<PaymentMethodRecord[]>([]);
  readonly searchTerm = signal('');
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly methodToDelete = signal<PaymentMethodRecord | null>(null);
  readonly isDeleteModalOpen = signal(false);
  readonly deleteWillDeactivate = signal(false);
  readonly isCheckingDelete = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly filteredPaymentMethods = computed(() => {
    const query = this.normalize(this.searchTerm());
    if (!query) {
      return this.paymentMethods();
    }

    return this.paymentMethods().filter((method) =>
      [
        method.nombre,
        this.typeLabel(method.tipo),
        method.activa ? 'activo' : 'inactivo',
      ].some((value) => this.normalize(value).includes(query)),
    );
  });

  ionViewWillEnter(): Promise<void> {
    return this.loadPaymentMethods();
  }

  async addPaymentMethod(): Promise<void> {
    await this.router.navigateByUrl('/gestion/medios-de-pago/nuevo');
  }

  async editPaymentMethod(method: PaymentMethodRecord): Promise<void> {
    await this.router.navigate(['/gestion/medios-de-pago/editar', method.id]);
  }

  async openDeleteMethod(method: PaymentMethodRecord): Promise<void> {
    this.methodToDelete.set(method);
    this.deleteWillDeactivate.set(false);
    this.deleteError.set('');
    this.isDeleteModalOpen.set(true);
    this.isCheckingDelete.set(true);
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT COUNT(*) AS payments
         FROM pagos
         WHERE entidad_transferencia_id = ?`,
        [method.id],
      );
      const row = result.values?.[0] as { payments: number } | undefined;
      this.deleteWillDeactivate.set(Number(row?.payments ?? 0) > 0);
    } catch {
      this.deleteError.set(
        'No se pudieron revisar las referencias del medio de pago.',
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
    this.methodToDelete.set(null);
  }

  async confirmDeleteMethod(): Promise<void> {
    const method = this.methodToDelete();
    if (!method || this.isCheckingDelete() || this.isDeleting()) {
      return;
    }
    this.isDeleting.set(true);
    this.deleteError.set('');
    try {
      const database = await this.database.getConnection();
      if (this.deleteWillDeactivate()) {
        await database.run(
          `UPDATE entidades_transferencia SET activa = 0 WHERE id = ?`,
          [method.id],
        );
      } else {
        await database.run(
          `DELETE FROM entidades_transferencia WHERE id = ?`,
          [method.id],
        );
      }
      this.isDeleteModalOpen.set(false);
      this.methodToDelete.set(null);
      await this.loadPaymentMethods();
    } catch {
      this.deleteError.set(
        'No se pudo completar la operaci\u00f3n. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  updateSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set(event.detail.value ?? '');
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'billetera':
        return 'Billetera';
      case 'sistema_transferencia':
        return 'Sistema de transferencia';
      case 'banco':
      default:
        return 'Banco';
    }
  }

  private async loadPaymentMethods(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT id, nombre, tipo, activa
         FROM entidades_transferencia
         ORDER BY nombre COLLATE NOCASE`,
      );
      this.paymentMethods.set(
        (result.values ?? []) as PaymentMethodRecord[],
      );
    } catch {
      this.errorMessage.set('No se pudieron cargar los medios de pago.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private normalize(value: string): string {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  }
}
