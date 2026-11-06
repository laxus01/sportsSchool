import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  canActivate(): boolean | UrlTree {
    if (this.auth.isAuthenticated) {
      return true;
    }

    return this.router.parseUrl('/auth/login');
  }
}

@Injectable({ providedIn: 'root' })
export class LoginPageGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  canActivate(): boolean | UrlTree {
    if (this.auth.isAuthenticated) {
      return this.router.parseUrl('/home');
    }

    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class SetupPageGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async canActivate(): Promise<boolean | UrlTree> {
    if (this.auth.isAuthenticated) {
      return this.router.parseUrl('/home');
    }

    return (await this.auth.hasAccounts())
      ? this.router.parseUrl('/auth/login')
      : true;
  }
}
