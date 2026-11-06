import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AcudienteFormPage } from './pages/acudientes/acudiente-form.page';
import { AcudientesPage } from './pages/acudientes/acudientes.page';
import { DeportistaFormPage } from './pages/deportistas/deportista-form.page';
import { DeportistasPage } from './pages/deportistas/deportistas.page';
import { CategoriasPage } from './pages/categorias/categorias.page';
import { ManagementPage } from './management.page';
import { MedioPagoFormPage } from './pages/medios-pago/medio-pago-form.page';
import { MediosPagoPage } from './pages/medios-pago/medios-pago.page';
import { PagosPage } from './pages/pagos/pagos.page';
import { SchoolPage } from './pages/school/school.page';
import { GastosPage } from './pages/gastos/gastos.page';
import { ResumenFinanzasPage } from './pages/resumen-finanzas/resumen-finanzas.page';

const routes: Routes = [
  {
    path: 'deportistas',
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: DeportistasPage,
      },
      {
        path: 'nuevo',
        component: DeportistaFormPage,
      },
      {
        path: 'editar/:id',
        component: DeportistaFormPage,
      },
    ],
  },
  {
    path: 'acudientes',
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: AcudientesPage,
      },
      {
        path: 'nuevo',
        component: AcudienteFormPage,
      },
      {
        path: 'editar/:id',
        component: AcudienteFormPage,
      },
    ],
  },
  {
    path: 'medios-de-pago',
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: MediosPagoPage,
      },
      {
        path: 'nuevo',
        component: MedioPagoFormPage,
      },
      {
        path: 'editar/:id',
        component: MedioPagoFormPage,
      },
    ],
  },
  {
    path: 'pagos',
    component: PagosPage,
  },
  {
    path: 'gastos',
    component: GastosPage,
  },
  {
    path: 'resumen-finanzas',
    component: ResumenFinanzasPage,
  },
  {
    path: 'escuela',
    component: SchoolPage,
  },
  {
    path: 'categorias',
    component: CategoriasPage,
  },
  {
    path: ':section',
    component: ManagementPage,
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/home',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManagementRoutingModule {}
