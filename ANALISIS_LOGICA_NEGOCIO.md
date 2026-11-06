# Análisis de lógica de negocio — Sports School

**Propósito de este documento:** describir cómo funciona hoy la aplicación para
que el cliente pueda **validar que la lógica implementada coincide con la
operación real de la escuela**, y registrar las posibles mejoras a futuro.

- **Fecha del análisis:** noviembre 2026
- **Alcance:** aplicación de administración de escuela deportiva (Android /
  navegador), base de datos local SQLite.
- **Cómo usarlo:** revisar cada sección y marcar las preguntas de validación.
  Los puntos donde la realidad de la escuela difiera del comportamiento
  descrito deben anotarse para ajuste o planificación.

---

## 1. Resumen ejecutivo

La aplicación administra una escuela deportiva de forma **completamente local**
(sin internet ni servidor): datos de la escuela, categorías con tarifas,
deportistas, acudientes, cobros (inscripción y mensualidades), registro de
pagos, gastos, reportes financieros y respaldo de la información.

Todos los valores monetarios se manejan en **pesos colombianos (COP) enteros**.

El modelo financiero es de **obligaciones y aplicaciones**:

1. El sistema **genera deudas** (inscripciones y mensualidades).
2. El dinero recibido se registra como **pago** y se **aplica** contra las
   deudas pendientes.
3. El **saldo** de cada deportista = deudas activas − pagos aplicados.

---

## 2. Puesta en marcha (primera vez que se abre la app)

### 2.1 Cuenta administradora

- La primera ejecución exige crear un **usuario y contraseña** locales.
- Solo se permite crear la cuenta inicial una vez; luego la app siempre pide
  login.
- Las contraseñas se guardan cifradas (hash PBKDF2, 600.000 iteraciones).
- Actualmente existe **un solo usuario operador** de la aplicación.

### 2.2 Datos de la escuela

En "Datos de la escuela" se configuran los parámetros que rigen toda la
facturación:

| Parámetro | Efecto |
|---|---|
| Nombre, NIT, representante | Datos identificatorios de la escuela. |
| **Fecha de inicio del control de pagos** | Define desde cuándo el sistema cobra. Separa a los deportistas "antiguos" de los "nuevos". |
| **Valor de inscripción** | Tarifa única de inscripción, igual para todos los deportistas nuevos. |
| **Día de vencimiento mensual** (1–31) | Se usa para calcular la fecha límite de pago de cada mensualidad. Si el mes tiene menos días, se usa el último día del mes. |

**Regla de protección:** una vez generadas mensualidades o inscripciones, la
fecha de inicio del control **queda bloqueada** y no puede cambiarse, para no
romper la consistencia del historial de cobros.

> **Preguntas de validación**
> - [ ] ¿La operación real es de un solo operador, o se necesitan varios
>       usuarios con distintos permisos?
> - [ ] ¿El valor de inscripción es realmente único para toda la escuela, o
>       hay excepciones (hermanos, becados, convenios)?
> - [ ] ¿El día de vencimiento configurado coincide con el día real de corte
>       de cartera de la escuela?

---

## 3. Alta de un deportista (creación inicial)

Al registrar un deportista se capturan:

- Nombres y apellidos
- Fecha de nacimiento
- **Fecha de ingreso** (no puede ser futura)
- Categoría
- Foto (opcional, máx. 8 MB, se comprime automáticamente)
- Acudientes vinculados, cada uno con su parentesco (madre, padre, tutor, etc.)

### 3.1 La regla central: fecha de ingreso vs. inicio del control

La lógica de cobro depende de comparar la **fecha de ingreso del deportista**
con la **fecha de inicio del control de pagos** de la escuela:

| Caso | Qué genera el sistema automáticamente |
|---|---|
| **Deportista nuevo** (ingreso ≥ inicio del control) | ① Una **inscripción** por el valor configurado en la escuela.<br>② La **mensualidad completa del mes de ingreso** — el mes se cobra completo, sin prorrateo — con la tarifa vigente de su categoría en ese mes. |
| **Deportista antiguo** (ingreso < inicio del control) | **Nada.** No genera inscripción ni deuda histórica. Solo queda registrado y empezará a recibir mensualidades en la siguiente generación de cargos. |

