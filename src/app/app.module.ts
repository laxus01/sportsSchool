import { APP_INITIALIZER, NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular/lazy';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { DatabaseService } from './database/database.service';
import { LicenseAccessService } from './core/licensing/license-access.service';
import { AuthService } from './features/auth/services/auth.service';

function initializeLocalAndLicenseState(
  database: DatabaseService,
  auth: AuthService,
  licenseAccess: LicenseAccessService,
): () => Promise<void> {
  return async () => {
    await database.initialize();
    await auth.restoreSession();
    await licenseAccess.initialize();
  };
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    IonicModule.forRoot(),
    AppRoutingModule,
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeLocalAndLicenseState,
      deps: [DatabaseService, AuthService, LicenseAccessService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
