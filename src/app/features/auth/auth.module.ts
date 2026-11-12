import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { AuthRoutingModule } from './auth-routing.module';
import { AccountPage } from './pages/account/account.page';
import { LoginPage } from './pages/login/login.page';
import { SetupPage } from './pages/setup/setup.page';

@NgModule({
  declarations: [AccountPage, LoginPage, SetupPage],
  imports: [CommonModule, IonicModule, ReactiveFormsModule, AuthRoutingModule],
})
export class AuthModule {}
