import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { RouterModule, Routes } from '@angular/router';

import { LicenseActivationPage } from './pages/license-activation.page';

const routes: Routes = [{ path: '', component: LicenseActivationPage }];

@NgModule({
  declarations: [LicenseActivationPage],
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
  ],
})
export class LicenseModule {}
