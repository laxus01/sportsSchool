import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { lockClosedOutline, personOutline } from 'ionicons/icons';

import {
  AuthService,
  AuthenticationRequiredError,
  InvalidCurrentPasswordError,
  UsernameAlreadyInUseError,
} from '../../services/auth.service';

const matchingPasswords: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('newPassword')?.value;
  const confirmation = control.get('confirmPassword')?.value;
  return password && confirmation && password !== confirmation
    ? { passwordMismatch: true }
    : null;
};

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  standalone: false,
})
export class AccountPage {
  private readonly auth = inject(AuthService);

  readonly icons = {
    personOutline,
    lockClosedOutline,
  };
  readonly currentUsername = signal(this.auth.currentUsername ?? '');
  readonly usernameForm = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    newUsername: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(50),
      ],
    }),
  });
  readonly passwordForm = new FormGroup(
    {
      currentPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      newPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: matchingPasswords },
  );

  readonly isUpdatingUsername = signal(false);
  readonly isUpdatingPassword = signal(false);
  readonly usernameError = signal('');
  readonly usernameSuccess = signal('');
  readonly passwordError = signal('');
  readonly passwordSuccess = signal('');

  async submitUsername(): Promise<void> {
    this.usernameForm.markAllAsTouched();
    if (this.usernameForm.invalid || this.isUpdatingUsername()) {
      return;
    }

    this.isUpdatingUsername.set(true);
    this.usernameError.set('');
    this.usernameSuccess.set('');
    try {
      const { currentPassword, newUsername } =
        this.usernameForm.getRawValue();
      await this.auth.changeUsername(currentPassword, newUsername);
      this.currentUsername.set(this.auth.currentUsername ?? '');
      this.usernameForm.reset({ currentPassword: '', newUsername: '' });
      this.usernameSuccess.set('El usuario se actualizó correctamente.');
    } catch (error) {
      this.usernameError.set(this.getErrorMessage(error));
    } finally {
      this.isUpdatingUsername.set(false);
    }
  }

  async submitPassword(): Promise<void> {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid || this.isUpdatingPassword()) {
      return;
    }

    this.isUpdatingPassword.set(true);
    this.passwordError.set('');
    this.passwordSuccess.set('');
    try {
      const { currentPassword, newPassword } =
        this.passwordForm.getRawValue();
      await this.auth.changePassword(currentPassword, newPassword);
      this.passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      this.passwordSuccess.set('La contraseña se actualizó correctamente.');
    } catch (error) {
      this.passwordError.set(this.getErrorMessage(error));
    } finally {
      this.isUpdatingPassword.set(false);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof InvalidCurrentPasswordError) {
      return 'La contraseña actual no es correcta.';
    }
    if (error instanceof UsernameAlreadyInUseError) {
      return 'Ese nombre de usuario ya está en uso.';
    }
    if (error instanceof AuthenticationRequiredError) {
      return 'La sesión ya no está activa. Inicia sesión de nuevo.';
    }

    return error instanceof Error
      ? error.message
      : 'No se pudieron guardar los cambios. Inténtalo de nuevo.';
  }
}
