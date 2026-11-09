# Especificación técnica: licenciamiento offline de Sports School

**Estado:** propuesta para revisión; no autoriza cambios de base de datos ni despliegues.

- **Aplicación actual:** Ionic + Angular + Capacitor, SQLite local.
- **Backend en desarrollo:** NestJS + TypeORM + MySQL, en `backend/licensing-api/`, como proyecto independiente.
- **Objetivo:** controlar el acceso al servicio sin enviar al servidor los datos deportivos ni impedir que la escuela recupere su información.

---

## 1. Objetivo y alcance

La aplicación continuará trabajando con sus datos operativos en SQLite local. El
servidor administrará escuelas, licencias mensuales o permanentes, instalaciones,
pagos de licencia y la emisión de autorizaciones firmadas.

El servidor de licencias no recibirá deportistas, acudientes, mensualidades,
pagos locales, gastos ni respaldos. Los pagos del servidor son pagos de la
suscripción de Sports School; no son los pagos que la escuela registra para sus
deportistas.

El licenciamiento no debe:

- sincronizar ni modificar el contenido deportivo de SQLite;
- incluir credenciales o autorizaciones reutilizables en respaldos;
- borrar, cifrar ni inutilizar la base de datos local cuando una licencia venza;
- impedir la consulta histórica ni la recuperación de datos;
- depender de que Internet esté disponible en cada operación.

El control en una aplicación cliente dificulta la falsificación y el uso casual
no autorizado, pero no puede garantizar resistencia absoluta ante dispositivos
con root, instrumentación o una aplicación modificada.

## 2. Decisiones de negocio

| Regla | Suscripción mensual | Licencia permanente |
|---|---|---|
| Pago | Mensual | Pago único |
| Gracia | 10 días calendario | No aplica |
| Uso sin conexión | Máximo 30 días por autorización | Indefinido después de activar |
| Aviso de vencimiento/mora | Sí | No hay vencimiento comercial |
| Bloqueo por falta de pago | Al terminar la gracia | No aplica |
| Suspensión/revocación administrativa | Se aplica al validar online | Se aplica al validar online |

Para suscripciones, la autorización no añade días comerciales. El servidor
calcula:

```text
graceUntil = paidThrough + 10 días calendario
offlineUntil = min(graceUntil, issuedAt + 30 días)
```

`offlineUntil` es un límite de validación offline de la suscripción, no una
extensión del servicio. Si se alcanza antes de `graceUntil`, la app debe pedir
validación online; no debe clasificar automáticamente la suscripción como
comercialmente vencida. Una autorización permanente no lleva `exp`,
`paidThrough`, `graceUntil` ni `offlineUntil`.

### Decisiones confirmadas

| Decisión | Acordado |
|---|---|
| Plataforma con licenciamiento obligatorio | Android únicamente |
| Instalaciones activas por escuela | Una |
| Zona horaria de facturación | `America/Bogota` |
| Último día pagado | Inclusivo |
| Límite de acceso | Instante exclusivo; al alcanzarlo empieza el siguiente estado |
| Menú Home al bloquear | Las vistas operativas aparecen deshabilitadas (`disabled`) |
| Respaldo y restauración | Permitidos aun con licencia bloqueada; no incluyen ni transfieren la licencia |
| Escuelas existentes | No hay escuelas todavía; todas las instalaciones serán nuevas y no requieren migración de licencias |
| Tipos comerciales | Suscripción mensual o licencia permanente de pago único |
| Uso offline permanente | Indefinido después de la primera activación online |
| Actualizaciones del producto | Se venden aparte, manualmente; no son transacciones dentro de la app ni parte automática de la licencia |

### Semántica de fechas acordada

La semántica de fechas siguiente aplica solo a suscripciones. El último día del
periodo pagado está cubierto hasta el final de ese día en
`America/Bogota`. `paidThrough` es el instante exclusivo correspondiente al
inicio del día siguiente. La gracia comprende los 10 días calendario completos
posteriores al periodo pagado; `graceUntil` es el inicio local del día siguiente
al décimo día de gracia, convertido a UTC. `offlineUntil` se calcula como el
mínimo entre `graceUntil` y 30 días exactos después de `issuedAt`.

