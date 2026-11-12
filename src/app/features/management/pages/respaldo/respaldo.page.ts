import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import { BackupFileService } from '../../../../database/backup/backup-file.service';
import { BackupHistoryService } from '../../../../database/backup/backup-history.service';
import { BackupShareService } from '../../../../database/backup/backup-share.service';
import { BackupService } from '../../../../database/backup/backup.service';
import { BackupValidationService } from '../../../../database/backup/backup-validation.service';
import { RestoreService } from '../../../../database/backup/restore.service';
import {
  BackupHistoryEntry,
  BackupManifest,
  DecryptedBackup,
  LastBackupInfo,
  ValidatedBackupPackage,
} from '../../../../database/backup/backup.models';
import { BACKUP_MIN_PASSWORD_LENGTH } from '../../../../database/backup/backup-config';
import { AuthService } from '../../../auth/services/auth.service';

interface SelectedFile {
  name: string;
  data: Uint8Array;
}

function passwordMatch(
  control: AbstractControl,
): ValidationErrors | null {
  const password = control.get('password')?.value ?? '';
  const confirm = control.get('confirm')?.value ?? '';
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-respaldo',
  templateUrl: './respaldo.page.html',
  styleUrls: ['./respaldo.page.scss'],
  standalone: false,
})
export class RespaldoPage implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly backup = inject(BackupService);
  private readonly validation = inject(BackupValidationService);
  private readonly restore = inject(RestoreService);
  private readonly files = inject(BackupFileService);
  private readonly share = inject(BackupShareService);
  private readonly history = inject(BackupHistoryService);

  readonly minPasswordLength = BACKUP_MIN_PASSWORD_LENGTH;
  readonly isSupported = Capacitor.getPlatform() === 'android';
  readonly backupBusy = this.backup.isBusy;
  readonly restoreBusy = this.restore.isBusy;

  readonly backupForm = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(BACKUP_MIN_PASSWORD_LENGTH),
        ],
      }),
      confirm: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordMatch },
  );

  readonly restoreForm = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly isCreating = signal(false);
  readonly isSharing = signal(false);
  readonly isRestoring = signal(false);
  readonly isValidating = signal(false);
  readonly isConfirmAlertOpen = signal(false);

  readonly lastBackup = signal<LastBackupInfo | null>(null);
  readonly historyEntries = signal<BackupHistoryEntry[]>([]);
  readonly selectedFile = signal<SelectedFile | null>(null);
  readonly validatedManifest = signal<BackupManifest | null>(null);

  readonly backupError = signal('');
  readonly backupSuccess = signal('');
  readonly restoreError = signal('');
  readonly restoreSuccess = signal('');

  readonly confirmAlertButtons = [
    { text: 'Cancelar', role: 'cancel' },
    {
      text: 'Restaurar y reemplazar',
      role: 'confirm',
      handler: () => {
        void this.runRestore();
      },
    },
  ];

  private validatedPackage: ValidatedBackupPackage | null = null;

  ngOnInit(): void {
    void this.refreshState();
  }

  async createBackup(): Promise<void> {
    this.backupForm.markAllAsTouched();
    if (this.backupForm.invalid || this.isCreating()) {
      return;
    }
    this.isCreating.set(true);
    this.backupError.set('');
    this.backupSuccess.set('');
    try {
      const result = await this.backup.createBackup(
        this.backupForm.controls.password.value,
      );
      if (!result.success) {
        this.backupError.set(this.translateError(result.error));
        return;
      }
      this.backupSuccess.set(
        `Respaldo creado: ${result.fileName}. Usa "Compartir" para guardarlo fuera del dispositivo.`,
      );
      this.backupForm.reset();
      await this.refreshState();
    } finally {
      this.isCreating.set(false);
    }
  }

  async shareLastBackup(): Promise<void> {
    const last = this.lastBackup();
    if (!last || this.isSharing()) {
      return;
    }
    this.isSharing.set(true);
    this.backupError.set('');
    try {
      await this.share.shareFile(last.path, last.fileName);
    } catch {
      this.backupError.set(
        'No se pudo abrir el menú de compartir. El respaldo sigue guardado en el dispositivo.',
      );
    } finally {
      this.isSharing.set(false);
    }
  }

  async onFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.restoreError.set('');
    this.restoreSuccess.set('');
    this.validatedManifest.set(null);
    this.validatedPackage = null;
    this.isValidating.set(true);
    try {
      const data = await this.files.readPickedFile(file);
      const selected: SelectedFile = { name: file.name, data };
      this.validatedPackage =
        await this.validation.validatePackage(data);
      this.selectedFile.set(selected);
      this.validatedManifest.set(this.validatedPackage.manifest);
    } catch (error) {
      this.selectedFile.set({ name: file.name, data: new Uint8Array(0) });
      this.restoreError.set(this.translateError(this.errorCode(error)));
    } finally {
      this.isValidating.set(false);
    }
  }

  askToRestore(): void {
    this.restoreForm.markAllAsTouched();
    if (
      !this.validatedPackage ||
      this.restoreForm.invalid ||
      this.isRestoring()
    ) {
      return;
    }
    this.isConfirmAlertOpen.set(true);
  }

  cancelRestore(): void {
    this.selectedFile.set(null);
    this.validatedManifest.set(null);
    this.validatedPackage = null;
    this.restoreForm.reset();
    this.restoreError.set('');
    this.restoreSuccess.set('');
  }

  private async runRestore(): Promise<void> {
    if (!this.validatedPackage || this.isRestoring()) {
      return;
    }
    this.isRestoring.set(true);
    this.restoreError.set('');
    this.restoreSuccess.set('');
    try {
      const decrypted: DecryptedBackup =
        await this.validation.decryptPackage(
          this.validatedPackage,
          this.restoreForm.controls.password.value,
        );
      const result = await this.restore.restore(
        decrypted,
        this.selectedFile()?.name ?? 'respaldo.zip',
      );
      if (!result.success) {
        const rollbackNote =
          result.rollbackPerformed && result.rollbackSucceeded
            ? ' Se recuperó la base de datos anterior.'
            : result.rollbackPerformed && !result.rollbackSucceeded
              ? ` No se pudo recuperar la base anterior. Copia preventiva: ${result.preventiveFilePath ?? 'desconocida'}`
              : '';
        this.restoreError.set(
          this.translateError(result.error) + rollbackNote,
        );
        await this.refreshState();
        return;
      }
      this.restoreSuccess.set(
        'La base de datos fue restaurada. Inicia sesión de nuevo.',
      );
      await this.auth.logout();
      await this.router.navigateByUrl('/auth/login', {
        replaceUrl: true,
      });
    } catch (error) {
      this.restoreError.set(this.translateError(this.errorCode(error)));
    } finally {
      this.isRestoring.set(false);
      this.isConfirmAlertOpen.set(false);
    }
  }

  private async refreshState(): Promise<void> {
    try {
      this.lastBackup.set(await this.history.getLastBackup());
      this.historyEntries.set(await this.history.list());
    } catch {
      // El historial es accesorio; no bloquea la pantalla.
    }
  }

  formatDate(iso: string | undefined): string {
    if (!iso) {
      return '';
    }
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  formatSize(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) {
      return '';
    }
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? '');
  }

  private translateError(code: string | undefined): string {
    switch (code) {
      case 'BACKUP_PASSWORD_TOO_SHORT':
        return `La contraseña debe tener al menos ${BACKUP_MIN_PASSWORD_LENGTH} caracteres.`;
      case 'PACKAGE_EMPTY':
      case 'PACKAGE_INVALID_ZIP':
        return 'El archivo no es un ZIP válido.';
      case 'PACKAGE_TOO_LARGE':
        return 'El archivo supera el tamaño máximo permitido.';
      case 'PACKAGE_SUSPICIOUS_ENTRIES':
        return 'El paquete contiene entradas inesperadas o inseguras.';
      case 'PACKAGE_MISSING_ENTRIES':
        return 'Al respaldo le faltan archivos internos.';
      case 'MANIFEST_MALFORMED':
        return 'El manifiesto del respaldo está dañado.';
      case 'MANIFEST_FOREIGN_APP':
        return 'Este respaldo pertenece a otra aplicación.';
      case 'MANIFEST_UNSUPPORTED_FORMAT':
        return 'El formato del respaldo no es compatible con esta versión.';
      case 'MANIFEST_WRONG_DATABASE':
        return 'El respaldo corresponde a otra base de datos.';
      case 'MANIFEST_ENCRYPTION_INVALID':
      case 'MANIFEST_INTEGRITY_INVALID':
        return 'Los metadatos de seguridad del respaldo son inválidos.';
      case 'CHECKSUM_FILE_MISMATCH':
      case 'CHECKSUM_MISMATCH':
        return 'La verificación de integridad falló; el archivo está alterado.';
      case 'BACKUP_PASSWORD_OR_DATA_INVALID':
        return 'Contraseña incorrecta o contenido dañado.';
      case 'BACKUP_JSON_INVALID':
        return 'El contenido del respaldo no es una base de datos válida.';
      case 'SCHEMA_TOO_NEW':
        return 'El respaldo fue creado por una versión más reciente de la app.';
      case 'BACKUP_EXPORT_EMPTY':
      case 'BACKUP_EXPORT_INVALID':
      case 'PREVENTIVE_EXPORT_EMPTY':
        return 'No se pudo leer la base de datos local.';
      case 'RESTORE_INTEGRITY_FAILED':
      case 'RESTORE_FK_VIOLATIONS':
      case 'RESTORE_MISSING_TABLES':
        return 'La base restaurada no superó las verificaciones de integridad.';
      default:
        return 'No se pudo completar la operación. Inténtalo de nuevo.';
    }
  }
}
