import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = 8100;
const sdkRoot =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  join(
    process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
    'Android',
    'Sdk',
  );
const adbPath = join(
  sdkRoot,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const ionicCliPath = join(process.cwd(), 'node_modules', '@ionic', 'cli', 'bin', 'ionic');

const runAdb = (args) => {
  const result = spawnSync(adbPath, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'Falló ADB.');
  }
  return result.stdout.trim();
};

if (!existsSync(adbPath)) {
  throw new Error(`No se encontró ADB en ${adbPath}.`);
}
if (!existsSync(ionicCliPath)) {
  throw new Error('Falta Ionic CLI. Instala las dependencias del proyecto con npm install.');
}

const deviceOutput = runAdb(['devices']);
const connectedDevices = deviceOutput
  .split(/\r?\n/)
  .map((line) => line.match(/^(\S+)\s+device(?:\s|$)/)?.[1])
  .filter(Boolean);
const target = process.env.ANDROID_DEVICE_ID ?? (
  connectedDevices.length === 1 ? connectedDevices[0] : undefined
);

if (!target) {
  throw new Error(
    connectedDevices.length
      ? `Hay varios dispositivos. Define ANDROID_DEVICE_ID; disponibles: ${connectedDevices.join(', ')}`
      : 'Conecta y autoriza el teléfono Android con depuración USB antes de iniciar Live Reload.',
  );
}

runAdb(['-s', target, 'reverse', `tcp:${port}`, `tcp:${port}`]);

const startChild = (args) =>
  spawn(process.execPath, [ionicCliPath, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });

const server = startChild(['serve', '--host', '127.0.0.1', '--port', String(port)]);
let nativeRun;
let stopping = false;

const stop = () => {
  if (stopping) {
    return;
  }
  stopping = true;
  server.kill('SIGINT');
  nativeRun?.kill('SIGINT');
  try {
    runAdb(['-s', target, 'reverse', '--remove', `tcp:${port}`]);
  } catch {
    // The device or ADB may already have disconnected.
  }
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  const serverUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  let ready = false;

  while (Date.now() < deadline && !ready) {
    if (server.exitCode !== null) {
      throw new Error('El servidor de desarrollo se cerró antes de iniciar.');
    }
    try {
      const response = await fetch(serverUrl);
      ready = response.ok;
    } catch {
      await delay(500);
    }
  }

  if (!ready) {
    throw new Error(`El servidor no respondió en ${serverUrl}.`);
  }

  nativeRun = startChild([
    'cap',
    'run',
    'android',
    `--livereload-url=http://localhost:${port}`,
    '--target',
    target,
  ]);

  const exitCode = await new Promise((resolve) => {
    nativeRun.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`El despliegue Android terminó con código ${exitCode}.`);
  }

  console.log('App desplegada. Live Reload sigue activo; pulsa Ctrl+C para detenerlo.');
  await new Promise((resolve) => process.once('SIGINT', resolve));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stop();
}