Ejemplo: si el último día pagado es el 1 de diciembre, `paidThrough` es el 2 de
diciembre a las 00:00 locales; la gracia cubre del 2 al 11 de diciembre
inclusive y `graceUntil` es el 12 de diciembre a las 00:00 locales. La mora se
advierte desde `paidThrough` y el aviso de vencimiento empieza cinco días
calendario antes. El servidor convierte estos límites a UTC; no debe sumar
simplemente `10 * 24` horas para calcular días de calendario.

### Decisiones de producto pendientes

- Procedimiento administrativo de transferencia al cambiar o reinstalar un
  teléfono, o al perder la clave. La escuela solo puede tener una instalación
  activa.
- Política para una transferencia cuando el teléfono anterior está offline:
  una licencia permanente sin expiración no puede revocarse en ese equipo hasta
  que vuelva a conectarse.
- Confirmar si la primera activación de una instalación nueva requiere Internet.
  La API propuesta asume activación online; el uso offline comienza después de
  recibir y verificar la primera licencia firmada.
- Confirmar desde qué ruta de recuperación se abrirán las consultas históricas
  de solo lectura, fuera de las tarjetas operativas deshabilitadas del Home.
  El estado de licencia y las opciones de respaldo/restauración deben seguir
  accesibles desde la pantalla de bloqueo.
- La versión de Node.js de producción y los orígenes CORS definitivos.

## 3. Arquitectura

El backend tendrá su propio `package.json`, configuración, dependencias,
pruebas y migraciones. Se mantendrá separado de `src/` (Ionic/Angular) y
`android/`:

```text
backend/
  licensing-api/
    src/
    test/
    package.json
```

```text
Panel administrativo Angular (proyecto separado)
                 |
                 | HTTPS, autenticación administrativa
                 v
API de licencias NestJS + TypeORM ----- MySQL
                 |
                 | HTTPS, prueba de posesión de clave
                 v
Sports School (Ionic + Angular + Capacitor)
       |                         |
       | SQLite local            | Almacenamiento de licencia/clave separado
       v                         v
Datos deportivos                 Android Keystore + estado local protegido
```

### Componentes móviles

Crear un módulo de licenciamiento separado, adaptando sus nombres a la
estructura existente:

```text
src/app/core/licensing/
  models/
  services/
    license-api.service.ts
    license-validator.service.ts
    license-clock.service.ts
    license-storage.service.ts
    license-access.service.ts
  guards/
  pages/
```

Responsabilidades:

- `LicenseApiService`: activación, renovación y validación por HTTPS.
- `LicenseValidatorService`: validar formato, firma, claims, producto y vínculo
  con la instalación.
- `LicenseClockService`: estimar tiempo confiable y detectar anomalías.
- `LicenseStorageService`: guardar autorización y estado sin incluirlos en
  SQLite ni en respaldos.
- `LicenseAccessService`: evaluar el estado y autorizar las operaciones locales.
- `LicenseGuard`: orientar la navegación; no sustituye el control de escrituras.

La inicialización de licencia debe terminar antes de permitir operaciones
protegidas. El ciclo de vida debe volver a validar al iniciar y al regresar la
app a primer plano; al recuperar conectividad debe intentar renovar. Un error
de red no invalida una autorización offline que todavía sea válida.

### Plataforma y almacenamiento

En Android, la clave privada por instalación se generará como no exportable en
Android Keystore mediante una integración nativa compatible con Capacitor. La
autorización firmada y el estado mínimo se guardarán en almacenamiento privado
protegido por una clave de Keystore; la licencia no se guarda en SQLite.

La identidad de instalación será aleatoria y estará ligada a la huella de la
clave pública. No usar IMEI, teléfono u otros identificadores sensibles. La
configuración de respaldo automático de Android debe impedir que la identidad,
la clave o el estado de autorización se transfieran. El token copiado a otro
dispositivo debe fallar la comprobación de vínculo con su clave.

