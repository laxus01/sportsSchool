import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    rememberMe: new FormControl(false, { nonNullable: true }),
  });

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const { username, password, rememberMe } = this.form.getRawValue();
      if (!(await this.auth.login(username, password, rememberMe))) {
        this.errorMessage.set('El usuario o la contraseña no son correctos.');
        return;
      }

      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch {
      this.errorMessage.set(
        'No se pudo validar el acceso. Comprueba la conexión local e inténtalo de nuevo.',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
