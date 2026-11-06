import { Component, inject, signal } from '@angular/core';
import { chevronDownOutline } from 'ionicons/icons';

import { DatabaseService } from '../../../../database/database.service';
import { FinancialSummaryService } from '../../financial-summary.service';

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-resumen-finanzas',
  templateUrl: './resumen-finanzas.page.html',
  styleUrls: ['./resumen-finanzas.page.scss'],
  standalone: false,
})
export class ResumenFinanzasPage {
  private readonly database = inject(DatabaseService);
  private readonly financialSummary = inject(FinancialSummaryService);

  readonly icons = { chevronDownOutline };
  readonly collectedThisMonth = signal(0);
  readonly totalPending = signal(0);
  readonly athletesWithBalance = signal(0);
  readonly isLoading = signal(true);
  readonly pageError = signal('');

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  ionViewWillEnter(): Promise<void> {
    return this.loadSummary();
  }

  formatAmount(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  private async loadSummary(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');

    try {
      const database = await this.database.getConnection();
      const summary = await this.financialSummary.loadSummary(
        database,
        localDateString(),
      );
      this.collectedThisMonth.set(summary.collectedThisMonth);
      this.totalPending.set(summary.totalPending);
      this.athletesWithBalance.set(summary.athletesWithBalance);
    } catch {
      this.pageError.set('No se pudo cargar el resumen financiero.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
