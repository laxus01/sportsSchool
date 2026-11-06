import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  addOutline,
  callOutline,
  chevronBackOutline,
  locationOutline,
  peopleOutline,
  pencilOutline,
  personOutline,
  trashOutline,
} from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';

interface GuardianRecord {
  id: string;
  nombres: string;
  apellidos: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  telefono: string;
  direccion: string | null;
  vinculos: GuardianLink[];
}

interface GuardianLink {
  deportistaNombre: string;
  parentesco: string;
}

interface GuardianQueryRow extends Omit<GuardianRecord, 'vinculos'> {
  deportista_id: string | null;
  deportista_nombres: string | null;
  deportista_apellidos: string | null;
  parentesco: string | null;
}

@Component({
  selector: 'app-acudientes',
  templateUrl: './acudientes.page.html',
  standalone: false,
})
export class AcudientesPage {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);

  readonly icons = {
    addOutline,
    callOutline,
    chevronBackOutline,
    locationOutline,
    peopleOutline,
    pencilOutline,
    personOutline,
    trashOutline,
  };
  readonly caregivers = signal<GuardianRecord[]>([]);
  readonly searchTerm = signal('');
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly caregiverToDelete = signal<GuardianRecord | null>(null);
  readonly isDeleteModalOpen = signal(false);
  readonly deleteBlockReason = signal<string | null>(null);
  readonly isCheckingDelete = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly filteredCaregivers = computed(() => {
    const query = this.normalize(this.searchTerm());
    if (!query) {
      return this.caregivers();
    }

    return this.caregivers().filter((caregiver) =>
      [
        caregiver.nombres,
        caregiver.apellidos,
        caregiver.tipo_documento,
        caregiver.numero_documento,
        caregiver.telefono,
        caregiver.direccion,
        caregiver.vinculos
          .map((link) => `${link.deportistaNombre} ${link.parentesco}`)
          .join(' '),
      ].some((value) => this.normalize(value ?? '').includes(query)),
    );
  });

  ionViewWillEnter(): Promise<void> {
    return this.loadCaregivers();
  }

  async addCaregiver(): Promise<void> {
    await this.router.navigateByUrl('/gestion/acudientes/nuevo');
  }

  async editCaregiver(caregiver: GuardianRecord): Promise<void> {
    await this.router.navigate(['/gestion/acudientes/editar', caregiver.id]);
  }

  async openDeleteCaregiver(caregiver: GuardianRecord): Promise<void> {
    this.caregiverToDelete.set(caregiver);
    this.deleteBlockReason.set(null);
    this.deleteError.set('');
    this.isDeleteModalOpen.set(true);
    this.isCheckingDelete.set(true);
    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT
           (SELECT COUNT(*) FROM deportista_acudiente WHERE acudiente_id = ?)
             AS links,
           (SELECT COUNT(*) FROM pagos WHERE acudiente_id = ?) AS payments`,
        [caregiver.id, caregiver.id],
      );
      const row = result.values?.[0] as
        | { links: number; payments: number }
        | undefined;
      if (Number(row?.payments ?? 0) > 0) {
        this.deleteBlockReason.set(
          'No se puede eliminar: tiene pagos registrados a su nombre.',
        );
      } else if (Number(row?.links ?? 0) > 0) {
        this.deleteBlockReason.set(
          'No se puede eliminar: est\u00e1 vinculado a deportistas.',
        );
      }
    } catch {
      this.deleteError.set(
        'No se pudieron revisar las relaciones del acudiente.',
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
    this.caregiverToDelete.set(null);
  }

  async confirmDeleteCaregiver(): Promise<void> {
    const caregiver = this.caregiverToDelete();
    if (
      !caregiver ||
      this.deleteBlockReason() ||
      this.isCheckingDelete() ||
      this.isDeleting()
    ) {
      return;
    }
    this.isDeleting.set(true);
    this.deleteError.set('');
    try {
      const database = await this.database.getConnection();
      await database.run(`DELETE FROM acudientes WHERE id = ?`, [caregiver.id]);
      this.isDeleteModalOpen.set(false);
      this.caregiverToDelete.set(null);
      await this.loadCaregivers();
    } catch {
      this.deleteError.set(
        'No se pudo eliminar el acudiente. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  updateSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set(event.detail.value ?? '');
  }

  formatIdentification(caregiver: GuardianRecord): string {
    return [caregiver.tipo_documento, caregiver.numero_documento]
      .filter(Boolean)
      .join(' ');
  }

  formatRelationships(caregiver: GuardianRecord): string {
    return caregiver.vinculos
      .map((link) => `${link.deportistaNombre} (${link.parentesco})`)
      .join(', ');
  }

  private async loadCaregivers(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT
           a.id,
           a.nombres,
           a.apellidos,
           a.tipo_documento,
           a.numero_documento,
           a.telefono,
           a.direccion,
           d.id AS deportista_id,
           d.nombres AS deportista_nombres,
           d.apellidos AS deportista_apellidos,
           da.parentesco
         FROM acudientes a
         LEFT JOIN deportista_acudiente da ON da.acudiente_id = a.id
         LEFT JOIN deportistas d ON d.id = da.deportista_id
         ORDER BY
           a.apellidos COLLATE NOCASE,
           a.nombres COLLATE NOCASE,
           d.apellidos COLLATE NOCASE,
           d.nombres COLLATE NOCASE`,
      );
      const caregivers = new Map<string, GuardianRecord>();
      for (const row of (result.values ?? []) as GuardianQueryRow[]) {
        let caregiver = caregivers.get(row.id);
        if (!caregiver) {
          caregiver = {
            id: row.id,
            nombres: row.nombres,
            apellidos: row.apellidos,
            tipo_documento: row.tipo_documento,
            numero_documento: row.numero_documento,
            telefono: row.telefono,
            direccion: row.direccion,
            vinculos: [],
          };
          caregivers.set(row.id, caregiver);
        }

        if (row.deportista_id) {
          caregiver.vinculos.push({
            deportistaNombre: [
              row.deportista_nombres,
              row.deportista_apellidos,
            ]
              .filter(Boolean)
              .join(' '),
            parentesco: row.parentesco ?? 'Parentesco no indicado',
          });
        }
      }

      this.caregivers.set([...caregivers.values()]);
    } catch {
      this.errorMessage.set('No se pudieron cargar los acudientes.');
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
