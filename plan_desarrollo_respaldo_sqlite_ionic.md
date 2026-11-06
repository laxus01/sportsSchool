# Plan de desarrollo: respaldo y restauración SQLite

**Proyecto:** Aplicación Ionic\
**Plataforma objetivo:** Android\
**Stack:** Ionic + Angular + Capacitor\
**Persistencia:** `@capacitor-community/sqlite`\
**Modalidad:** Respaldo manual\
**Objetivo:** entregar a un agente de IA una guía de implementación
segura, verificable y adaptable a la arquitectura real del proyecto.

------------------------------------------------------------------------

## 1. Objetivo funcional

Implementar un módulo independiente que permita:

1.  Generar una copia completa de la base de datos SQLite local.
2.  Empaquetar el respaldo en un archivo portable.
3.  Guardarlo temporalmente en el dispositivo.
4.  Compartirlo mediante el menú nativo de Android: WhatsApp, correo,
    Drive u otras aplicaciones disponibles.
5.  Seleccionar un respaldo recibido desde otro dispositivo.
6.  Validar formato, aplicación de origen, versión, integridad y
    contraseña.
7.  Restaurar la información completa.
8.  Crear una copia preventiva antes de reemplazar la base de datos.
9.  Recuperar la base anterior si la restauración falla.

La funcionalidad debe operar sin conexión a Internet. El envío depende
de la aplicación de destino y de la conectividad que esta requiera.

## 2. Alcance

### Incluido en esta entrega

-   Respaldo manual completo.
-   Exportación mediante los mecanismos compatibles con la versión
    instalada de `@capacitor-community/sqlite`.
-   Metadatos y versionado del formato.
-   Empaquetado ZIP.
-   Cifrado autenticado.
-   Hash de integridad.
-   Almacenamiento temporal.
-   Compartición mediante Capacitor Share.
-   Selección e importación de archivos externos.
-   Validación previa a la restauración.
-   Respaldo preventivo y recuperación ante fallos.
-   Pantalla de respaldo y recuperación.
-   Historial local de operaciones.
-   Pruebas en dispositivos Android reales.

### Fuera de alcance

-   Respaldos automáticos o programados.
-   Sincronización con servidores.
-   Copias automáticas en la nube.
-   Restauración selectiva de tablas.
-   Respaldos incrementales.
-   Compatibilidad iOS o Web en esta primera entrega.

## 3. Reglas de trabajo para el agente

**No comenzar modificando código.** Primero inspeccionar el proyecto y
entregar un diagnóstico.

El agente debe:

-   Respetar la arquitectura, convenciones y diseño actuales.
-   Reutilizar el servicio de conexión SQLite existente.
-   No crear una segunda instancia de conexión sin controlar su ciclo de
    vida.
-   No cambiar nombres de bases de datos, tablas ni esquemas para
    facilitar el respaldo.
-   No actualizar Ionic, Angular, Capacitor o SQLite sin una
    justificación y aprobación explícitas.
-   Verificar la API real de las versiones instaladas; no inventar
    métodos ni parámetros.
-   No asumir que copiar directamente el archivo `.db` es seguro,
    especialmente si SQLite usa WAL.
-   No ejecutar una restauración mientras existan escrituras u
    operaciones pendientes.
-   No declarar éxito hasta completar las verificaciones posteriores.
-   No registrar contraseñas, claves ni contenido sensible en logs.
-   Implementar por fases pequeñas, compilables y verificables.

## 4. Fase 1: diagnóstico técnico obligatorio

Inspeccionar y documentar:

1.  Versiones exactas de Ionic, Angular y Capacitor.
2.  Versión instalada de `@capacitor-community/sqlite`.
3.  Plugins de Filesystem y Share instalados, si existen.
4.  Nombre real de la base de datos y configuración de conexión.
5.  Servicio o servicios que administran las conexiones SQLite.
6.  Forma en que se inicializa la base de datos.
7.  Versión actual del esquema y estrategia de migraciones.
8.  Tablas, relaciones, claves foráneas, índices, vistas y triggers.
9.  Uso de transacciones, conexiones abiertas y operaciones asíncronas.
10. Uso de WAL u otras opciones de SQLite.
11. Archivos externos que formen parte de los datos de usuario y deban
    incluirse.
