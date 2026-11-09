import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import {
  InstallationIdentity,
  LicenseSecurity,
  RuntimeClockReading,
} from './license-security.plugin';

@Injectable({ providedIn: 'root' })
export class LicenseSecureStorageService {
  async getOrCreateIdentity(): Promise<InstallationIdentity> {
    this.assertAndroid();
    return LicenseSecurity.getOrCreateIdentity();
  }

  async getRuntimeClock(): Promise<RuntimeClockReading> {
    this.assertAndroid();
    return LicenseSecurity.getRuntimeClock();
  }

  async signDeviceProof(message: string): Promise<string> {
    this.assertAndroid();
    const result = await LicenseSecurity.signDeviceProof({ message });
    return result.proof;
  }

  async saveLicenseState(state: unknown): Promise<void> {
    this.assertAndroid();
    await LicenseSecurity.saveLicenseState({ value: JSON.stringify(state) });
  }

  async loadLicenseState<T>(): Promise<T | null> {
    this.assertAndroid();
    const result = await LicenseSecurity.loadLicenseState();
    if (!result.value) {
      return null;
    }

    return JSON.parse(result.value) as T;
  }

  async clearLicenseState(): Promise<void> {
    this.assertAndroid();
    await LicenseSecurity.clearLicenseState();
  }

  private assertAndroid(): void {
    if (Capacitor.getPlatform() !== 'android') {
      throw new Error('LICENSE_SECURITY_ANDROID_ONLY');
    }
  }
}
