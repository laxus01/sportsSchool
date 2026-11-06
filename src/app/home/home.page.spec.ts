import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { HomePageModule } from './home.module';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePageModule, RouterModule.forRoot([])]
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

    expect(cards.length).toBe(8);
    expect(destinations).toContain('/gestion/deportistas');
    expect(destinations).toContain('/gestion/acudientes');
    expect(destinations).toContain('/gestion/pagos');
    expect(destinations).toContain('/gestion/gastos');
    expect(destinations).toContain('/gestion/resumen-finanzas');
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