12. Ubicación y estrategia de navegación adecuadas para incorporar la
    pantalla.

### Verificación de la API SQLite

Consultar la documentación y los tipos correspondientes a la versión
instalada. Evaluar especialmente:

-   `exportToJson()` en modo completo (`full`).
-   `isJsonValid()`.
-   `importFromJson()`.
-   `closeConnection()`.
-   `createConnection()`.
-   `retrieveConnection()`.
-   `isConnection()`.

Los nombres anteriores son puntos de comprobación, no una garantía de
que todas las firmas estén disponibles en la versión del proyecto.

Confirmar cómo se exportan e importan índices, relaciones, vistas,
triggers y datos. Identificar las limitaciones del formato JSON del
plugin.

**Entregable de la fase:** diagnóstico, riesgos, estrategia concreta de
exportación/restauración, dependencias necesarias y plan de ejecución.
Esperar aprobación antes de realizar cambios.

## 5. Arquitectura propuesta

Adaptar esta estructura a la organización existente; no duplicar
carpetas o servicios si ya hay equivalentes.

``` text
src/app/
├── core/
│   └── services/
│       └── backup/
│           ├── backup.service.ts
│           ├── restore.service.ts
│           ├── backup-share.service.ts
│           ├── backup-file.service.ts
│           ├── backup-validation.service.ts
│           ├── backup-crypto.service.ts
│           ├── backup-history.service.ts
│           ├── models/
│           │   ├── backup-manifest.model.ts
│           │   ├── backup-result.model.ts
│           │   ├── restore-result.model.ts
│           │   └── backup-history.model.ts
│           └── interfaces/
│               └── backup.interface.ts
└── pages/
    └── backup/
        ├── backup.page.ts
        ├── backup.page.html
        ├── backup.page.scss
        └── backup-routing.module.ts
```

### Responsabilidades

  Servicio                    Responsabilidad
  --------------------------- ----------------------------------------
  `BackupService`             Orquestar la generación del respaldo
  `RestoreService`            Orquestar restauración y rollback
  `BackupShareService`        Compartir el archivo mediante Android
  `BackupFileService`         Leer, escribir y administrar archivos
  `BackupValidationService`   Validar formato, metadatos y contenido
  `BackupCryptoService`       Cifrar y descifrar
  `BackupHistoryService`      Registrar operaciones

Todos los servicios deben reutilizar el administrador SQLite existente y
coordinarse para impedir operaciones simultáneas incompatibles.

## 6. Dependencias a evaluar

No instalar paquetes hasta completar el diagnóstico de versiones y
compatibilidad.

  -----------------------------------------------------------------------
  Dependencia                         Uso
  ----------------------------------- -----------------------------------
  `@capacitor-community/sqlite`       Exportar e importar SQLite

  `@capacitor/filesystem`             Leer y escribir archivos

  `@capacitor/share`                  Abrir el menú nativo para compartir

  Selector de archivos compatible con Seleccionar respaldos recibidos
  Capacitor                           

  Librería ZIP mantenida y compatible Empaquetar y extraer
  con WebView                         

  Implementación criptográfica        Cifrado autenticado
  mantenida                           
  -----------------------------------------------------------------------

Preferir APIs nativas o plugins mantenidos cuando sean necesarios para
evitar problemas de memoria, URI, permisos o acceso a archivos en
Android.

No solicitar permisos generales de almacenamiento si el selector del
sistema y las URI compartidas permiten evitarlo.

## 7. Formato del archivo de respaldo

Nombre sugerido:

``` text
SportsSchool_Backup_YYYYMMDD_HHmm.zip
```

Estructura lógica sugerida:

``` text
SportsSchool_Backup.zip
├── manifest.json
├── database/
│   └── database.json.enc
└── integrity/
    └── checksum.sha256
```

Si el proyecto necesita respaldar archivos asociados a registros,
incorporarlos en una carpeta `attachments/` y documentar cómo se
conservan sus referencias.