La app actual permite ejecución web. Antes de exigir licencias allí, se debe
definir un mecanismo y una política específicos; no asumir que `Preferences` o
Web Crypto equivalen a Keystore o a almacenamiento no restaurable.

## 4. Formato y validación de licencia

El backend emite un JWS compacto. El encabezado protegido debe declarar
`alg: "EdDSA"` y un `kid` para identificar la clave pública. La clave privada
permanece en el servidor, idealmente en un gestor de secretos o HSM; nunca se
incluye en el APK, el repositorio o SQLite.

Claims mínimos propuestos:

| Claim | Significado |
|---|---|
| `iss` | Emisor de la API |
| `aud` | Identificador fijo de Sports School |
| `licenseId` | Licencia comercial en el servidor |
| `schoolId` | Identificador interno, sin datos deportivos |
| `installationId` | Instalación autorizada |
| `product` | `SPORTS_SCHOOL` |
| `licenseType` | `SUBSCRIPTION` o `PERPETUAL` |
| `status` | `ACTIVE`, `SUSPENDED` o `REVOKED` |
| `iat` | Emisión en UTC |
| `exp` | Solo suscripción: NumericDate igual a `offlineUntil`; ausente en permanente |
| `paidThrough` | Solo suscripción: límite exclusivo del periodo comercial, UTC |
| `graceUntil` | Solo suscripción: límite exclusivo de la gracia, UTC |
| `offlineUntil` | Solo suscripción: límite exclusivo de uso sin renovar, UTC |
| `licenseVersion` | Versión del esquema de claims |
| `revision` | Secuencia creciente para impedir retrocesos de estado |
| `jti` | Identificador único de la autorización |
| `cnf.jkt` | Huella de la clave pública de la instalación |

Se puede incluir un nonce firmado para vincular una respuesta de renovación a
un reto reciente. Los claims y límites son calculados por el servidor; el cliente
nunca puede extenderlos.

Tipos TypeScript contractuales propuestos:

```ts
export type SignedLicenseStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

interface SignedLicenseClaimsBase {
  iss: string;
  aud: 'SPORTS_SCHOOL';
  licenseId: string;
  schoolId: string;
  installationId: string;
  product: 'SPORTS_SCHOOL';
  status: SignedLicenseStatus;
  iat: number;
  licenseVersion: number;
  revision: number;
  jti: string;
  cnf: { jkt: string };
  requestNonce?: string;
}

export type SignedLicenseClaims = SignedLicenseClaimsBase & (
  | {
      licenseType: 'SUBSCRIPTION';
      exp: number;
      paidThrough: string;
      graceUntil: string;
      offlineUntil: string;
    }
  | {
      licenseType: 'PERPETUAL';
    }
);

export type LicenseState =
  | 'ACTIVATION_REQUIRED'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'VALIDATION_REQUIRED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'INVALID';

export interface DeviceChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: string;
}

export interface SignedLicenseResponse {
  licenseJws: string;
  requestId: string;
}
```

El cliente debe rechazar:

- firmas inválidas, `alg` inesperados, `kid` desconocidos o claims mal formados;
- emisor, audiencia, producto o instalación distintos a los esperados;
- una huella de clave que no corresponde a la clave de esta instalación;
- claims temporales ausentes/incoherentes para una suscripción;
- claims de expiración presentes en una licencia `PERPETUAL`;
- `exp` distinto de `offlineUntil` o evaluación de expiración de una
  suscripción basada en el reloj civil sin pasar por `LicenseClockService`;
- una revisión menor a la última revisión aceptada;
- estados firmados `SUSPENDED` o `REVOKED`.

La rotación de claves requiere compatibilidad explícita: distribuir la nueva
clave pública antes de firmar con ella, mantener un periodo de solapamiento y
no retirar una clave mientras existan versiones activas que solo la conozcan.

## 5. Estados y algoritmo de autorización

| Estado | Escrituras operativas | Consulta y exportación |
|---|---:|---:|
| `ACTIVATION_REQUIRED` | No | Sí |
| `ACTIVE` | Sí | Sí |
| `GRACE_PERIOD` | Sí, con advertencia | Sí |
| `VALIDATION_REQUIRED` | No hasta validar online | Sí |
| `EXPIRED` | No | Sí |
| `SUSPENDED` | No | Sí |
| `REVOKED` | No | Sí |
| `INVALID` | No | Sí |

