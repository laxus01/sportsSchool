import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthModule } from '../../auth.module';
import { AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  async function createPage(hasAccounts: boolean): Promise<ComponentFixture<LoginPage>> {
    await TestBed.configureTestingModule({
      imports: [AuthModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: AuthService,
          useValue: {
            hasAccounts: async () => hasAccounts,
            login: async () => false,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the first-access setup link when no account exists', async () => {
    const fixture = await createPage(false);

    expect(fixture.nativeElement.querySelector('.setup-link')).not.toBeNull();
    fixture.destroy();
  });

  it('hides the first-access setup link when an account exists', async () => {
    const fixture = await createPage(true);

    expect(fixture.nativeElement.querySelector('.setup-link')).toBeNull();
    fixture.destroy();
  });
});