### Manifiesto ilustrativo

``` json
{
  "application": "Sports School",
  "backupFormatVersion": 1,
  "applicationVersion": "1.0.0",
  "databaseVersion": 1,
  "createdAt": "2026-11-06T14:15:00.000Z",
  "database": "sports_school",
  "format": "json",
  "compression": "zip",
  "encryption": {
    "algorithm": "AES-256-GCM",
    "enabled": true,
    "kdf": "PBKDF2-HMAC-SHA256",
    "salt": "BASE64",
    "iterations": 600000,
    "nonce": "BASE64"
  },
  "integrity": {
    "algorithm": "SHA-256",
    "checksum": "HEX"
  }
}
```

Los valores son ilustrativos. Obtener las versiones reales desde el
proyecto. Definir formalmente qué bytes cubre el checksum y en qué
momento se calcula; la validación de autenticidad del cifrado AES-GCM es
obligatoria además del checksum.

### Seguridad criptográfica

-   Utilizar cifrado autenticado AES-256-GCM mediante una implementación
    mantenida.
-   Derivar la clave desde una contraseña de respaldo con
    PBKDF2-HMAC-SHA256 y salt aleatorio, o justificar una alternativa
    segura compatible.
-   Usar nonce único y aleatorio por cifrado.
-   Guardar salt, nonce y parámetros necesarios en el manifiesto.
-   No incluir contraseña ni clave en el ZIP.
-   Solicitar la contraseña al restaurar.
-   No almacenar la contraseña en Preferences ni en logs.
-   Definir límites razonables de iteraciones, tamaño y tiempo de
    procesamiento.
-   Mostrar errores de contraseña o autenticación sin revelar datos
    internos.

Si se decide ofrecer una clave administrada por Android Keystore,
documentar cómo se exporta y restaura en otro dispositivo. Una clave
ligada exclusivamente al dispositivo no sirve para un respaldo portable.
Para esta primera versión, la contraseña de respaldo debe permitir
restaurar en otro teléfono.

## 8. Fase 2: generación del respaldo

Implementar `BackupService`.

### Flujo

1.  Confirmar que SQLite esté inicializado y disponible.
2.  Adquirir un bloqueo de operación para evitar respaldo/restauración
    simultáneos.
3.  Esperar a que terminen las escrituras en curso.
4.  Consultar la versión real del esquema.
5.  Exportar la base de datos completa usando el mecanismo compatible
    del plugin.
6.  Validar el JSON exportado con la API disponible.
7.  Serializar el contenido de manera determinista cuando sea necesario
    para el checksum.
8.  Generar metadatos.
9.  Cifrar el contenido.
10. Calcular el hash conforme al esquema definido.
11. Crear el ZIP.
12. Validar estructura, tamaños y contenido del paquete.
13. Guardar el archivo temporal.
14. Registrar el resultado.
15. Liberar el bloqueo en un bloque `finally`.

### Reglas

-   No modificar datos durante la exportación.
-   No eliminar datos de la base.
-   No declarar éxito si falla cualquier validación.
-   Gestionar errores de espacio y memoria.
-   No dejar archivos temporales huérfanos.
-   Evaluar el consumo de memoria con bases de datos representativas.

## 9. Fase 3: compartir el respaldo

Implementar `BackupShareService` utilizando `@capacitor/share`.

### Flujo

1.  Obtener la URI o ruta del archivo generado.
2.  Comprobar que el archivo existe y tiene contenido.
3.  Preparar una URI compartible compatible con Android.
4.  Invocar el menú nativo de compartir.
5.  Permitir al usuario seleccionar WhatsApp, correo, Drive u otra
    aplicación.
6.  Tratar la cancelación como una acción normal, no como un fallo de
    generación.
7.  Registrar el resultado sin afirmar que el destinatario recibió el
    archivo.

### Reglas Android

-   Utilizar el mecanismo de URI compartible/FileProvider que soporte el
    plugin.
-   Verificar MIME type `application/zip`.
-   No compartir rutas privadas directamente.
-   No implementar SMTP ni integración directa con WhatsApp.
-   No borrar el archivo mientras la aplicación de destino pueda estar
    utilizándolo.
