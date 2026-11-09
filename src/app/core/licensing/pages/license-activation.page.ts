import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { LicenseAccessService } from '../license-access.service';
import { LicenseAccessStatus } from '../license.models';

@Component({
  selector: 'app-license-activation',
  templateUrl: './license-activation.page.html',
  styleUrls: ['./license-activation.page.scss'],
  standalone: false,
})
export class LicenseActivationPage {
  private readonly access = inject(LicenseAccessService);
  private readonly router = inject(Router);

  readonly status = this.access.status;
  readonly canWrite = this.access.canWrite;
  readonly claims = this.access.claims;
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly form = new FormGroup({
    activationCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(20), Validators.maxLength(256)],
    }),
  });

  get statusLabel(): string {
    return this.statusLabelFor(this.status());
  }

  get statusDescription(): string {
    return this.statusDescriptionFor(this.status());
  }

  get requiresActivationCode(): boolean {
    return this.status() === 'ACTIVATION_REQUIRED';
  }

  get canRefresh(): boolean {
    return [
      'ACTIVE',
      'GRACE_PERIOD',
      'VALIDATION_REQUIRED',
      'EXPIRED',
      'SUSPENDED',
      'REVOKED',
    ].includes(this.status());
  }

  async submitActivation(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      await this.access.activate(
        this.form.controls.activationCode.value,
      );
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(this.activationErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async refreshLicense(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      if (await this.access.refreshNow()) {
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      } else {
        this.errorMessage.set(this.canWrite()
          ? 'La licencia actual sigue válida, pero no se pudo actualizar en línea.'
          : 'No se pudo validar en línea. Conservas el acceso de consulta y recuperación.');
      }
    } catch {
      this.errorMessage.set(this.canWrite()
        ? 'La licencia actual sigue válida, pero no se pudo actualizar en línea.'
        : 'No se pudo validar en línea. Conservas el acceso de consulta y recuperación.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private statusLabelFor(status: LicenseAccessStatus): string {
    const labels: Record<LicenseAccessStatus, string> = {
      CHECKING: 'Verificando',
      NOT_REQUIRED: 'No requerida en esta plataforma',
      ACTIVATION_REQUIRED: 'Activación pendiente',
      ACTIVE: 'Activa',
      GRACE_PERIOD: 'En periodo de gracia',
      VALIDATION_REQUIRED: 'Validación en línea requerida',
      EXPIRED: 'Vencida',
      SUSPENDED: 'Suspendida',
      REVOKED: 'Revocada',
      INVALID: 'No válida',
    };
    return labels[status];
  }

  private statusDescriptionFor(status: LicenseAccessStatus): string {
    const descriptions: Record<LicenseAccessStatus, string> = {
      CHECKING: 'Estamos comprobando el estado protegido de esta instalación.',
      NOT_REQUIRED: 'La licencia de servidor se aplica a la aplicación Android.',
      ACTIVATION_REQUIRED:
        'Ingresa el código de activación entregado para tu escuela. La primera activación requiere conexión a Internet.',
      ACTIVE: 'La licencia está validada y las operaciones están disponibles.',
      GRACE_PERIOD:
        'La suscripción está en periodo de gracia. Conéctate para actualizar la licencia.',
      VALIDATION_REQUIRED:
        'Se necesita validar la licencia en línea antes de habilitar nuevas operaciones.',
      EXPIRED:
        'El periodo de gracia terminó. Tus datos siguen disponibles para consulta y recuperación.',
      SUSPENDED:
        'El servidor reportó una suspensión. Puedes consultar y recuperar tus datos.',
      REVOKED:
        'Esta instalación fue revocada. Puedes consultar y recuperar tus datos.',
      INVALID:
        'No se pudo verificar la licencia de esta instalación. Contacta al soporte de tu escuela.',
    };
    return descriptions[status];
  }

  private activationErrorMessage(error: unknown): string {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    const messages: Record<string, string> = {
      ACTIVATION_CODE_INVALID: 'El código no es válido o ya venció.',
      CHALLENGE_EXPIRED_OR_USED:
        'El reto de seguridad venció. Intenta activar de nuevo.',
      DEVICE_PROOF_INVALID:
        'No se pudo comprobar la seguridad de esta instalación.',
      LICENSE_NOT_ACTIVE: 'La licencia de la escuela no está activa.',
      SCHOOL_INSTALLATION_LIMIT_REACHED:
        'La escuela ya tiene una instalación activa. Contacta al soporte para transferirla.',
      LICENSE_NETWORK_UNAVAILABLE:
        'No hay conexión con el servicio de licencias. Revisa Internet e inténtalo de nuevo.',
      LICENSE_SIGNATURE_INVALID:
        'La respuesta del servidor no pasó la verificación de seguridad.',
      LICENSE_SIGNATURE_UNVERIFIABLE:
        'Este Android no puede verificar la firma de la licencia.',
      LICENSE_SIGNING_KEY_UNKNOWN:
        'La clave de firma del servidor no está reconocida por esta versión.',
      LICENSE_CLAIMS_MISMATCH:
        'La licencia no corresponde a esta aplicación o instalación.',
      LICENSE_DEVICE_BINDING_MISMATCH:
        'La licencia no está vinculada a la clave protegida de este dispositivo.',
      LICENSE_NONCE_MISMATCH:
        'La respuesta de activación no corresponde al reto de seguridad.',
      LICENSE_REVISION_ROLLBACK:
        'El servidor devolvió una revisión de licencia anterior.',
      LICENSE_API_HTTPS_REQUIRED:
        'La conexión de licencias no está configurada de forma segura.',
      LICENSE_RESPONSE_INVALID:
        'El servidor devolvió una respuesta de licencia incompleta.',
    };
    return (
      messages[code] ??
      'No se pudo activar la escuela. Verifica el código o inténtalo de nuevo.'
    );
  }
}
