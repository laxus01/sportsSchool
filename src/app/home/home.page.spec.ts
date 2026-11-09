import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RouterModule } from '@angular/router';

import { LicenseAccessService } from '../core/licensing/license-access.service';
import { HomePageModule } from './home.module';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePageModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: LicenseAccessService,
          useValue: {
            status: signal('NOT_REQUIRED'),
            canWrite: signal(true),
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

    expect(cards.length).toBe(9);
    expect(destinations).toContain('/gestion/deportistas');
    expect(destinations).toContain('/gestion/acudientes');
    expect(destinations).toContain('/gestion/pagos');
    expect(destinations).toContain('/gestion/gastos');
    expect(destinations).toContain('/gestion/resumen-finanzas');
    expect(destinations).toContain('/gestion/respaldo');
    expect(destinations).not.toContain('/gestion/mensualidades');
    expect(destinations).not.toContain('/gestion/inscripciones');
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
