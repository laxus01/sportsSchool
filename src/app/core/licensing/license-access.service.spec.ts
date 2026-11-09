import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LicenseWriteAccessService } from '../../database/license-write-access.service';
import { LicenseApiService } from './license-api.service';
import { LicenseClockService } from './license-clock.service';
import { LicenseAccessService } from './license-access.service';
import {
  SignedLicenseClaims,
  StoredLicenseState,
} from './license.models';
import { LicenseSecureStorageService } from './license-secure-storage.service';
import { LicenseValidatorService } from './license-validator.service';

describe('LicenseAccessService', () => {
  let platformSpy: ReturnType<typeof vi.spyOn>;
  let writeAccess: { setOperationalWritesAllowed: ReturnType<typeof vi.fn> };
  let api: {
    createActivationChallenge: ReturnType<typeof vi.fn>;
    activateInstallation: ReturnType<typeof vi.fn>;
    createRefreshChallenge: ReturnType<typeof vi.fn>;
    refreshLicense: ReturnType<typeof vi.fn>;
  };
  let secureStorage: {
    getOrCreateIdentity: ReturnType<typeof vi.fn>;
    loadLicenseState: ReturnType<typeof vi.fn>;
    getRuntimeClock: ReturnType<typeof vi.fn>;
    saveLicenseState: ReturnType<typeof vi.fn>;
    signDeviceProof: ReturnType<typeof vi.fn>;
  };
  let validator: { verify: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    platformSpy = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    writeAccess = { setOperationalWritesAllowed: vi.fn() };
    api = {
      createActivationChallenge: vi.fn(),
      activateInstallation: vi.fn(),
      createRefreshChallenge: vi.fn(),
      refreshLicense: vi.fn(),
    };
    secureStorage = {
      getOrCreateIdentity: vi.fn(async () => ({
        installationId: 'installation-1',
        publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
        publicKeyThumbprint: 'thumbprint-1',
      })),
      loadLicenseState: vi.fn(async () => null),
      getRuntimeClock: vi.fn(),
      saveLicenseState: vi.fn(),
      signDeviceProof: vi.fn(),
    };
    validator = { verify: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        LicenseAccessService,
        LicenseClockService,
        { provide: LicenseApiService, useValue: api },
        { provide: LicenseSecureStorageService, useValue: secureStorage },
        { provide: LicenseValidatorService, useValue: validator },
        { provide: LicenseWriteAccessService, useValue: writeAccess },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    platformSpy.mockRestore();
  });

  it('requires activation and keeps operational writes blocked when no grant is stored', async () => {
    const access = TestBed.inject(LicenseAccessService);

    await access.initialize();

    expect(access.status()).toBe('ACTIVATION_REQUIRED');
    expect(access.canWrite()).toBe(false);
    expect(writeAccess.setOperationalWritesAllowed).toHaveBeenLastCalledWith(
      false,
    );
  });

  it('allows a valid perpetual grant without consulting a clock or network', async () => {
    const claims: SignedLicenseClaims = {
      iss: 'https://licenses.example.test',
      aud: 'SPORTS_SCHOOL',
      licenseId: 'license-1',
      schoolId: 'school-1',
      installationId: 'installation-1',
      product: 'SPORTS_SCHOOL',
      licenseType: 'PERPETUAL',
      status: 'ACTIVE',
      iat: 1_800_000_000,
      licenseVersion: 1,
      revision: 4,
      jti: 'jti-1',
      cnf: { jkt: 'thumbprint-1' },
    };
    const state: StoredLicenseState = {
      licenseJws: 'header.payload.signature',
      installationId: 'installation-1',
      publicKeyThumbprint: 'thumbprint-1',
      highestRevision: 4,
      clock: {
        serverTimeMs: claims.iat * 1000,
        wallTimeMs: 1_800_000_000_000,
        elapsedRealtimeMs: 100_000,
      },
      lastOnlineRefreshWallTimeMs: 1_800_000_000_000,
    };
    secureStorage.loadLicenseState.mockResolvedValue(state);
    secureStorage.getRuntimeClock.mockResolvedValue({
      wallTimeMs: state.lastOnlineRefreshWallTimeMs,
      elapsedRealtimeMs: 200_000,
    });
    validator.verify.mockResolvedValue(claims);
    const access = TestBed.inject(LicenseAccessService);

    await access.initialize();

    expect(access.status()).toBe('ACTIVE');
    expect(access.canWrite()).toBe(true);
    expect(secureStorage.getRuntimeClock).toHaveBeenCalledOnce();
    expect(api.createRefreshChallenge).not.toHaveBeenCalled();
    expect(writeAccess.setOperationalWritesAllowed).toHaveBeenLastCalledWith(
      true,
    );
  });

  it('blocks subscription writes after the offline window if refresh is unavailable', async () => {
    const issuedAt = Date.parse('2026-11-01T00:00:00.000Z') / 1000;
    const currentTimeMs = Date.parse('2026-12-02T00:00:00.000Z');
    const claims: SignedLicenseClaims = {
      iss: 'https://licenses.example.test',
      aud: 'SPORTS_SCHOOL',
      licenseId: 'license-1',
      schoolId: 'school-1',
      installationId: 'installation-1',
      product: 'SPORTS_SCHOOL',
      licenseType: 'SUBSCRIPTION',
      status: 'ACTIVE',
      iat: issuedAt,
      exp: Date.parse('2026-12-01T00:00:00.000Z') / 1000,
      paidThrough: '2026-11-20T00:00:00.000Z',
      graceUntil: '2026-12-11T00:00:00.000Z',
      offlineUntil: '2026-12-01T00:00:00.000Z',
      licenseVersion: 1,
      revision: 4,
      jti: 'jti-1',
      cnf: { jkt: 'thumbprint-1' },
    };
    const elapsedRealtimeMs = 31 * 24 * 60 * 60 * 1000;
    const state: StoredLicenseState = {
      licenseJws: 'signed-license',
      installationId: 'installation-1',
      publicKeyThumbprint: 'thumbprint-1',
      highestRevision: 4,
      clock: {
        serverTimeMs: issuedAt * 1000,
        wallTimeMs: claims.iat * 1000,
        elapsedRealtimeMs: 100_000,
      },
      lastOnlineRefreshWallTimeMs: claims.iat * 1000,
    };
    secureStorage.loadLicenseState.mockResolvedValue(state);
    secureStorage.getRuntimeClock.mockResolvedValue({
      wallTimeMs: currentTimeMs,
      elapsedRealtimeMs: 100_000 + elapsedRealtimeMs,
    });
    validator.verify.mockResolvedValue(claims);
    api.createRefreshChallenge.mockRejectedValue(new Error('offline'));
    const access = TestBed.inject(LicenseAccessService);

    await access.initialize();

    expect(access.status()).toBe('VALIDATION_REQUIRED');
    expect(access.canWrite()).toBe(false);
    expect(writeAccess.setOperationalWritesAllowed).toHaveBeenLastCalledWith(
      false,
    );
  });

  it('keeps web execution outside Android licensing enforcement', async () => {
    platformSpy.mockReturnValue('web');
    const access = TestBed.inject(LicenseAccessService);

    await access.initialize();

    expect(access.status()).toBe('NOT_REQUIRED');
    expect(access.canWrite()).toBe(true);
    expect(secureStorage.getOrCreateIdentity).not.toHaveBeenCalled();
    expect(writeAccess.setOperationalWritesAllowed).toHaveBeenLastCalledWith(
      true,
    );
  });

  it('activates with a signed device proof and stores only the verified grant', async () => {
    const identity = {
      installationId: 'installation-1',
      publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
      publicKeyThumbprint: 'thumbprint-1',
    };
    const claims: SignedLicenseClaims = {
      iss: 'https://licenses.example.test',
      aud: 'SPORTS_SCHOOL',
      licenseId: 'license-1',
      schoolId: 'school-1',
      installationId: 'installation-1',
      product: 'SPORTS_SCHOOL',
      licenseType: 'PERPETUAL',
      status: 'ACTIVE',
      iat: 1_800_000_000,
      licenseVersion: 1,
      revision: 0,
      jti: 'jti-1',
      cnf: { jkt: 'thumbprint-1' },
      requestNonce: 'challenge-nonce',
    };
    api.createActivationChallenge.mockResolvedValue({
      challengeId: 'challenge-1',
      nonce: 'challenge-nonce',
      expiresAt: '2026-11-08T00:00:00.000Z',
    });
    api.activateInstallation.mockResolvedValue({
      installationId: 'installation-1',
      licenseJws: 'signed-license',
      requestId: 'request-1',
    });
    secureStorage.signDeviceProof.mockResolvedValue('device-proof');
    secureStorage.getRuntimeClock.mockResolvedValue({
      wallTimeMs: 1_800_000_010_000,
      elapsedRealtimeMs: 200_000,
    });
    validator.verify.mockResolvedValue(claims);
    const access = TestBed.inject(LicenseAccessService);

    await access.activate('  activation-code-that-is-long-enough  ');

    expect(api.createActivationChallenge).toHaveBeenCalledWith(
      'activation-code-that-is-long-enough',
    );
    expect(api.activateInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'challenge-1',
        identity,
        proof: 'device-proof',
      }),
    );
    expect(secureStorage.saveLicenseState).toHaveBeenCalledWith(
      expect.objectContaining({
        licenseJws: 'signed-license',
        installationId: 'installation-1',
        highestRevision: 0,
      }),
    );
    expect(access.status()).toBe('ACTIVE');
    expect(access.canWrite()).toBe(true);
  });
});
