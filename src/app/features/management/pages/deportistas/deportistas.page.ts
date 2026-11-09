import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  addOutline,
  cardOutline,
  chevronBackOutline,
  pencilOutline,
  personOutline,
  trashOutline,
} from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';
import { AuthService } from '../../../auth/services/auth.service';
import {
  FinancialSummaryService,
  type AthleteFinancialObligation,
} from '../../financial-summary.service';

interface AthleteRecord {
  id: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  fecha_ingreso: string;
  foto_data_url: string | null;
  categoria_nombre: string;
  categoria_id: string;
}

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-deportistas',
  templateUrl: './deportistas.page.html',
  standalone: false,
})
export class DeportistasPage {
  private readonly database = inject(DatabaseService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly financialSummary = inject(FinancialSummaryService);

  readonly personIcon = personOutline;
  readonly financialIcon = cardOutline;
  readonly backIcon = chevronBackOutline;
  readonly editIcon = pencilOutline;
  readonly deleteIcon = trashOutline;
  readonly addIcon = addOutline;
  private readonly birthDateFormatter = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  readonly athletes = signal<AthleteRecord[]>([]);
  readonly searchTerm = signal('');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly modalError = signal('');
  readonly selectedAthlete = signal<AthleteRecord | null>(null);
  readonly isRetirementModalOpen = signal(false);
  readonly selectedFinancialAthlete = signal<AthleteRecord | null>(null);
  readonly financialObligations = signal<AthleteFinancialObligation[]>([]);
  readonly isFinancialStatusOpen = signal(false);
  readonly isLoadingFinancialStatus = signal(false);
  readonly financialStatusError = signal('');
  readonly athleteToDelete = signal<AthleteRecord | null>(null);
  readonly isDeleteModalOpen = signal(false);
  readonly deleteBlockReason = signal<string | null>(null);
  readonly isCheckingDelete = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly today = localDateString();
  private financialStatusRequest = 0;
  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
  readonly totalFinancialBalance = computed(() =>
    this.financialObligations().reduce(
      (total, obligation) => total + obligation.pendiente_pesos,
      0,
    ),
  );
  readonly retirementForm = new FormGroup({
    fechaRetiro: new FormControl(this.today, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly filteredAthletes = computed(() => {
    const query = this.normalize(this.searchTerm());
    if (!query) {
      return this.athletes();
    }

    return this.athletes().filter((athlete) =>
      [
        athlete.nombres,
        athlete.apellidos,
        athlete.categoria_nombre,
        athlete.fecha_nacimiento,
      ].some((value) => this.normalize(value).includes(query)),
    );
  });

  ionViewWillEnter(): Promise<void> {
    return this.loadAthletes();
  }

  addAthlete(): Promise<boolean> {
    return this.router.navigateByUrl('/gestion/deportistas/nuevo');
  }

  async editAthlete(athlete: AthleteRecord): Promise<void> {
    await this.router.navigate(['/gestion/deportistas/editar', athlete.id]);
  }

  async openFinancialStatus(athlete: AthleteRecord): Promise<void> {
    const request = ++this.financialStatusRequest;
    this.selectedFinancialAthlete.set(athlete);
    this.financialObligations.set([]);
    this.financialStatusError.set('');
    this.isLoadingFinancialStatus.set(true);
    this.isFinancialStatusOpen.set(true);

    try {
      const database = await this.database.getConnection();
      const obligations = await this.financialSummary.loadAthleteObligations(
        database,
        athlete.id,
      );
      if (request === this.financialStatusRequest) {
        this.financialObligations.set(obligations);
      }
    } catch {
      if (request === this.financialStatusRequest) {
        this.financialStatusError.set(
          'No se pudo consultar el estado financiero del deportista.',
        );
      }
    } finally {
      if (request === this.financialStatusRequest) {
        this.isLoadingFinancialStatus.set(false);
      }
    }
  }

  closeFinancialStatus(): void {
    this.financialStatusRequest += 1;
    this.isFinancialStatusOpen.set(false);
    this.selectedFinancialAthlete.set(null);
    this.financialObligations.set([]);
    this.financialStatusError.set('');
    this.isLoadingFinancialStatus.set(false);
  }

  formatAmount(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  financialObligationLabel(obligation: AthleteFinancialObligation): string {
    if (obligation.tipo === 'inscripcion') {
      return 'Inscripción';
    }
    const match = /^(\d{4})-(\d{2})$/.exec(obligation.periodo ?? '');
    if (!match) {
      return 'Mensualidad';
    }
    const periodDate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    return `Mensualidad ${new Intl.DateTimeFormat('es-CO', {
      month: 'long',
      year: 'numeric',
    }).format(periodDate)}`;
  }

  isOverdue(obligation: AthleteFinancialObligation): boolean {
    return (
      obligation.tipo === 'mensualidad' &&
      obligation.fecha_vencimiento !== null &&
      obligation.fecha_vencimiento < this.today
    );
  }

  openRetirement(athlete: AthleteRecord): void {
    this.selectedAthlete.set(athlete);
    this.modalError.set('');
    this.retirementForm.reset({ fechaRetiro: this.today });
    this.isRetirementModalOpen.set(true);
  }

  async retireAthlete(): Promise<void> {
    this.retirementForm.markAllAsTouched();
    const athlete = this.selectedAthlete();
    const date = this.retirementForm.controls.fechaRetiro.value;
    if (!athlete || this.retirementForm.invalid || this.isSaving()) {
      return;
    }
    if (date > this.today) {
      this.modalError.set('La fecha de retiro no puede estar en el futuro.');
      return;
    }
    if (date < athlete.fecha_ingreso) {
      this.modalError.set(
        'La fecha de retiro no puede ser anterior a la fecha de ingreso.',
      );
      return;
    }
    this.isSaving.set(true);
    this.modalError.set('');
    try {
      const database = await this.database.getConnection();
      await database.beginTransaction();
      try {
        await database.run(
          `UPDATE deportistas
           SET estado = 'inactivo',
               fecha_retiro = ?,
               actualizado_en = CURRENT_TIMESTAMP
           WHERE id = ? AND estado = 'activo'`,
          [date, athlete.id],
          false,
        );
        await database.run(
          `INSERT INTO auditoria_financiera
            (id, accion, entidad, entidad_id, actor, detalle)
           VALUES (?, 'DEPORTISTA_RETIRADO', 'deportista', ?, ?, ?)`,
          [
            crypto.randomUUID(),
            athlete.id,
            this.auth.currentUsername ?? 'local',
            `Fecha efectiva de retiro: ${date}`,
          ],
          false,
        );
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }
      this.isRetirementModalOpen.set(false);
      this.selectedAthlete.set(null);
      await this.loadAthletes();
    } catch {
      this.modalError.set('No se pudo registrar el retiro del deportista.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async openDeleteAthlete(athlete: AthleteRecord): Promise<void> {
    this.athleteToDelete.set(athlete);
    this.deleteBlockReason.set(null);
    this.deleteError.set('');
    this.isDeleteModalOpen.set(true);
    this.isCheckingDelete.set(true);

    try {
      const database = await this.database.getConnection();
      const result = await database.query(
        `SELECT
           (SELECT COUNT(*) FROM mensualidades WHERE deportista_id = ?)
             AS monthlyCharges,
           (SELECT COUNT(*) FROM inscripciones WHERE deportista_id = ?)
             AS registrations,
           (SELECT COUNT(*) FROM deportista_acudiente WHERE deportista_id = ?)
             AS guardianLinks,
           (SELECT COUNT(*) FROM deportista_categoria_historial
             WHERE deportista_id = ?)
             AS categoryHistory`,
        [athlete.id, athlete.id, athlete.id, athlete.id],
      );
      const row = result.values?.[0] as
        | {
            monthlyCharges: number;
            registrations: number;
            guardianLinks: number;
            categoryHistory: number;
          }
        | undefined;
      const financialRecords =
        Number(row?.monthlyCharges ?? 0) + Number(row?.registrations ?? 0);
      if (financialRecords > 0) {
        this.deleteBlockReason.set(
          'No se puede eliminar: tiene mensualidades o inscripciones registradas.',
        );
      } else if (Number(row?.guardianLinks ?? 0) > 0) {
        this.deleteBlockReason.set(
          'No se puede eliminar: tiene acudientes vinculados.',
        );
      } else if (Number(row?.categoryHistory ?? 0) > 1) {
        this.deleteBlockReason.set(
          'No se puede eliminar: tiene cambios de categoría registrados.',
        );
      }
    } catch {
      this.deleteError.set(
        'No se pudieron revisar las relaciones del deportista.',
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
    this.athleteToDelete.set(null);
  }

  async confirmDeleteAthlete(): Promise<void> {
    const athlete = this.athleteToDelete();
    if (
      !athlete ||
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
      await database.beginTransaction();
      try {
        await database.run(
          `DELETE FROM deportista_categoria_historial WHERE deportista_id = ?`,
          [athlete.id],
          false,
        );
        await database.run(`DELETE FROM deportistas WHERE id = ?`, [
          athlete.id,
        ], false);
        await database.commitTransaction();
      } catch (error) {
        await database.rollbackTransaction();
        throw error;
      }
      this.isDeleteModalOpen.set(false);
      this.athleteToDelete.set(null);
      await this.loadAthletes();
    } catch {
      this.deleteError.set(
        'No se pudo eliminar el deportista. Inténtalo de nuevo.',
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  closeDialog(): void {
    if (this.isSaving()) {
      return;
    }
    this.isRetirementModalOpen.set(false);
    this.selectedAthlete.set(null);
    this.modalError.set('');
  }

  updateSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set(event.detail.value ?? '');
  }

  formatBirthDate(isoDate: string): string {
    const date = this.parseLocalDate(isoDate);
    if (!date) {
      return isoDate;
    }
    return this.birthDateFormatter
      .format(date)
      .replace(/de (\p{L})/u, (_, letter: string) => `de ${letter.toUpperCase()}`);
  }

  formatAge(isoDate: string): string {
    const birth = this.parseLocalDate(isoDate);
    if (!birth) {
      return '—';
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age -= 1;
    }
    return `${age} años`;
  }

  private async loadAthletes(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const database = await this.database.getConnection();
      const today = localDateString();
      const athletesResult = await database.query(
        `SELECT
           d.id,
           d.nombres,
           d.apellidos,
           d.fecha_nacimiento,
           d.fecha_ingreso,
           d.foto_data_url,
           COALESCE(h.categoria_id, d.categoria_id) AS categoria_id,
           c.nombre AS categoria_nombre
         FROM deportistas d
         LEFT JOIN deportista_categoria_historial h
           ON h.deportista_id = d.id
          AND h.vigente_desde <= ?
          AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
         LEFT JOIN categorias c
           ON c.id = COALESCE(h.categoria_id, d.categoria_id)
         WHERE d.estado = 'activo'
         ORDER BY d.apellidos COLLATE NOCASE, d.nombres COLLATE NOCASE`,
        [today, today],
      );
      this.athletes.set((athletesResult.values ?? []) as AthleteRecord[]);
    } catch {
      this.errorMessage.set('No se pudieron cargar los deportistas.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private parseLocalDate(isoDate: string): Date | null {
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  }

  private normalize(value: string): string {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  }
}