### 3.2 Protecciones del alta

- Todo el registro se guarda en **una sola transacción**: si algo falla, no
  queda información a medias.
- Se crea el **historial de categoría** del deportista desde su fecha de
  ingreso (clave para cobrar siempre la tarifa correcta).
- Si la categoría no tiene tarifa vigente para el mes de ingreso, el alta se
  bloquea con un mensaje al operador.
- Una vez que el deportista tiene obligaciones generadas, **su fecha de
  ingreso y categoría ya no se pueden editar**, para no romper la historia
  financiera.
- Un deportista **no se puede eliminar** si tiene mensualidades, inscripciones
  o acudientes vinculados. Solo puede **retirarse** (ver §6).

> **Preguntas de validación**
> - [ ] ¿Es correcto que el mes de ingreso se cobre **completo**, aunque el
>       deportista ingrese el día 28?
> - [ ] ¿Los deportistas antiguos realmente no deben recibir inscripción ni
>       deuda previa al importar la cartera actual?
> - [ ] ¿Debe existir la posibilidad de registrar **saldos iniciales** de
>       deportistas que ya debían dinero antes de usar la app?
> - [ ] ¿Basta con nombre, documento, fecha de nacimiento, categoría y foto,
>       o hacen falta más datos (EPS, dirección, colegio, observaciones
>       médicas)?

---

## 4. Categorías y tarifas

- Las **categorías** agrupan a los deportistas (ej. Sub-8, Sub-12, Adultos).
- Cada categoría tiene **tarifas con vigencia** (`vigente_desde` /
  `vigente_hasta`): un historial de precios en el tiempo.
- Al cobrar un periodo se usa siempre la tarifa **vigente en ese periodo**,
  no la de hoy: una mensualidad ya generada **nunca cambia de valor** aunque
  la tarifa suba después.
- Los cambios de categoría de un deportista **rigen desde el mes siguiente**
  y quedan registrados en el historial de categorías.

> **Preguntas de validación**
> - [ ] ¿Las categorías actuales y sus tarifas reflejan la estructura real
>       de la escuela?
> - [ ] ¿Los cambios de tarifa siempre se anuncian con anticipación y aplican
>       al mes siguiente, o hay ajustes a mitad de mes?
> - [ ] ¿Un deportista puede estar en más de una categoría a la vez?

---

## 5. Cómo se manejan los pagos

### 5.1 Obligaciones (deudas)

Dos tipos:

| Obligación | Origen | Frecuencia |
|---|---|---|
| **Inscripción** | Se crea automáticamente en el alta del deportista nuevo. | Una sola por deportista. |
| **Mensualidad** | Se genera manualmente por periodo (`AAAA-MM`) desde la pantalla de Pagos. | Una por deportista por mes. |

Cada mensualidad tiene monto y fecha de vencimiento **congelados** al momento
de crearse. La base de datos impide duplicar una mensualidad para el mismo
deportista y periodo.

### 5.2 Generación de mensualidades del mes

El operador elige el periodo y presiona "Generar". El sistema:

- Muestra una **vista previa** con los deportistas que recibirán cargo, la
  tarifa que se aplicará, y quiénes se omiten (ej. sin tarifa vigente).
- **Excluye automáticamente:**
  - Deportistas retirados antes del periodo.
  - Deportistas que ingresaron después del periodo.
  - Deportistas que ya tienen mensualidad en ese periodo (sin duplicados).
- **No permite** generar periodos futuros ni anteriores al inicio del
  control.

### 5.3 Registro de un pago

Flujo:

1. Se selecciona el **deportista** → se listan sus obligaciones con saldo
   pendiente (inscripción + mensualidades), de la más antigua a la más
   reciente.
2. El operador marca **qué obligaciones paga**; el monto se sugiere como la
   suma de esos saldos.
3. Se registran: fecha de pago (no futura), monto, medio de pago, referencia
   y observación.

**Medios de pago:**

- **Efectivo.**
- **Transferencia** — exige elegir entidad (Nequi, Daviplata, Bancolombia,
  Bre-B; el catálogo es administrable).

### 5.4 Reglas de aplicación del dinero

