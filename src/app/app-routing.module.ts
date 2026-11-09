import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { AuthGuard } from './features/auth/guards/auth.guard';

const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.module').then((module) => module.AuthModule),
  },
  {
    path: 'home',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./home/home.module').then((module) => module.HomePageModule),
  },
  {
    path: 'gestion',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./features/management/management.module').then(
        (module) => module.ManagementModule,
      ),
  },
  {
    path: 'licensing',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./core/licensing/license.module').then(
        (module) => module.LicenseModule,
      ),
  },
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
