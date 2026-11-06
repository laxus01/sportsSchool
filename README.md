# Sports School

Aplicación de administración de una escuela deportiva, desarrollada con Angular, Ionic y Capacitor. Puede ejecutarse en el navegador y compilarse como aplicación nativa para Android.

## Requisitos

- Node.js 22.22.3 o posterior en la rama 22, 24.15 o posterior en la rama 24, o 26 o posterior; npm. Se recomienda Node.js 24 LTS.
- Java JDK 21 para compilar Android.
- Android Studio con Android SDK Platform 36 y Android SDK Build-Tools instalados.
- Para ejecutar en un teléfono: Android SDK Platform-Tools (ADB), cable USB y depuración USB habilitada.

En Android Studio, selecciona JDK 21 en **Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK**.

## Instalar dependencias

Abre una terminal en la carpeta raíz del proyecto —la que contiene `package.json`— y ejecuta:

```powershell
npm ci
```

`npm ci` instala las versiones fijadas en `package-lock.json`. Si no existe `node_modules`, vuelve a ejecutar este comando antes de iniciar o compilar la aplicación.

## Ejecutar en el navegador

```powershell
npm start
```

Abre `http://localhost:4200`. El servidor de desarrollo recarga la aplicación cuando se modifican archivos del proyecto.

## Preparar Android Studio

Desde la raíz del proyecto, compila la aplicación web y sincroniza los archivos con la plataforma Android:

```powershell
npm run build
npx cap sync android
```

La compilación web se genera en `www/` y Capacitor copia esos archivos al proyecto nativo `android/`. El nombre mostrado en el menú del teléfono es **Sports School**. Repite ambos comandos después de cambios en la aplicación web antes de crear un nuevo APK.

Abre el proyecto nativo en Android Studio con:

```powershell
npx cap open android
```

También puedes abrir Android Studio y elegir **Open**, seleccionando la carpeta `android` dentro del proyecto. Espera a que termine la sincronización de Gradle. Si solicita componentes del SDK, instala Android SDK Platform 36 y Android SDK Build-Tools.

## Crear un APK de depuración

En Android Studio:

1. Espera a que finalice la sincronización de Gradle.
2. Selecciona **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. Cuando termine, usa el enlace **locate** de la notificación para encontrar el archivo.

El APK también se puede generar desde PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug
```

En macOS o Linux, desde la raíz del proyecto:

```sh
cd android
./gradlew assembleDebug
```

La salida se llamará `SSV1.0.apk` y estará en:

```text
android/app/build/outputs/apk/debug/SSV1.0.apk
```

El APK de depuración se firma automáticamente con la clave de depuración y sirve para pruebas e instalación en dispositivos de desarrollo.

## Crear un APK firmado para distribución

Para generar una versión firmada, abre el proyecto `android` en Android Studio y selecciona **Build > Generate Signed Bundle / APK...**. El asistente permite elegir **APK** o **Android App Bundle**, crear o seleccionar una clave de firma y generar la versión `release`.

Guarda la clave de firma y sus contraseñas de forma segura. No las subas al repositorio ni las compartas. El APK de distribución queda en `android/app/release/` (o en la ubicación que indique el asistente).

El identificador de aplicación actual es `io.ionic.starter`. Antes de publicar o distribuir la aplicación, reemplázalo por el identificador definitivo de la organización y mantén la configuración de Capacitor y Android coherente.

## Ejecución en un dispositivo Android (Live Reload)

Para probar cambios web en un teléfono conectado por USB:

1. Activa **Developer options** y **USB debugging** en el teléfono.
2. Conecta el dispositivo y acepta el aviso de autorización de depuración.
3. Desde la raíz del proyecto, ejecuta:

```powershell
npm run android:live
```

El comando inicia el servidor de desarrollo, instala y abre la aplicación en el dispositivo. Mantén la terminal abierta mientras pruebas; los cambios web se recargan en vivo. Detén la sesión con `Ctrl+C`.

Si hay varios dispositivos conectados, lista los dispositivos y define `ANDROID_DEVICE_ID` con el número de serie del teléfono antes de iniciar el comando:

```powershell
adb devices
$env:ANDROID_DEVICE_ID = "SERIAL_DEL_DISPOSITIVO"
npm run android:live
```

Consulta [DEVELOPMENT.md](DEVELOPMENT.md) para más detalles.

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `npm start` | Inicia el servidor de desarrollo web. |
| `npm run build` | Compila la aplicación web en `www/`. |
| `npm test` | Ejecuta las pruebas. |
| `npm run lint` | Ejecuta el análisis estático. |
| `npm run android:live` | Ejecuta la aplicación en Android con Live Reload. |
| `npx cap sync android` | Sincroniza la aplicación web y los plugins con Android. |
