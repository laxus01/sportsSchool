import {
  archiveOutline,
  businessOutline,
  cashOutline,
  cardOutline,
  peopleOutline,
  personOutline,
  pricetagsOutline,
  receiptOutline,
  statsChartOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';

export const MANAGEMENT_GROUPS = [
  'Personas',
  'Finanzas',
  'Administración',
] as const;

export type ManagementGroup = (typeof MANAGEMENT_GROUPS)[number];

export interface ManagementSection {
  id: string;
  group: ManagementGroup;
  title: string;
  description: string;
  icon: string;
  recordsLabel: string;
  showInHome?: boolean;
}

export const MANAGEMENT_SECTIONS: readonly ManagementSection[] = [
  {
    id: 'deportistas',
    group: 'Personas',
    title: 'Deportistas',
    description: 'Perfiles, categorías e inscripciones de nuevos integrantes.',
    icon: peopleOutline,
    recordsLabel: 'deportistas',
  },
  {
    id: 'acudientes',
    group: 'Personas',
    title: 'Acudientes',
    description: 'Responsables, contactos y vínculos con cada deportista.',
    icon: personOutline,
    recordsLabel: 'acudientes',
  },
  {
    id: 'gastos',
    group: 'Finanzas',
    title: 'Gastos',
    description: 'Consulta y organiza los gastos de la escuela.',
    icon: cashOutline,
    recordsLabel: 'gastos',
  },
  {
    id: 'inscripciones',
    group: 'Finanzas',
    title: 'Inscripciones',
    description: 'Cargos únicos para deportistas de nuevo ingreso.',
    icon: receiptOutline,
    recordsLabel: 'inscripciones',
    showInHome: false,
  },
  {
    id: 'generacion-obligaciones',
    group: 'Finanzas',
    title: 'Generación de obligaciones',
    description: 'Genera las mensualidades de los deportistas por periodo.',
    icon: receiptOutline,
    recordsLabel: 'obligaciones mensuales',
  },
  {
    id: 'cargos-adicionales',
    group: 'Finanzas',
    title: 'Cargos adicionales',
    description: 'Asigna cargos de actividades escolares por categoría.',
    icon: pricetagsOutline,
    recordsLabel: 'cargos adicionales',
  },
  {
    id: 'pagos',
    group: 'Finanzas',
    title: 'Pagos',
    description: 'Recibe pagos y consulta el historial de abonos.',
    icon: cardOutline,
    recordsLabel: 'pagos',
  },
  {
    id: 'resumen-finanzas',
    group: 'Finanzas',
    title: 'Resumen Finanzas',
    description: 'Consulta la recaudación y los saldos pendientes.',
    icon: statsChartOutline,
    recordsLabel: 'indicadores financieros',
  },
  {
    id: 'categorias',
    group: 'Administración',
    title: 'Categorías y tarifas',
    description: 'Define categorías deportivas y sus valores mensuales.',
    icon: pricetagsOutline,
    recordsLabel: 'categorías y tarifas',
  },
  {
    id: 'escuela',
    group: 'Administración',
    title: 'Escuela',
    description: 'Datos generales y valor de inscripción vigente.',
    icon: businessOutline,
    recordsLabel: 'datos de escuela',
  },
  {
    id: 'respaldo',
    group: 'Administración',
    title: 'Respaldo y recuperación',
    description: 'Copias cifradas de la información y restauración.',
    icon: archiveOutline,
    recordsLabel: 'respaldos',
  },
  {
    id: 'medios-de-pago',
    group: 'Administración',
    title: 'Medios de pago',
    description: 'Entidades disponibles para registrar transferencias.',
    icon: swapHorizontalOutline,
    recordsLabel: 'medios de pago',
  },
];
