import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { ManagementRoutingModule } from './management-routing.module';
import { DateInputComponent } from './components/date-input/date-input.component';
import { MoneyInputComponent } from './components/money-input/money-input.component';
import { AcudienteFormPage } from './pages/acudientes/acudiente-form.page';
import { AcudientesPage } from './pages/acudientes/acudientes.page';
import { DeportistaFormPage } from './pages/deportistas/deportista-form.page';
import { DeportistasPage } from './pages/deportistas/deportistas.page';
import { CategoriasPage } from './pages/categorias/categorias.page';
import { ManagementPage } from './management.page';
import { MedioPagoFormPage } from './pages/medios-pago/medio-pago-form.page';
import { MediosPagoPage } from './pages/medios-pago/medios-pago.page';
import { PagosPage } from './pages/pagos/pagos.page';
import { RespaldoPage } from './pages/respaldo/respaldo.page';
import { SchoolPage } from './pages/school/school.page';
import { GastosPage } from './pages/gastos/gastos.page';
import { ResumenFinanzasPage } from './pages/resumen-finanzas/resumen-finanzas.page';

@NgModule({
  declarations: [
    AcudientesPage,
    AcudienteFormPage,
    DeportistasPage,
    DeportistaFormPage,
    CategoriasPage,
    ManagementPage,
    DateInputComponent,
    MoneyInputComponent,
    MediosPagoPage,
    MedioPagoFormPage,
    PagosPage,
    RespaldoPage,
    SchoolPage,
    GastosPage,
    ResumenFinanzasPage,
  ],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, ManagementRoutingModule],
})
export class ManagementModule {}
