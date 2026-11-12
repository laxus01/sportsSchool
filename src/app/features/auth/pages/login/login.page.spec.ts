import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../../auth.module';
import { AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let login: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    login = vi.fn(async () => false);
    await TestBed.configureTestingModule({
      imports: [AuthModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: AuthService,
          useValue: { login },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  it('renders the local sign-in form', () => {
    expect(fixture.nativeElement.querySelector('ion-input')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ion-checkbox')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.setup-link')).toBeNull();
  });

  it('passes the remember-me selection to authentication', async () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      username: 'coach',
      password: 'password',
      rememberMe: true,
    });

    await page.submit();

    expect(login).toHaveBeenCalledWith('coach', 'password', true);
  });
});
