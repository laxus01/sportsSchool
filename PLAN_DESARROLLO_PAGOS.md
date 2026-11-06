# Plan de desarrollo: sistema de pagos

## 1. Propósito y alcance

Este plan convierte la guía de evaluación de pagos de escuelas deportivas y
el diagnóstico del código actual en una ruta de implementación priorizada.
El objetivo es completar un MVP confiable para generar obligaciones, registrar
dinero recibido, aplicarlo a obligaciones y consultar saldos, sin duplicar
innecesariamente el modelo existente.

Este documento es un plan, no una autorización para ejecutar cambios en la
base de datos. No se aplicaron cambios en la aplicación ni en la base de datos.

### Estado actual observado

- La aplicación tiene tablas separadas para mensualidades, pagos y sus
  aplicaciones; también existen tablas para inscripciones y aplicaciones de
  pago a inscripción.
- Las mensualidades y pagos se guardan con transacciones, y la base de datos
  contiene claves foráneas y una restricción única por deportista y periodo.
- El formulario permite abonos parciales a mensualidades y los aplica primero
  a la más antigua.
- La generación disponible está fija en octubre de 2026, usa la tarifa vigente
  al día de ejecución y no filtra deportistas inactivos ni fecha de ingreso.
- Las inscripciones se guardan al crear un deportista, pero no se pueden pagar
  desde el flujo actual de pagos.
- No se encontró una cuenta corriente completa, anulaciones visibles, roles
  diferenciados, bitácora financiera ni flujo de respaldo/sincronización.

## 2. Principios de implementación

1. Conservar `mensualidades`, `inscripciones`, `pagos`, `pago_mensualidad` y
   `pago_inscripcion` mientras resuelvan las obligaciones actuales. No crear
   otra tabla equivalente sin una necesidad funcional demostrada.
2. Mantener importes en pesos enteros y preservar el importe histórico de cada
   obligación.
3. Generar cargos de manera idempotente y dentro de transacciones.
4. No convertir un pago recibido en una deuda cancelada sin registrar cómo se
   aplicó el dinero.
5. Conservar pagos y obligaciones con movimientos financieros; corregirlos
   mediante reversos o anulaciones trazables, no mediante borrado.
6. Mantener compatibilidad con las bases SQLite locales existentes mediante
   migraciones versionadas y aditivas.
7. Resolver primero la exactitud de los cargos y la integridad del dinero;
   dejar automatizaciones y funciones avanzadas para fases posteriores.

## 3. Decisiones confirmadas y pendientes

### Confirmadas para este MVP

- Cada escuela configurará su propia fecha de inicio del control; no habrá un
  periodo fijo en el código.
- El mes de ingreso se cobra completo.
- La inscripción usa una tarifa configurada por la escuela; el alta no define
  una tarifa independiente por deportista.
- Los excedentes se rechazan; no se guardan como saldo a favor ni como dinero
  pendiente de aplicar.
- Los cambios de categoría y tarifa rigen desde el siguiente mes.
- Cada pago se imputa a un deportista, no a una cuenta familiar compartida.
- La primera versión mantiene SQLite local con un operador y permite exportar un
  respaldo.

### Pendientes de configuración o decisión

- El valor concreto de inicio del control, la tarifa de inscripción y el día de
  vencimiento se configurarán para cada escuela.
- Excepciones, exoneraciones o descuentos a la inscripción.
- Tratamiento de suspensiones, pausas y vacaciones.
- Si un retiro a mitad de mes genera el cargo completo del periodo o un ajuste.
- Si se empieza sin deuda histórica o si se importan saldos iniciales manuales.
- Si emitir recibos forma parte del MVP.

La aplicación ya permite abonos parciales y los aplica primero a la obligación
más antigua. Se conserva este comportamiento para el MVP.

## 4. Plan priorizado

### Fase 0 — Definir reglas y alcance del MVP

**Prioridad:** P0 — previa a cambios que generen cargos.

**Trabajo**

- Confirmar las decisiones de negocio de la sección 3.
- Definir quién puede generar, registrar, anular y consultar movimientos.
- Acordar si la primera versión operará en un solo dispositivo o requiere
  varios usuarios/dispositivos con datos compartidos.
- Definir la política de respaldo y recuperación de la base local.

**Componentes:** responsable de la escuela, producto y diseño técnico.