Orden de evaluación:

1. Validar estructura, firma, producto, audiencia, instalación y huella de
   clave. Si falla, `INVALID`.
2. Si el claim firmado indica `SUSPENDED` o `REVOKED`, bloquear operaciones.
3. Si `licenseType = PERPETUAL` y el estado firmado es `ACTIVE`, permitir
   operaciones sin consultar la hora ni exigir renovación periódica.
4. Para `SUBSCRIPTION`, obtener una hora confiable. Si hay
   retroceso/anomalía no resuelta, `VALIDATION_REQUIRED`.
5. Si `now >= graceUntil`, `EXPIRED`.
6. Si `now >= offlineUntil`, solicitar validación. Si no hay red o falla la
   petición, `VALIDATION_REQUIRED`; si el servidor devuelve una nueva licencia,
   evaluar esa licencia.
7. Si `now >= paidThrough`, `GRACE_PERIOD`; en otro caso, `ACTIVE`.

Una decisión explícita de suspensión/revocación que llega del servidor debe
estar autenticada mediante HTTPS y, para persistencia offline, acompañada por
un estado JWS firmado con revisión creciente. Un timeout, HTTP 5xx o pérdida de
conexión no son decisiones de suspensión: se conserva el último JWS válido
hasta su límite offline.

Una licencia permanente que permanece desconectada no puede recibir una
suspensión o revocación nueva. Si se transfiere la instalación desde el panel
mientras el teléfono anterior sigue offline, el servidor impedirá nuevas
activaciones duplicadas, pero no podrá detener en ese teléfono el token
permanente que ya recibió. La clave por instalación impide copiar el token a
otro dispositivo, pero no resuelve la revocación de un equipo físico offline.

### Reloj

Guardar fuera de SQLite, en estado protegido y no restaurable:

```ts
interface LicenseClockState {
  lastServerTime: string;
  lastObservedWallTime: string;
  lastElapsedRealtimeMs: number;
  bootMarker?: string;
  highestLicenseRevision: number;
}
```

En la misma sesión de arranque se puede estimar el tiempo desde la última hora
firmada usando el reloj monotónico. El valor monotónico de Android se reinicia
al reiniciar el dispositivo; la hora civil no es una fuente absoluta de
confianza. Esta política temporal aplica a suscripciones: no bloquear únicamente
por un reinicio normal, pero si no se puede determinar si siguen vigentes,
exigir validación online antes de escrituras operativas. Una licencia permanente
no tiene vencimiento por reloj; los cambios de suspensión/revocación llegan al
dispositivo solo cuando se reconecta. Mantener disponible el acceso de solo
lectura y la recuperación de datos.

## 6. Contrato API propuesto

Prefijo: `/v1`. Todos los endpoints de dispositivo usan HTTPS y límites de
frecuencia. Los endpoints administrativos requieren autenticación, roles,
auditoría e idempotencia para registrar pagos.

### Dispositivo

| Método y ruta | Uso |
|---|---|
| `POST /v1/device-challenges` | Solicitar un reto de un solo uso para activar, renovar o desactivar |
| `POST /v1/installations/activate` | Canjear código de activación, registrar clave pública y activar instalación |
| `POST /v1/licenses/refresh` | Probar posesión de clave y solicitar estado/licencia actualizada |
| `POST /v1/installations/{id}/deactivate` | Solicitar desactivación firmada por la clave de esa instalación |

El reto debe expirar, ser de un solo uso y quedar ligado al propósito. La
activación exige un código creado por el panel, de un solo uso y con caducidad;
no acepta un `schoolId` arbitrario enviado por el cliente. La instalación firma
el reto con una clave ECDSA P-256 no exportable. El backend verifica la prueba
con la clave pública registrada y una serialización canónica compartida con el
cliente. Las licencias siguen firmándose con Ed25519.

