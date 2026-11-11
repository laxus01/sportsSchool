import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { RouterModule } from '@angular/router';

import { LicenseAccessService } from '../core/licensing/license-access.service';
import { HomePageModule } from './home.module';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let licenseStatus: WritableSignal<string>;
  let licenseCanWrite: WritableSignal<boolean>;

  beforeEach(async () => {
    licenseStatus = signal('NOT_REQUIRED');
    licenseCanWrite = signal(true);

    await TestBed.configureTestingModule({
      imports: [HomePageModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: LicenseAccessService,
          useValue: {
            status: licenseStatus,
            canWrite: licenseCanWrite,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows navigation cards for the main school areas', () => {
    const cards = fixture.nativeElement.querySelectorAll(
      '.module-card',
    ) as NodeListOf<HTMLAnchorElement>;
    const destinations = Array.from(cards).map((card) => card.getAttribute('href'));

    expect(cards.length).toBe(11);
    expect(destinations).toContain('/gestion/deportistas');
    expect(destinations).toContain('/gestion/acudientes');
    expect(destinations).toContain('/gestion/pagos');
    expect(destinations).toContain('/gestion/generacion-obligaciones');
    expect(destinations).toContain('/gestion/cargos-adicionales');
    expect(destinations).toContain('/gestion/gastos');
    expect(destinations).toContain('/gestion/resumen-finanzas');
    expect(destinations).toContain('/gestion/respaldo');
    expect(destinations).not.toContain('/gestion/mensualidades');
    expect(destinations).not.toContain('/gestion/inscripciones');
  });

  it('keeps cards enabled during the subscription grace period', () => {
    licenseStatus.set('GRACE_PERIOD');
    licenseCanWrite.set(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.module-card-disabled').length,
    ).toBe(0);
    expect(
      fixture.nativeElement.querySelectorAll('a.module-card').length,
    ).toBe(11);
  });

  it('disables operational cards without a license or after grace expires', () => {
    for (const status of ['ACTIVATION_REQUIRED', 'EXPIRED']) {
      licenseStatus.set(status);
      licenseCanWrite.set(false);
      fixture.detectChanges();

      const disabledCards = fixture.nativeElement.querySelectorAll(
        '.module-card-disabled[aria-disabled="true"]',
      ) as NodeListOf<HTMLDivElement>;
      const enabledCards = fixture.nativeElement.querySelectorAll(
        'a.module-card',
      ) as NodeListOf<HTMLAnchorElement>;

      expect(disabledCards.length).toBe(10);
      expect(enabledCards.length).toBe(1);
      expect(enabledCards[0].getAttribute('href')).toBe('/gestion/respaldo');
    }
  });

  it('exposes logout as an accessible power icon button', () => {
    const logoutButton = fixture.nativeElement.querySelector(
      'ion-button[aria-label="Cerrar sesión"]',
    ) as HTMLIonButtonElement | null;

    expect(logoutButton).not.toBeNull();
    expect(logoutButton?.querySelector('ion-icon')?.getAttribute('aria-hidden'))
      .toBe('true');
  });
});