**Dependencias:** ninguna.

**Criterios de aceptación**

- Las reglas tienen responsable y valor explícito; no quedan supuestos
  escondidos en constantes de la interfaz.
- Se define qué escenarios entran al MVP y cuáles quedan para una versión
  posterior.
- Hay una decisión documentada sobre operación local, respaldo y acceso.

### Fase 1 — Corregir configuración y generación de obligaciones

**Prioridad:** P0 — crítica para evitar cobros incorrectos.

**Trabajo**

- Reemplazar el periodo y vencimiento fijos de octubre de 2026 por una
  generación para un periodo seleccionado o configurado por la escuela.
- Crear la configuración de inicio del control. Los deportistas antiguos no
  deben recibir inscripción automáticamente ni cargos anteriores a ese inicio.
- Determinar elegibilidad para el periodo con fecha real de ingreso y estado
  efectivo del deportista. Si se requiere generar periodos históricos, el estado
  actual por sí solo no es suficiente: debe persistirse la fecha efectiva de
  retiro o el historial necesario.
- Seleccionar la tarifa válida para el periodo facturado, no la vigente el día
  en que se ejecuta la generación.
- Mostrar una vista previa con deportistas incluidos, cargos, tarifa aplicada,
  registros omitidos y motivo (por ejemplo, sin tarifa o ya generado).
- Mantener la restricción única por deportista y periodo. Un segundo intento
  debe informar que el periodo ya existe sin duplicarlo.
- No generar una obligación para un deportista cuyo ingreso sea posterior al
  periodo facturado.
- Definir cómo tratar mensualidades anuladas al reintentar una generación.

**Componentes:** configuración de escuela, `pagos.page.ts`, esquema SQLite,
   servicio de base de datos y pruebas.

**Dependencias:** decisiones de inicio, vencimiento, retiro y vigencia tarifaria
de la Fase 0.

**Criterios de aceptación**

- Un deportista antiguo no recibe inscripción ni deudas anteriores a la fecha
  de inicio; recibe únicamente las mensualidades que correspondan desde esa
  fecha.
- Un deportista nuevo no recibe cargos anteriores a su fecha de ingreso.
- Un deportista inactivo o retirado no recibe cargos posteriores a la fecha
  efectiva definida por la escuela.
- Cambiar una tarifa en noviembre no cambia el importe de una obligación de
  octubre ya generada ni la tarifa que correspondía a octubre si todavía no se
  había generado.
- Repetir la generación no duplica cargos.
- La vista previa coincide con los cargos confirmados y explica las omisiones.

### Fase 2 — Completar ingreso nuevo e inscripción

**Prioridad:** P1 — necesaria para operar con nuevos deportistas.

**Trabajo**

- Conectar el cobro de inscripción con las tablas existentes de inscripción y
  `pago_inscripcion`.
- Permitir que un pago se aplique a una inscripción, a una o varias
  mensualidades, o a una combinación de obligaciones si la política lo permite.
- Generar la mensualidad del periodo de ingreso aplicando las reglas de
  proporcionalidad y tarifa acordadas.
- Diferenciar de forma clara a un deportista nuevo de uno que ya pertenecía a la
  escuela. No depender únicamente de que el operador escriba cero en un campo.
- Resolver la fuente de verdad para el valor de inscripción: la migración ya
  agrega un valor en `escuela`, mientras el formulario solicita un valor por
  deportista. Mantener una sola política coherente y permitir excepciones
  justificadas.
- Preservar la unicidad actual de una inscripción por deportista. Si en el
  futuro se permiten reingresos con una nueva inscripción, modelarlos como
  eventos de ingreso separados antes de cambiar esa restricción.

**Componentes:** alta de deportista, configuración de escuela, pagos,
   migraciones SQLite y pruebas.

**Dependencias:** decisiones de inscripción, mes de ingreso y descuentos de la
Fase 0; generación de la Fase 1.

**Criterios de aceptación**

- El caso de un deportista nuevo con inscripción genera una inscripción y la
  mensualidad correspondiente al ingreso.
- Se puede pagar la inscripción y el sistema refleja su saldo correctamente.
- Un deportista antiguo no recibe inscripción por el hecho de registrarse en la
  aplicación.
- Una operación incompleta no deja al deportista, inscripción o pago en un
  estado parcial de base de datos.

### Fase 3 — Integridad transaccional de pagos y saldos

