import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../../auth.module';
import { AuthService } from '../../services/auth.service';
import { AccountPage } from './account.page';

describe('AccountPage', () => {
  let fixture: ComponentFixture<AccountPage>;
  let changeUsername: ReturnType<typeof vi.fn>;
  let changePassword: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    changeUsername = vi.fn(async () => undefined);
    changePassword = vi.fn(async () => undefined);

    await TestBed.configureTestingModule({
      imports: [AuthModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUsername: 'coach',
            changeUsername,
            changePassword,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
  });

  it('shows the current account and separate credential sections', () => {
    const page = fixture.componentInstance;

    expect(page.currentUsername()).toBe('coach');
    expect(fixture.nativeElement.textContent).toContain('Cambiar usuario');
    expect(fixture.nativeElement.textContent).toContain(
      'Cambiar contraseña',
    );
  });

  it('requires matching new passwords before submitting', async () => {
    const page = fixture.componentInstance;
    page.passwordForm.setValue({
      currentPassword: 'current-password',
      newPassword: 'new-password-1',
      confirmPassword: 'new-password-2',
    });

    await page.submitPassword();

    expect(page.passwordForm.hasError('passwordMismatch')).toBe(true);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('submits the new username with current-password verification', async () => {
    const page = fixture.componentInstance;
    page.usernameForm.setValue({
      currentPassword: 'current-password',
      newUsername: 'new-coach',
    });

    await page.submitUsername();

    expect(changeUsername).toHaveBeenCalledWith(
      'current-password',
      'new-coach',
    );
    expect(page.usernameSuccess()).toBe(
      'El usuario se actualizó correctamente.',
    );
  });
});
