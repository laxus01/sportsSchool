import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import {
  LoginPageGuard,
  SetupPageGuard,
} from './guards/auth.guard';
import { LoginPage } from './pages/login/login.page';
import { SetupPage } from './pages/setup/setup.page';

const routes: Routes = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [LoginPageGuard],
  },
  {
    path: 'setup',
    component: SetupPage,
    canActivate: [SetupPageGuard],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