**Prioridad:** P0 — crítica para evitar sobreaplicaciones o pérdida de dinero.

**Trabajo**

- Antes de guardar un pago, volver a consultar dentro de la transacción las
  obligaciones seleccionadas y sus saldos actuales.
- Validar que las aplicaciones sean positivas, no excedan el saldo de cada
  obligación y que su suma no supere el pago recibido.
- Confirmar dentro de la transacción que no se haya anulado la obligación o el
  pago mientras se preparaba el formulario.
- Asegurar que el pago y todas sus aplicaciones se confirmen o reviertan juntos.
- Implementar la política de excedentes definida en la Fase 0. No descartar ni
  aplicar silenciosamente el valor sobrante.
- Mantener los cálculos monetarios en enteros COP.
- Evitar dobles envíos del formulario y definir una estrategia idempotente para
  reintentos de guardado.

**Componentes:** pagos, acceso a SQLite, restricciones o validaciones de base de
datos y pruebas.

**Dependencias:** decisión sobre excedentes; modelo de obligaciones de la Fase 2.

**Criterios de aceptación**

- Un pago completo deja saldo cero; uno parcial reduce el saldo por el importe
  aplicado.
- Un pago puede cubrir varias obligaciones y una obligación puede recibir
  varios pagos.
- No se guardan aplicaciones cuya suma exceda el pago ni el saldo vigente.
- Si falla cualquier inserción, se revierte el pago y todas sus aplicaciones.
- El resultado no depende de saldos antiguos cargados previamente en la
  interfaz.

### Fase 4 — Cuenta corriente, historial y reversos

**Prioridad:** P1 — necesaria para operar y auditar.

**Trabajo**

- Crear una vista de cuenta corriente por deportista con obligaciones,
  conceptos, periodos, vencimientos, aplicaciones, saldo y pagos.
- Calcular estados pendiente, parcial y pagado desde obligaciones y aplicaciones
  válidas, o mantenerlos sincronizados si se decide persistirlos.
- Excluir obligaciones anuladas y aplicaciones de pagos anulados del saldo.
- Implementar anulación/reverso con motivo, fecha y usuario responsable.
- Mantener las operaciones anuladas visibles en el historial para auditoría.
- Mostrar valor recibido, valor aplicado, medio, referencia, observación,
  deportista(s), periodo(s) y saldo resultante.
- Añadir recibo o comprobante si se confirma que forma parte del MVP.

**Componentes:** modelo de datos, pagos, perfil/estado de cuenta y pruebas.

**Dependencias:** fases 2 y 3; decisión de recibos y responsable de pago.

**Criterios de aceptación**

- El saldo del perfil coincide con la suma de obligaciones menos aplicaciones
  válidas.
- Anular un pago restaura los saldos correspondientes sin borrar el registro.
- Una obligación anulada no aparece como cartera pendiente.
- El historial permite rastrear quién realizó cada acción y por qué.

### Fase 5 — Panel operativo, permisos y continuidad de datos

**Prioridad:** P1 — requerida para administración confiable.

**Trabajo**

- Incorporar indicadores mínimos: recaudado en un rango de fechas, pendiente
  total, deportistas al día/con saldo, vencidos y pagos recientes.
- Añadir filtros por fecha, periodo, categoría, concepto y medio cuando sean
  necesarios para la operación.
- Definir los roles mínimos (por ejemplo, administración y consulta) si habrá
  más de un operador; restringir generación, registro, anulación y consulta
  según rol.
- Registrar actor y fecha en operaciones financieras.
- Diseñar y probar respaldo y restauración de SQLite. Si se requiere compartir
  información entre dispositivos, definir sincronización antes de habilitar esa
  operación.

**Componentes:** panel, autenticación/autorización, auditoría y almacenamiento.

**Dependencias:** decisión de usuarios, dispositivos y respaldo de la Fase 0;
cuenta corriente de la Fase 4.

**Criterios de aceptación**

- Los indicadores coinciden con los pagos y obligaciones del periodo filtrado.
- Los permisos impiden acciones no autorizadas, no solo ocultan botones.
- Se puede recuperar una copia de datos y verificar que conserva pagos,
  aplicaciones y saldos.

### Fase 6 — Mejoras posteriores

**Prioridad:** P2/P3 — no bloquea el MVP si las decisiones de negocio no las
requieren.