- El pago se distribuye **de la obligación más antigua a la más reciente**
  hasta agotarse.
- **Abonos parciales permitidos:** si el pago no cubre todo, la obligación
  queda con saldo restante.
- **No se aceptan excedentes:** un pago no puede superar el saldo
  seleccionado (no existe "saldo a favor").
- Un pago puede cubrir **varias obligaciones**; una obligación puede recibir
  **varios pagos**.
- Antes de guardar, el sistema **reverifica los saldos dentro de la
  transacción**; si algo cambió, aborta y pide reintentar.
- **Doble protección en base de datos:** la base rechaza aplicaciones que
  excedan el saldo o el monto del pago, y hace las aplicaciones
  **inmutables** (no se editan ni borran; solo se corrigen anulando el pago
  completo).

### 5.5 Anulaciones y correcciones

- Los pagos **nunca se borran**: se **anulan** con motivo, fecha y usuario
  responsable. Al anular, los saldos de las obligaciones se restauran
  automáticamente.
- Solo se pueden editar la **referencia** y la **observación** de un pago.
- Todo movimiento financiero queda en **auditoría** (quién, qué, cuándo, por
  qué): generación de cargos, pagos, anulaciones, ediciones, retiros y
  cambios de configuración.

> **Preguntas de validación**
> - [ ] ¿Aplicar el pago a la deuda **más antigua primero** coincide con la
>       política real de cobro?
> - [ ] ¿Es correcto **rechazar excedentes**, o la escuela a veces recibe
>       dinero por adelantado (saldo a favor)?
> - [ ] ¿Un acudiente puede pagar **por varios deportistas/hermanos** en un
>       solo pago? (hoy cada pago se imputa a un solo deportista)
> - [ ] ¿Se requiere **recibo o comprobante** para entregar al acudiente?
> - [ ] ¿Hacen falta más medios de pago o referencias específicas?

---

## 6. Retiro de deportistas

- El retiro marca al deportista como **inactivo** con una **fecha efectiva
  de retiro** (no puede ser futura ni anterior al ingreso).
- Después del retiro **no se generan nuevos cargos**, pero las deudas
  previas se conservan y siguen siendo exigibles.
- El retiro queda registrado en la auditoría.

> **Preguntas de validación**
> - [ ] Si un deportista se retira a mitad de mes, ¿ese mes se cobra completo
>       o debe ajustarse?
> - [ ] ¿Existen **pausas temporales** (lesiones, vacaciones, suspensiones)
>       que hoy no tienen representación en el sistema?
> - [ ] ¿Un deportista retirado puede **reingresar**? ¿Debe generarse una
>       nueva inscripción en ese caso?

---

## 7. Reportes y control

- **Saldos por deportista:** deuda = obligaciones activas − pagos aplicados.
- **Panel financiero:** recaudado del mes, pendiente total, número de
  deportistas con saldo.
- **Historial de pagos:** con deportista, conceptos, periodos, medio,
  referencia y estado.
- **Gastos:** módulo simple de egresos (fecha, descripción, monto).
- **Respaldo:** exportación de la base de datos en archivo cifrado.

---

## 8. Limitaciones actuales (declaradas)

| # | Limitación |
|---|---|
| 1 | Un solo usuario/dispositivo; sin sincronización multi-dispositivo. |
| 2 | No hay recibos ni comprobantes imprimibles/descargables. |
| 3 | No hay pasarela de pagos en línea; los pagos se registran manualmente. |
| 4 | No hay descuentos, becas ni exoneraciones. |
| 5 | No hay prorrateo del mes de ingreso ni del mes de retiro. |
| 6 | Los pagos se imputan por deportista individual, no por familia/acudiente. |
| 7 | La generación de mensualidades es manual, mes a mes. |
| 8 | No hay importación de saldos históricos iniciales. |
| 9 | No hay pausas/suspensiones temporales. |
| 10 | No hay reingreso con nueva inscripción. |

---

## 9. Posibles mejoras a futuro

Ordenadas por prioridad sugerida (P1 = mayor valor para operación diaria):

### P1 — Corto plazo