Contratos mínimos de solicitud:

```ts
interface DeviceChallengeRequest {
  purpose: 'activation' | 'refresh' | 'deactivation';
  activationCode?: string;
  installationId?: string;
}

interface ActivateInstallationRequest {
  challengeId: string;
  installationPublicKeyJwk: JsonWebKey;
  proof: string;
  appVersion: string;
}

interface RefreshLicenseRequest {
  challengeId: string;
  installationId: string;
  currentRevision: number;
  appVersion: string;
  proof: string;
}

interface DeactivateInstallationRequest {
  challengeId: string;
  currentRevision: number;
  appVersion: string;
  proof: string;
}
```

`activationCode` se entrega a `POST /v1/device-challenges` y queda ligado al
reto; no se vuelve a enviar al activar. `proof` es una firma ECDSA P-256 en
formato IEEE P1363 sobre JSON UTF-8 canónico con las propiedades ordenadas
`appVersion`, `challengeId`, `currentRevision`, `installationId`, `nonce`,
`publicKeyThumbprint`, `purpose`; `purpose` se firma en mayúsculas y
`currentRevision` es `null` en activación.
No registrar códigos, proofs ni tokens completos en logs.

Activación y renovación devuelven un JWS; respuestas de suspensión o revocación
deben ser decisiones autenticadas y persistibles. No exponer una consulta
pública por `licenseId` que permita enumerar licencias.

### Administración

Rutas protegidas propuestas:

| Método y ruta | Uso |
|---|---|
| `POST /v1/admin/schools` | Crear escuela |
| `GET /v1/admin/schools` | Buscar/listar escuelas según rol |
| `POST /v1/admin/schools/{id}/activation-codes` | Emitir código de activación |
| `GET /v1/admin/schools/{id}/installations` | Consultar instalaciones y última validación |
| `POST /v1/admin/installations/{id}/suspend` | Suspender instalación |
| `POST /v1/admin/installations/{id}/reactivate` | Reactivar según estado de pagos |
| `POST /v1/admin/licenses/{id}/payments` | Registrar pago de suscripción o pago único permanente |
| `POST /v1/admin/licenses/{id}/suspend` | Suspender una licencia |
| `POST /v1/admin/licenses/{id}/reactivate` | Reactivar una licencia |
| `GET /v1/admin/licenses/{id}/events` | Consultar auditoría |

La creación de escuela recibe `licenseType`. Para `SUBSCRIPTION` exige
`paidThroughDate`; para `PERPETUAL` no admite fecha de vencimiento. La licencia
queda `PENDING_PAYMENT` hasta que el administrador registre el pago inicial; no
se debe emitir código de activación antes de ese pago.

```ts
interface CreateSchoolRequest {
  name: string;
  taxIdentifier?: string;
  licenseType: 'SUBSCRIPTION' | 'PERPETUAL';
  paidThroughDate?: string; // Requerido solo para SUBSCRIPTION
}

interface RecordLicensePaymentRequest {
  paymentType: 'SUBSCRIPTION_RENEWAL' | 'PERPETUAL_LICENSE';
  amountCop: number;
  currency: 'COP';
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';
  reference?: string;
  periodStartDate?: string; // Requeridas solo para SUBSCRIPTION_RENEWAL
  periodEndDate?: string;
}
```

La solicitud de pago incluye `paymentType`: `SUBSCRIPTION_RENEWAL` con fechas de
periodo, o `PERPETUAL_LICENSE` sin fechas de periodo. La venta de actualizaciones
futuras queda fuera de esta API y de las transacciones de la app. El alta de un
pago y la actualización de la licencia deben ser transaccionales en el servidor.
Nunca aceptar del móvil un pago como prueba de licencia pagada. Los errores
deben tener códigos estables, por ejemplo:
`ACTIVATION_CODE_INVALID`, `CHALLENGE_EXPIRED`, `INSTALLATION_REVOKED` y
`LICENSE_NOT_ACTIVE`.

## 7. Modelo lógico del servidor

Este modelo es una especificación, no un script ejecutable ni una autorización
para crear o modificar bases de datos.