- **P2:** cuentas familiares/acudiente responsable, becas y descuentos,
  exoneraciones, saldos a favor, recibos descargables y exportación contable.
- **P2:** historial de cambios de categoría y reglas de prorrateo más
  sofisticadas.
- **P3:** generación programada de mensualidades, recordatorios de vencimiento,
  integración con pasarelas y sincronización multi-dispositivo.

Estas mejoras deben reutilizar el modelo existente cuando sea suficiente. Si se
incorporan nuevos conceptos de cobro distintos de inscripción y mensualidad,
evaluar entonces si conviene un modelo general de obligaciones.

## 5. Cobertura de escenarios de la guía

| Caso | Cobertura requerida |
|---|---|
| A — Deportista antiguo | Cubrir desde la fecha de inicio, sin inscripción ni deuda histórica automática. |
| B — Deportista nuevo | Crear inscripción según política y mensualidad del periodo de ingreso. |
| C — Pago completo | Saldo cero y obligación pagada. |
| D — Pago parcial | Aplicar abono y conservar el saldo restante. |
| E — Varios periodos | Distribuir el pago entre obligaciones y mostrar cada aplicación. |
| F — Cambio de tarifa | Preservar el valor histórico y usar la vigencia correcta en nuevas obligaciones. |
| G — Ejecución duplicada | No duplicar; informar al operador del resultado. |
| H — Retiro | No generar después de la fecha efectiva; conservar deudas previas. |
| I — Pago superior a deuda | Aplicar la política acordada sin perder ni asignar silenciosamente el excedente. |
| J — Cambio de categoría | Aplicar una regla por periodo sin recalcular cargos ya generados. |

## 6. Estrategia de migración y compatibilidad

- Mantener migraciones versionadas y atómicas; respaldar la base local antes de
  una actualización que cambie el esquema.
- Preferir cambios aditivos y conservar los identificadores y pagos existentes.
- No reconstruir saldos históricos suponiendo datos que no estén almacenados.
  Si se importan saldos iniciales, registrarlos como movimientos identificables
  y aprobados por la escuela.
- Revisar el valor de inscripción ya almacenado en la columna de escuela y los
  valores guardados por deportista antes de elegir la fuente de verdad.
- No borrar ni sobrescribir pagos u obligaciones existentes durante la
  migración.
- Validar en una copia de datos que los saldos antes y después de cada
  migración coincidan.

## 7. Puerta de salida a producción

El MVP estará listo para operar cuando:

- Las reglas de negocio de la Fase 0 estén aprobadas.
- La generación pase los casos A, F, G, H y J sin cargos incorrectos.
- El registro de pagos pase los casos C, D, E e I, incluyendo rollback y
  revalidación transaccional.
- Se pueda cobrar inscripción cuando aplique y se conserve el tratamiento cero
  para deportistas antiguos.
- Exista consulta de saldos e historial suficiente para que administración
  pueda verificar cada cobro.
- Los roles y el respaldo correspondan al modo de operación acordado.
- Las pruebas automatizadas y la validación manual en dispositivos objetivo
  estén aprobadas.

## 8. Estado de implementación

### Implementado en el código

- Configuración por escuela de inicio del control, valor de inscripción y día
  límite mensual.
- Generación manual para un periodo seleccionado, con selección de tarifa para
  ese periodo, filtro de ingreso/retiro, vista previa y protección contra
  duplicados.
- Cobro de inscripción de escuela y mensualidad completa en el mes de ingreso;
  los deportistas ingresados antes del control no reciben inscripción.
- Aplicación de pagos a mensualidades e inscripciones, con rechazo de
  excedentes y revalidación del saldo dentro de la transacción.
- Historial de anulaciones, auditoría financiera, saldos y métricas básicas.
- Cambio de categoría desde el siguiente mes y fecha efectiva de retiro.
- Exportación local de respaldo JSON.

### Pendiente antes de operación real

- La migración de base de datos está definida en el código, pero no se ejecutó
  contra la base local.
- No se implementaron restauración de respaldos, recibos, saldos iniciales
  manuales, descuentos, suspensiones ni generación programada.
- La migración debe validarse en una copia de datos y luego aplicarse con la
  autorización requerida para escrituras de base de datos.
- Validar la exportación de archivos y los flujos financieros en un dispositivo
  Android real antes de producción.
