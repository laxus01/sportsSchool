import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService, InitialAccountAlreadyExistsError } from '../../services/auth.service';

const matchingPasswords: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmPassword')?.value;
  return password && confirmation && password !== confirmation
    ? { passwordMismatch: true }
    : null;
};

@Component({
  selector: 'app-setup',
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
  standalone: false,
})
export class SetupPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup(
    {
      username: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3), Validators.maxLength(50)],
      }),
      password: new FormControl('', {
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

  isSubmitting = false;
  errorMessage = '';

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    try {
      const { username, password } = this.form.getRawValue();
      await this.auth.createInitialAccount(username, password);
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      if (error instanceof InitialAccountAlreadyExistsError) {
        await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
        return;
      }
      this.errorMessage =
        error instanceof Error
          ? error.message
          : 'No se pudo crear la cuenta. Inténtalo de nuevo.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
