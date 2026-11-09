import { registerPlugin } from '@capacitor/core';

export interface InstallationIdentity {
  installationId: string;
  publicKeyJwk: {
    kty: 'EC';
    crv: 'P-256';
    x: string;
    y: string;
  };
  publicKeyThumbprint: string;
}

interface SignatureResult {
  proof: string;
}

interface StoredLicenseResult {
  value: string | null;
}

export interface RuntimeClockReading {
  wallTimeMs: number;
  elapsedRealtimeMs: number;
}

export interface LicenseSecurityPlugin {
  getOrCreateIdentity(): Promise<InstallationIdentity>;
  getRuntimeClock(): Promise<RuntimeClockReading>;
  signDeviceProof(options: { message: string }): Promise<SignatureResult>;
  saveLicenseState(options: { value: string }): Promise<void>;
  loadLicenseState(): Promise<StoredLicenseResult>;
  clearLicenseState(): Promise<void>;
}

export const LicenseSecurity =
  registerPlugin<LicenseSecurityPlugin>('LicenseSecurity');
