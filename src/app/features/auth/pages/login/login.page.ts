import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
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
  });

  readonly isFirstAccess = signal(false);
  readonly isCheckingInitialAccess = signal(true);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    void this.checkInitialAccess();
  }

  private async checkInitialAccess(): Promise<void> {
    try {
      this.isFirstAccess.set(!(await this.auth.hasAccounts()));
    } catch {
      this.errorMessage.set(
        'No se pudo comprobar el acceso inicial. Inténtalo de nuevo.',
      );
    } finally {
      this.isCheckingInitialAccess.set(false);
    }
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const { username, password } = this.form.getRawValue();
      if (!(await this.auth.login(username, password))) {
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