| Tabla | Datos principales y reglas |
|---|---|
| `Schools` | Id, nombre, identificación/contacto mínimos, zona horaria, estado y fechas |
| `Licenses` | Id, escuela, `licenseType`, estado (`PENDING_PAYMENT` antes del primer pago), fecha comercial opcional, gracia/límite offline solo para suscripciones y revisión |
| `Installations` | Id, escuela/licencia, huella de clave pública única, estado, versión de app, activación, última validación y desactivación |
| `Payments` | Id, licencia, `paymentType`, valor entero, moneda, fecha, método/referencia, periodo opcional, actor e idempotency key |
| `LicenseIssuances` | JTI, licencia, instalación, tipo, `kid`, revisión, estado y límite offline opcional; no guardar clave privada |
| `LicenseEvents` | Id, escuela/licencia/instalación, actor, evento, fecha UTC y detalle administrativo mínimo |
| `DeviceChallenges` | Reto, propósito, caducidad, consumo y vínculo con activación/instalación; expiración y uso único |

Restricciones recomendadas: claves foráneas, índices por escuela/estado/fecha,
huella de clave única, código de activación almacenado como hash, y unicidad de
idempotencia por operación. Definir transacciones y borrado/retención de datos
administrativos antes del despliegue.

En `PERPETUAL`, `paid_through_date`, `grace_days` y `offline_days` son nulos. En
`SUBSCRIPTION`, la base exige el periodo pagado y los límites de 10/30 días. El
pago `PERPETUAL_LICENSE` es único y no tiene periodo de facturación.

La implementación usa NestJS con TypeORM sobre MySQL. Las migraciones son
versionadas, tienen `synchronize` y `migrationsRun` desactivados y no se aplican
automáticamente al arrancar la API. La migración inicial exige MySQL 8.0.16 o
posterior por sus restricciones `CHECK` y columnas generadas.

## 8. Control de escrituras y preservación de datos

Un guard de Angular solo mejora la navegación. Cada operación que cambia datos
debe pasar por un caso de uso/repositorio que consulte `LicenseAccessService`
antes de abrir su transacción SQLite. No dejar que páginas con acceso directo a
`SQLiteDBConnection` puedan omitir el control.

Clasificar explícitamente operaciones:

- **Operativas, bloqueadas sin autorización:** deportistas, acudientes,
  categorías, tarifas, mensualidades, pagos locales, gastos y configuración
  operativa.
- **Protección de datos, permitidas:** consultar información histórica,
  consultar el estado de licencia, exportar y restaurar respaldos.
- **Acceso necesario para recuperación:** iniciar sesión, mostrar activación,
  validar/renovar y ofrecer ayuda. El alta del usuario local inicial no debe
  dejar la app en un callejón sin salida.

Cuando la licencia bloquee operaciones, las tarjetas del Home que abren vistas
operativas deben mostrarse deshabilitadas y no navegar. No basta con aplicar un
estilo visual: las escrituras también se deniegan en los casos de uso. La
pantalla de licencia y las opciones de respaldo/restauración se mantienen
accesibles desde una ruta de recuperación. Las consultas históricas de solo
lectura permanecen permitidas y deben tener un acceso que no dependa de las
tarjetas operativas deshabilitadas; la ruta de ese acceso queda pendiente.

La licencia y la identidad de instalación no se incluyen en el dump de SQLite,
ni en los archivos de respaldo, ni en el historial restaurable. Restaurar una
base de otro teléfono nunca transfiere la autorización. No almacenar la clave
privada ni secretos del servidor en SQLite, `Preferences` sin protección, ni en
la configuración de Angular.

## 9. Fases de implementación

### Fase 0 — Decisiones y especificación

- Incorporar las decisiones ya confirmadas: Android, una instalación activa,
  límites de fechas en `America/Bogota`, menú operativo deshabilitado y respaldo
  disponible.
- Cerrar el flujo de transferencia de teléfono, el requisito de conexión para
  la activación inicial y la ruta de acceso a consultas históricas de solo
  lectura.
- Aprobar estados, API, claims JWS, política ante anomalías y matriz de
  operaciones protegidas.