| Mejora | Valor para el cliente |
|---|---|
| **Recibo/comprobante de pago** (PDF o vista para compartir por WhatsApp) | Respaldo formal para el acudiente; profesionaliza el cobro. |
| **Cuenta corriente por deportista** (estado de cuenta detallado: deudas, pagos, saldo) | Consulta rápida ante reclamos; transparencia. |
| **Pago familiar** (un solo pago aplicado a varios deportistas del mismo acudiente) | Refleja cómo pagan realmente las familias con varios hijos. |
| **Restauración de respaldo** (hoy solo existe exportación) | Continuidad del negocio ante pérdida/cambio de dispositivo. |
| **Recordatorio/lista de vencidos** con envío de mensaje por WhatsApp | Gestión activa de cartera morosa. |

### P2 — Mediano plazo

| Mejora | Valor para el cliente |
|---|---|
| **Descuentos y becas** (porcentaje o valor fijo sobre mensualidad/inscripción) | Cubre convenios, hermanos, casos sociales. |
| **Saldo a favor / pagos anticipados** | Permite recibir dinero por meses futuros. |
| **Pausas y suspensiones** (lesión, vacaciones) con suspensión de cargos | Modela la operación real de una escuela deportiva. |
| **Reingreso de deportistas** con nueva inscripción | Cubre el ciclo real de bajas y retornos. |
| **Saldos iniciales** para migrar cartera anterior a la app | Adopción sin perder deuda histórica. |
| **Varios usuarios con roles** (administrador vs. consulta) | Operación con más de una persona, con control. |
| **Otros conceptos de cobro** (uniformes, torneos, eventos) | Modelo general de obligaciones más allá de mensualidad. |

### P3 — Largo plazo

| Mejora | Valor para el cliente |
|---|---|
| **Generación automática programada de mensualidades** | Elimina la tarea manual mensual. |
| **Sincronización multi-dispositivo / nube** | Varios dispositivos, respaldo continuo, acceso remoto. |
| **Pasarela de pagos en línea** (PSE, tarjetas, billeteras) | Cobro sin presencia física. |
| **Notificaciones automáticas** de vencimiento | Reduce cartera morosa sin esfuerzo del operador. |
| **Exportación contable** (CSV/Excel) | Integración con contabilidad formal. |
| **Reportes avanzados** (asistencia, retención, proyección de ingresos) | Visión gerencial de la escuela. |

---

## 10. Decisiones pendientes de validación con el cliente

Resumen de los puntos abiertos que requieren respuesta para ajustar la
lógica:

| # | Decisión | Opciones |
|---|---|---|
| 1 | Cobro del mes de ingreso | Completo (actual) / prorrateado / mitad según quincena |
| 2 | Cobro del mes de retiro | Completo (actual) / no cobrar / prorrateado |
| 3 | Excedentes de pago | Rechazar (actual) / saldo a favor / aplicar a meses futuros |
| 4 | Cartera histórica | Empezar en cero (actual) / importar saldos iniciales |
| 5 | Recibos | No requeridos (actual) / parte del producto |
| 6 | Pago familiar | Por deportista (actual) / por acudiente |
| 7 | Pausas y vacaciones | No soportadas (actual) / suspender cargos |
| 8 | Operadores | Uno solo (actual) / varios con roles |
| 9 | Reingreso | No soportado (actual) / nueva inscripción por reingreso |
| 10 | Dispositivos | Uno solo (actual) / varios sincronizados |

---

## 11. Criterio de cierre del MVP

El producto está listo para operación real cuando:

- [ ] Las decisiones de la sección 10 estén respondidas por escrito.
- [ ] La generación de mensualidades valide: sin duplicados, sin cargos a
      retirados, sin cargos anteriores al inicio del control, con la tarifa
      correcta por periodo.
- [ ] El registro de pagos valide: pago completo → saldo cero; pago parcial →
      saldo restante; pago a varias obligaciones; rechazo de excedentes.
- [ ] La anulación de un pago restaure saldos sin borrar el registro.
- [ ] El flujo de inscripción cubra deportista nuevo (con cargo) y antiguo
      (sin cargo).
- [ ] El respaldo/restauración esté probado en el dispositivo real.
- [ ] Se valide el flujo completo en un dispositivo Android antes de producción.