-   Explicar que el envío depende de la aplicación seleccionada y de la
    conectividad correspondiente.

## 10. Fase 4: importación y validación del archivo

Implementar `BackupFileService` y `BackupValidationService`.

### Flujo

1.  Abrir selector de archivos Android.
2.  Filtrar por ZIP cuando el selector lo permita.
3.  Leer el archivo mediante la URI entregada por Android.
4.  Comprobar tamaño máximo configurable.
5.  Inspeccionar entradas del ZIP antes de extraer.
6.  Rechazar rutas absolutas, `../`, nombres duplicados y entradas
    inesperadas.
7.  Limitar cantidad de entradas y tamaño descomprimido para prevenir
    ZIP bombs.
8.  Leer y validar `manifest.json`.
9.  Comprobar aplicación de origen.
10. Comprobar `backupFormatVersion`.
11. Solicitar contraseña.
12. Verificar checksum según el esquema definido.
13. Descifrar y validar autenticidad AES-GCM.
14. Validar JSON con el plugin SQLite.
15. Comprobar compatibilidad de esquema.
16. Mostrar resumen del respaldo y solicitar confirmación.

### Rechazar el archivo si

-   No es un ZIP válido.
-   Falta el manifiesto o el archivo de base de datos.
-   Pertenece a otra aplicación.
-   Tiene una versión de formato desconocida.
-   El checksum no coincide.
-   La contraseña es incorrecta o falla la autenticación.
-   El JSON no es válido.
-   La versión de esquema no es compatible.
-   Excede límites configurados.
-   Contiene rutas o entradas sospechosas.

No extraer archivos usando directamente rutas suministradas por el ZIP.

## 11. Fase 5: restauración segura

Implementar `RestoreService`.

Esta fase tiene la máxima prioridad de seguridad.

### Flujo de restauración

1.  Recibir únicamente un respaldo que haya superado todas las
    validaciones.
2.  Mostrar al usuario la fecha y origen del respaldo.
3.  Advertir que los datos actuales serán reemplazados.
4.  Solicitar confirmación explícita.
5.  Adquirir bloqueo global de operaciones de base de datos.
6.  Esperar a que finalicen las operaciones pendientes.
7.  Generar una copia preventiva completa de la base actual.
8.  Validar que la copia preventiva se pueda restaurar.
9.  Cerrar correctamente la conexión SQLite.
10. Ejecutar la importación mediante la API real del plugin, en modo
    completo.
11. Aplicar la estrategia de reemplazo compatible con la versión
    instalada.
12. Reconectar la base de datos usando el servicio central existente.
13. Ejecutar `PRAGMA integrity_check` y las comprobaciones de claves
    foráneas que correspondan.
14. Verificar tablas y registros esenciales.
15. Verificar que los servicios de la aplicación puedan consultar los
    datos.
16. Actualizar el estado de la aplicación y sus proveedores de datos.
17. Registrar el resultado.
18. Liberar bloqueos y recursos.

### Recuperación ante errores (rollback)

Si cualquier paso posterior al inicio del reemplazo falla:

1.  No informar que la restauración fue exitosa.
2.  Cerrar conexiones incompletas.
3.  Restaurar la copia preventiva mediante un procedimiento probado.
4.  Reconectar SQLite.
5.  Ejecutar verificaciones de integridad.
6.  Confirmar que la base anterior vuelve a estar operativa.
7.  Informar si el rollback tuvo éxito.
8.  Si también falla el rollback, conservar el archivo preventivo y
    mostrar instrucciones claras para recuperación asistida.

No asumir que `importFromJson()` es una única transacción atómica.
Verificar el comportamiento de la versión instalada y diseñar el
rollback en consecuencia.

### Compatibilidad de versiones

-   Mismo esquema: permitir restauración si las demás validaciones
    pasan.
-   Esquema anterior: permitir únicamente si existe una migración
    explícita, probada y reversible cuando sea posible.
