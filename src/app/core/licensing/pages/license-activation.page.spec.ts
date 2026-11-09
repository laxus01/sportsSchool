import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LicenseAccessService } from '../license-access.service';
import { LicenseModule } from '../license.module';
import { LicenseActivationPage } from './license-activation.page';

describe('LicenseActivationPage', () => {
  let fixture: ComponentFixture<LicenseActivationPage>;
  let page: LicenseActivationPage;
  const activate = vi.fn(async () => undefined);

  beforeEach(async () => {
    activate.mockClear();
    await TestBed.configureTestingModule({
      imports: [LicenseModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: LicenseAccessService,
          useValue: {
            status: signal('ACTIVATION_REQUIRED'),
            canWrite: signal(false),
            claims: signal(null),
            activate,
            refreshNow: vi.fn(async () => false),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LicenseActivationPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('offers activation and recovery when no valid grant is stored', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Activación pendiente');
    expect(text).toContain('Activar esta instalación');
    expect(text).toContain('respaldo y recuperación');
  });

  it('does not submit a missing activation code', async () => {
    await page.submitActivation();

    expect(activate).not.toHaveBeenCalled();
    expect(page.form.controls.activationCode.touched).toBe(true);
  });
});
