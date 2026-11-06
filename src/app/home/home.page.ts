import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { powerOutline } from 'ionicons/icons';

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

  readonly icons = { powerOutline };
  readonly menuGroups = MANAGEMENT_GROUPS.map((name) => ({
    name,
    items: MANAGEMENT_SECTIONS.filter(
      (section) => section.group === name && section.showInHome !== false,
    ),
  }));

  get currentUsername(): string {
    return this.auth.currentUsername ?? '';
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }
}