-   Esquema posterior al soportado por la app: rechazar.
-   Formato desconocido: rechazar.
-   No confundir versión de aplicación, versión de esquema y versión del
    formato de respaldo.

## 12. Fase 6: interfaz de usuario

Crear una pantalla **Respaldo y recuperación**, integrada con la
navegación y el sistema visual existente.

### Sección: Crear respaldo

-   Descripción breve.
-   Botón "Crear respaldo".
-   Indicador de progreso.
-   Resultado y ubicación/nombre del archivo.

### Sección: Compartir respaldo

-   Último respaldo disponible.
-   Fecha y tamaño.
-   Botón "Compartir respaldo".
-   Deshabilitar si no hay archivo válido disponible.

### Sección: Restaurar respaldo

-   Botón "Seleccionar archivo".
-   Nombre y metadatos del archivo seleccionado.
-   Fecha y versión de origen.
-   Solicitud de contraseña.
-   Advertencia de reemplazo.
-   Confirmación explícita.

### Sección: Historial

-   Fecha y hora.
-   Tipo: respaldo o restauración.
-   Nombre de archivo.
-   Resultado.
-   Mensaje de error comprensible.

Utilizar componentes Ionic existentes (`ion-card`, `ion-button`,
`ion-icon`, `ion-progress-bar`, `ion-alert`, `ion-list`, `ion-item`) y
respetar los patrones del proyecto. No rediseñar otras pantallas.

## 13. Modelos sugeridos

Adaptar nombres y campos al estándar del proyecto.

``` typescript
export interface BackupManifest {
  application: string;
  backupFormatVersion: number;
  applicationVersion: string;
  databaseVersion: number;
  createdAt: string;
  database: string;
  format: string;
  compression: string;
  encryption: {
    algorithm: string;
    enabled: boolean;
    kdf: string;
    salt: string;
    iterations: number;
    nonce: string;
  };
  integrity: {
    algorithm: string;
    checksum: string;
  };
}

export interface BackupResult {
  success: boolean;
  fileName?: string;
  filePath?: string;
  size?: number;
  createdAt?: string;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredAt?: string;
  databaseVersion?: number;
  rollbackPerformed?: boolean;
  error?: string;
}

export interface BackupHistory {
  id: string;
  type: 'backup' | 'restore';
  fileName: string;
  date: string;
  size?: number;
  status: 'success' | 'error';
  message?: string;
}
```

El manifiesto debe reflejar exactamente el formato final. No incluir
campos criptográficos opcionales como obligatorios si no se utilizan, ni
aceptar parámetros criptográficos arbitrarios sin validación.

## 14. Historial

Guardar un historial pequeño e independiente de la base de datos que se
restaura. Capacitor Preferences puede evaluarse para este uso.

Registrar:

-   ID de operación.
-   Fecha.
-   Tipo de operación.
-   Nombre del archivo.
-   Tamaño cuando aplique.
-   Resultado.
-   Mensaje de error seguro.

No registrar contraseñas, claves, datos personales ni contenido de la
base. Definir un límite de entradas y una política de limpieza.

## 15. Pruebas obligatorias

### Generación

-   Base con datos.
-   Base vacía.
-   Exportación completa.
-   Validación del JSON.
-   Manifiesto correcto.
-   Cifrado y descifrado.
-   Checksum correcto e incorrecto.
-   Base de tamaño representativo.
-   Espacio insuficiente.

### Compartición

-   Compartir por WhatsApp.
-   Compartir por correo.
-   Compartir por otra aplicación.
-   Cancelar el menú.
-   Confirmar que el archivo recibido puede importarse.
-   Verificar que cancelar no elimine el respaldo.

### Importación

-   Archivo válido.
-   ZIP corrupto o incompleto.
-   Manifiesto ausente o malformado.
-   Aplicación de origen diferente.
-   Contraseña incorrecta.
-   Checksum incorrecto.
-   Formato incompatible.
-   Esquema posterior.
-   Archivo excesivo.
-   ZIP con rutas maliciosas o expansión excesiva.

### Restauración

