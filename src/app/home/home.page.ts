import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { powerOutline } from 'ionicons/icons';

import { LicenseAccessService } from '../core/licensing/license-access.service';
import { AuthService } from '../features/auth/services/auth.service';
import {
  MANAGEMENT_GROUPS,
  MANAGEMENT_SECTIONS,
} from '../features/management/management-sections';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  standalone: false,
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly license = inject(LicenseAccessService);

  readonly icons = { powerOutline };
  readonly licenseStatus = this.license.status;
  readonly licenseCanWrite = this.license.canWrite;
  readonly menuGroups = MANAGEMENT_GROUPS.map((name) => ({
    name,
    items: MANAGEMENT_SECTIONS.filter(
      (section) => section.group === name && section.showInHome !== false,
    ),
  }));

  get currentUsername(): string {
    return this.auth.currentUsername ?? '';
  }

  get licenseMessage(): string {
    const messages: Record<string, string> = {
      CHECKING: 'Verificando el estado de la licencia…',
      ACTIVATION_REQUIRED:
        'Activa esta instalación para habilitar las operaciones.',
      GRACE_PERIOD:
        'La suscripción está en periodo de gracia. Valida para actualizarla.',
      VALIDATION_REQUIRED:
        'Conéctate para validar la licencia y habilitar operaciones.',
      EXPIRED: 'La licencia venció. Tus datos siguen disponibles en modo de consulta.',
      SUSPENDED:
        'La licencia está suspendida. Tus datos siguen disponibles en modo de consulta.',
      REVOKED:
        'La instalación fue revocada. Tus datos siguen disponibles en modo de consulta.',
      INVALID:
        'No se pudo verificar la licencia. Tus datos permanecen en este dispositivo.',
    };
    return messages[this.licenseStatus()] ?? '';
  }

  get licenseStatusLabel(): string {
    const labels: Record<string, string> = {
      CHECKING: 'VERIFICANDO',
      ACTIVATION_REQUIRED: 'ACTIVACIÓN PENDIENTE',
      GRACE_PERIOD: 'PERIODO DE GRACIA',
      VALIDATION_REQUIRED: 'VALIDACIÓN REQUERIDA',
      EXPIRED: 'LICENCIA VENCIDA',
      SUSPENDED: 'LICENCIA SUSPENDIDA',
      REVOKED: 'INSTALACIÓN REVOCADA',
      INVALID: 'LICENCIA NO VÁLIDA',
    };
    return labels[this.licenseStatus()] ?? '';
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }
}
