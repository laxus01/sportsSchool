import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'Sports School',
  webDir: 'www',
  plugins: {
    SystemBars: {
      insetsHandling: 'disable'
    },
    Keyboard: {
      resize: KeyboardResize.Ionic,
      resizeOnFullScreen: false
    }
  }
};

export default config;