-   Restaurar en el mismo dispositivo.
-   Restaurar en otro dispositivo Android.
-   Restaurar con base actual vacía.
-   Restaurar con base actual poblada.
-   Comparar conteos y datos representativos.
-   Verificar claves foráneas.
-   Verificar índices, vistas y triggers.
-   Simular fallo durante importación.
-   Verificar rollback.
-   Verificar reconexión y consultas posteriores.
-   Confirmar que no queden operaciones SQLite bloqueadas.

Las pruebas de intercambio entre dispositivos deben utilizar
instalaciones limpias y dispositivos o emuladores distintos.

## 16. Criterios de aceptación

-   [ ] El usuario genera un respaldo completo sin Internet.
-   [ ] El archivo tiene formato portable y versionado.
-   [ ] El contenido está cifrado.
-   [ ] El checksum y la autenticidad se validan.
-   [ ] El usuario puede compartirlo por WhatsApp.
-   [ ] El usuario puede compartirlo por correo.
-   [ ] El usuario puede importar un archivo externo.
-   [ ] El usuario puede restaurar en otro dispositivo Android.
-   [ ] Se conservan los datos y objetos SQLite incluidos en el formato
    soportado.
-   [ ] Los archivos inválidos se rechazan antes de modificar la base.
-   [ ] Las versiones incompatibles se rechazan.
-   [ ] Se genera y valida un respaldo preventivo.
-   [ ] Un fallo de restauración permite recuperar la base anterior.
-   [ ] El historial registra las operaciones.
-   [ ] Las funcionalidades existentes siguen funcionando.
-   [ ] La aplicación compila y el APK se prueba en Android real.

## 17. Entregas de implementación

### Entrega 1 --- Diagnóstico

Inventario técnico, API disponible, riesgos, estrategia de
exportación/importación y dependencias. Requiere aprobación.

### Entrega 2 --- Exportación

Implementar exportación completa y validación del resultado. Pruebas
unitarias o de servicio.

### Entrega 3 --- Paquete y seguridad

Implementar manifiesto, cifrado, checksum, ZIP y validación del paquete.

### Entrega 4 --- Compartición

Integrar Capacitor Share y probar transferencia por WhatsApp y correo.

### Entrega 5 --- Importación y restauración

Selector de archivos, validación, respaldo preventivo, restauración y
rollback. No avanzar sin pruebas de recuperación.

### Entrega 6 --- Interfaz e integración

Pantalla, progreso, confirmaciones e historial.

### Entrega 7 --- Validación final

Pruebas en Android real, intercambio entre dispositivos, regresión y
documentación.

Cada entrega debe compilar y superar sus pruebas antes de continuar.

## 18. Documentación oficial de referencia

-   SQLite Community: https://github.com/capacitor-community/sqlite
-   Guía de importación/exportación JSON:
    https://github.com/capacitor-community/sqlite/blob/master/docs/ImportExportJson.md
-   Capacitor Share: https://capacitorjs.com/docs/apis/share
-   Capacitor Filesystem: https://capacitorjs.com/docs/apis/filesystem
-   Capacitor Preferences: https://capacitorjs.com/docs/apis/preferences

Consultar la documentación correspondiente a las versiones realmente
instaladas; no asumir que la documentación de la rama principal coincide
con el proyecto.

------------------------------------------------------------------------

## Instrucción de inicio para el agente de IA

Primero realiza únicamente la **Fase 1: diagnóstico técnico**.

Entrega:

1.  Resumen de la arquitectura SQLite actual.
2.  Versiones exactas de dependencias.
3.  Métodos de exportación e importación disponibles en la versión
    instalada.
4.  Estrategia recomendada para obtener una copia consistente.
5.  Estrategia de reemplazo y rollback.
6.  Dependencias nuevas necesarias, con justificación y compatibilidad.
7.  Riesgos técnicos y decisiones pendientes.
8.  Plan de implementación adaptado al repositorio.

**No modifiques archivos ni instales dependencias durante el
diagnóstico.** Espera aprobación expresa para comenzar la
implementación.

Después de la aprobación, ejecuta las entregas en orden. Prioriza
siempre la integridad de los datos sobre la velocidad de implementación.