**Salida:** contrato revisado y escenarios de aceptación aprobados.

### Fase 1 — Preparación de la app local

- Centralizar operaciones de escritura en repositorios/casos de uso.
- Definir política común de autorización y separar rutas operativas de
  consulta/respaldo.
- Hacer que el arranque espere la inicialización necesaria de licencia y base.
- Revisar reglas de backup automático de Android para credenciales/identidad.

**Salida:** comportamiento actual conservado y pruebas que demuestren que las
escrituras pasan por un punto controlado.

### Fase 2 — Backend NestJS mínimo

- Crear proyecto NestJS + TypeORM, migraciones versionadas de MySQL, autenticación
  administrativa y auditoría.
- Mantener `synchronize: false` y `migrationsRun: false`; ejecutar migraciones únicamente como una
  operación explícita y autorizada.
- Implementar pagos manuales idempotentes, estados, códigos de activación y
  emisión JWS Ed25519 con clave protegida.
- Crear un panel mínimo de escuelas, instalaciones, pagos, renovación y
  suspensión.

**Salida:** flujo servidor probado sin recibir datos deportivos.

### Fase 3 — Núcleo móvil

- Integrar generación y uso de clave no exportable, almacenamiento protegido y
  vínculo de token a clave.
- Implementar verificador JWS, reloj, almacenamiento de revisión y sincronización
  de primer plano/conectividad.
- Implementar pruebas unitarias de reglas de fechas y estados.

**Salida:** licencia local verificable, sin aplicar todavía bloqueo comercial.

### Fase 4 — Integración y lanzamiento

- Integrar activación, renovación y estado bloqueado/solo lectura.
- Conservar acceso a historial y respaldo; verificar que restaurar datos no
  modifica la identidad de licencia.
- Probar el flujo completo de escuela e instalación nuevas en staging; al
  publicar, activar el control de licencia para cada nueva instalación.
- No hay cohortes heredadas ni migración de licencias existentes. Cada escuela
  se registra en el panel y activa una instalación nueva con su código único.

**Salida:** lanzamiento con procedimiento de soporte y recuperación.

## 10. Criterios de aceptación

- Una licencia `SUBSCRIPTION` funciona sin red hasta `offlineUntil`, pero nunca
  más allá de `graceUntil`.
- Una licencia `PERPETUAL` activa, con firma e instalación válidas, no tiene
  vencimiento comercial ni requiere renovación periódica; su JWS omite `exp`.
- Suspender o revocar una licencia permanente solo puede bloquear un dispositivo
  cuando reciba online la decisión firmada del servidor.
- Un pago `PERPETUAL_LICENSE` es único, no tiene periodo de facturación y no
  genera `paidThrough`, gracia ni límite offline.
- Una instalación nueva queda vinculada a una única escuela y a una clave propia;
  el código de activación no se puede reutilizar para registrar otra instalación.
- Si se alcanza `offlineUntil` antes de `graceUntil` en una suscripción, se
  solicita validación; un fallo de red no extiende el límite.
- Al alcanzar `paidThrough` de una suscripción, se muestra mora; la gracia
  permite operar hasta su límite exclusivo.
- La suspensión/revocación recibida online se aplica inmediatamente y persiste
  al reiniciar.
- Las actualizaciones de la aplicación no se habilitan ni se cobran desde esta
  API; su venta es manual y separada del derecho de uso permanente.
- Una respuesta de red fallida no equivale a suspensión.
- Firma inválida, producto incorrecto, otra instalación o clave distinta no
  habilitan operaciones.
- En suscripciones, retroceso de reloj/anomalía requiere conexión para
  operaciones protegidas; no bloquea por sí solo lectura/exportación. No aplica
  como vencimiento a licencias permanentes.
- Cada escritura operativa queda denegada por la capa de casos de uso cuando
  corresponde, incluso si se invoca sin navegar por la interfaz.
- Al vencer una licencia, los datos existentes siguen consultables y
  exportables; ningún dato deportivo se envía al servidor.
