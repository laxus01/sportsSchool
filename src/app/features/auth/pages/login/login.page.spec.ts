import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthModule } from '../../auth.module';
import { AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: AuthService,
          useValue: { login: async () => false },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  it('renders the local sign-in form', () => {
    expect(fixture.nativeElement.querySelector('ion-input')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.setup-link')).toBeNull();
  });
});
