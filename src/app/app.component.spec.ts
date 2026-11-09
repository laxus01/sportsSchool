import { TestBed } from '@angular/core/testing';

import { AppComponent } from './app.component';
import { AppModule } from './app.module';
import { LicenseAccessService } from './core/licensing/license-access.service';
import { DatabaseService } from './database/database.service';

describe('AppComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: LicenseAccessService,
          useValue: { initialize: () => Promise.resolve() },
        },
        {
          provide: DatabaseService,
          useValue: { initialize: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

});