- Con una licencia bloqueada, las vistas operativas del Home aparecen
  deshabilitadas, las consultas históricas permanecen accesibles desde una ruta
  de solo lectura y la pantalla de licencia y los respaldos siguen disponibles.
- Restaurar un respaldo no cambia `installationId`, clave, revisión ni JWS.
- Los pagos de licencia (renovación mensual o compra permanente) son
  idempotentes y no se confunden con los pagos locales de deportistas.

## 11. Plan de pruebas

### Unitarias móviles

- Límites exactos de `paidThrough`, `graceUntil` y `offlineUntil`.
- Licencia permanente sin claims temporales y estado activo tras periodos largos
  sin conectividad.
- Periodos que cruzan mes/año, año bisiesto y conversión de zona horaria.
- Gracia y límite offline calculados por el servidor; ningún cliente los amplía.
- Firma válida, firma alterada, `kid` desconocido, claims ausentes, producto,
  instalación, huella y revisión incorrectos.
- Estados `ACTIVE`, `GRACE_PERIOD`, `VALIDATION_REQUIRED`, `EXPIRED`,
  `SUSPENDED`, `REVOKED` e `INVALID`.
- Reloj atrasado, adelantado, continuidad monotónica, reinicio y estado
  protegido ausente.

### Backend/API

- Activación válida, código expirado/reutilizado y prueba de clave incorrecta.
- Renovación con reto vencido, replay, instalación desactivada y suscripción
  suspendida.
- Pago duplicado, concurrencia y transacción fallida.
- Rotación de claves y respuesta firmada de suspensión/revocación.
- Autorización/roles del panel, rate limits y ausencia de endpoints que enumeren
  licencias por identificador.

### Integración Android

- Arranque offline, suspensión de app y regreso a primer plano.
- Pérdida y recuperación de conectividad, timeout, HTTP 5xx y respuesta
  administrativa de suspensión.
- Cambio de fecha/hora, reinicio normal, reinstalación y cambio de teléfono.
- Restauración de respaldo entre dos instalaciones y preservación del bloqueo
  de copia de licencia.
- Acceso a datos y exportación con licencia expirada/suspendida.
- Escrituras directas a todos los flujos operativos, no solo navegación.

## 12. Riesgos y controles

| Riesgo | Control |
|---|---|
| Clonación de respaldo a otro dispositivo | Vincular JWS a huella de clave Keystore no exportable; excluir identidad de backup automático |
| Manipulación del reloj offline | Reloj monotónico durante el mismo arranque, detección de retrocesos y validación requerida al no poder confiar en el tiempo |
| Revocación durante desconexión | Suscripción: acotar la ventana offline; permanente: solo aplica al reconectar, sin garantía de bloqueo offline |
| Transferencia de una licencia permanente con el equipo anterior offline | La licencia anterior puede seguir operando; la clave impide copiarla, no detener el equipo desconectado |
| Bypass por guard/UI | Comprobar la política en cada caso de uso de escritura |
| Compromiso de clave privada de firma | Gestor de secretos/HSM, rotación, auditoría y acceso mínimo |
| Fallo de alta de una instalación nueva | Probar activación y recuperación en staging antes de habilitar licencias para clientes |
| Incompatibilidad de Ed25519 en WebView | Definir versiones Android soportadas y probar biblioteca/implementación nativa antes de elegir |
| HTTP en compilación Android | Exigir HTTPS y eliminar permiso de tráfico cleartext en configuración de producción |

## 13. Estado del proyecto y límites

La aplicación conserva SQLite local y respaldo cifrado. El backend NestJS está
en desarrollo en `backend/licensing-api/`; aún no tiene un panel Angular
administrativo ni está configurado contra una instancia MySQL real. La
migración TypeORM está versionada pero no se ha aplicado. La app móvil todavía
no tiene almacenamiento de claves de instalación ni una capa central para
todas las escrituras; no asumir que agregar un guard completa el licenciamiento.

Esta especificación no ejecuta cambios de esquema, SQL, despliegues ni
operaciones sobre datos de clientes. Cualquier DDL o cambio de producción
requiere su revisión y autorización específica antes de ejecutarse.
