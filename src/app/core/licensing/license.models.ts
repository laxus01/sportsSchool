export type SignedLicenseStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type SignedLicenseType = 'SUBSCRIPTION' | 'PERPETUAL';

export interface SignedLicenseClaims {
  iss: string;
  aud: string;
  licenseId: string;
  schoolId: string;
  installationId: string;
  product: 'SPORTS_SCHOOL';
  licenseType: SignedLicenseType;
  status: SignedLicenseStatus;
  iat: number;
  licenseVersion: 1;
  revision: number;
  jti: string;
  cnf: { jkt: string };
  requestNonce?: string;
  exp?: number;
  paidThrough?: string;
  graceUntil?: string;
  offlineUntil?: string;
}

export interface LicenseVerificationContext {
  installationId: string;
  publicKeyThumbprint: string;
  highestRevision: number;
  requestNonce?: string;
}

export interface LicenseClockCheckpoint {
  serverTimeMs: number;
  wallTimeMs: number;
  elapsedRealtimeMs: number;
}

export interface StoredLicenseState {
  licenseJws: string;
  installationId: string;
  publicKeyThumbprint: string;
  highestRevision: number;
  clock: LicenseClockCheckpoint;
  lastOnlineRefreshWallTimeMs: number;
}

export interface DeviceChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: string;
}

export interface ActivationResponse {
  installationId: string;
  licenseJws: string;
  requestId: string;
}

export interface LicenseRefreshResponse {
  licenseJws: string;
  requestId: string;
}

export type LicenseAccessStatus =
  | 'CHECKING'
  | 'NOT_REQUIRED'
  | 'ACTIVATION_REQUIRED'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'VALIDATION_REQUIRED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'INVALID';
