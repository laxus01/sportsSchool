import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';

import { LicenseWriteAccessService } from '../../database/license-write-access.service';
import { LicenseApiError, LicenseApiService, buildDeviceProofMessage } from './license-api.service';
import { LicenseClockService } from './license-clock.service';
import {
  ActivationResponse,
  LicenseAccessStatus,
  LicenseClockCheckpoint,
  LicenseRefreshResponse,
  SignedLicenseClaims,
  StoredLicenseState,
} from './license.models';
import { LicenseSecureStorageService } from './license-secure-storage.service';
import { InstallationIdentity } from './license-security.plugin';
import { LicenseValidatorService } from './license-validator.service';

const ONLINE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class LicenseAccessService implements OnDestroy {
  private readonly api = inject(LicenseApiService);
  private readonly clock = inject(LicenseClockService);
  private readonly secureStorage = inject(LicenseSecureStorageService);
  private readonly validator = inject(LicenseValidatorService);
  private readonly writeAccess = inject(LicenseWriteAccessService);

  readonly status = signal<LicenseAccessStatus>(
    Capacitor.getPlatform() === 'android' ? 'CHECKING' : 'NOT_REQUIRED',
  );
  readonly canWrite = signal(Capacitor.getPlatform() !== 'android');
  readonly claims = signal<SignedLicenseClaims | null>(null);

  private identity: InstallationIdentity | null = null;
  private storedState: StoredLicenseState | null = null;
  private initialization?: Promise<void>;
  private listenersAttached = false;
  private refreshInFlight = false;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.refreshIfDue();
    }
  };
  private readonly onNetworkOnline = (): void => {
    void this.refreshIfDue();
  };

  initialize(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      this.setStatus('NOT_REQUIRED');
      return Promise.resolve();
    }
    if (!this.initialization) {
      this.writeAccess.setOperationalWritesAllowed(false);
      this.initialization = this.initializeAndroid().catch(() => {
        this.setStatus('INVALID');
      });
    }
    return this.initialization;
  }

  async activate(activationCode: string): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      throw new LicenseApiError('LICENSE_ANDROID_ONLY');
    }
    await this.initialize();
    const normalizedCode = activationCode.trim();
    if (normalizedCode.length < 20 || normalizedCode.length > 256) {
      throw new LicenseApiError('ACTIVATION_CODE_INVALID');
    }

    this.setStatus('CHECKING');
    let activationSubmitted = false;
    try {
      const identity =
        this.identity ?? (await this.secureStorage.getOrCreateIdentity());
      this.identity = identity;
      const challenge =
        await this.api.createActivationChallenge(normalizedCode);
      const appVersion = await this.getAppVersion();
      const proof = await this.secureStorage.signDeviceProof(
        buildDeviceProofMessage({
          purpose: 'ACTIVATION',
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          currentRevision: null,
          publicKeyThumbprint: identity.publicKeyThumbprint,
          appVersion,
        }),
      );
      activationSubmitted = true;
      const response = await this.api.activateInstallation({
        challengeId: challenge.challengeId,
        identity,
        proof,
        appVersion,
      });
      await this.acceptLicenseResponse(
        response,
        identity,
        challenge.nonce,
        0,
      );
    } catch (error) {
      const code = error instanceof LicenseApiError ? error.code : '';
      const activationOutcomeUnknown =
        activationSubmitted &&
        (!code ||
          code === 'LICENSE_NETWORK_UNAVAILABLE' ||
          code.startsWith('LICENSE_HTTP_5'));
      this.setStatus(
        activationOutcomeUnknown ? 'INVALID' : 'ACTIVATION_REQUIRED',
      );
      throw error;
    }
  }

  async refreshNow(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return true;
    }
    await this.initialize();
    const state = this.storedState ??
      (await this.secureStorage.loadLicenseState<StoredLicenseState>());
    if (!state) {
      this.setStatus('ACTIVATION_REQUIRED');
      return false;
    }
    this.storedState = state;
    return this.refreshStoredLicense(state);
  }

  private async initializeAndroid(): Promise<void> {
    this.identity = await this.secureStorage.getOrCreateIdentity();
    const state =
      await this.secureStorage.loadLicenseState<StoredLicenseState>();
    if (!state) {
      this.setStatus('ACTIVATION_REQUIRED');
      return;
    }
    this.storedState = state;

    const claims = await this.validator.verify(state.licenseJws, {
      installationId: state.installationId,
      publicKeyThumbprint: state.publicKeyThumbprint,
      highestRevision: state.highestRevision,
    });
    if (
      state.installationId !== this.identity.installationId ||
      state.publicKeyThumbprint !== this.identity.publicKeyThumbprint ||
      claims.revision !== state.highestRevision
    ) {
      this.setStatus('INVALID');
      return;
    }
    this.claims.set(claims);

    const status = await this.evaluateState(state, claims);
    this.setStatus(status);
    this.attachLifecycleListeners();
    if (
      status === 'VALIDATION_REQUIRED' ||
      status === 'EXPIRED' ||
      status === 'SUSPENDED' ||
      status === 'REVOKED'
    ) {
      void this.refreshStoredLicense(state).catch(() => undefined);
    } else {
      void this.refreshIfDue().catch(() => undefined);
    }
  }

  private async evaluateState(
    state: StoredLicenseState,
    claims: SignedLicenseClaims,
  ): Promise<LicenseAccessStatus> {
    if (claims.status === 'SUSPENDED') {
      return 'SUSPENDED';
    }
    if (claims.status === 'REVOKED') {
      return 'REVOKED';
    }
    if (claims.licenseType === 'PERPETUAL') {
      return 'ACTIVE';
    }

    const reading = await this.secureStorage.getRuntimeClock().catch(() => null);
    if (!reading) {
      return 'VALIDATION_REQUIRED';
    }
    const evaluation = this.clock.evaluate(state.clock, reading);
    if (evaluation.requiresOnlineValidation || evaluation.trustedNowMs === null) {
      return 'VALIDATION_REQUIRED';
    }

    const now = evaluation.trustedNowMs;
    const paidThrough = Date.parse(claims.paidThrough!);
    const graceUntil = Date.parse(claims.graceUntil!);
    const offlineUntil = Date.parse(claims.offlineUntil!);
    if (now >= graceUntil) {
      return 'EXPIRED';
    }
    if (now >= offlineUntil) {
      return 'VALIDATION_REQUIRED';
    }
    return now >= paidThrough ? 'GRACE_PERIOD' : 'ACTIVE';
  }

  private async refreshStoredLicense(
    state: StoredLicenseState,
  ): Promise<boolean> {
    if (this.refreshInFlight) {
      return false;
    }
    if (!this.identity) {
      this.identity = await this.secureStorage.getOrCreateIdentity();
    }
    if (
      state.installationId !== this.identity.installationId ||
      state.publicKeyThumbprint !== this.identity.publicKeyThumbprint
    ) {
      this.setStatus('INVALID');
      return false;
    }

    this.refreshInFlight = true;
    try {
      const challenge = await this.api.createRefreshChallenge(
        state.installationId,
      );
      const appVersion = await this.getAppVersion();
      const proof = await this.secureStorage.signDeviceProof(
        buildDeviceProofMessage({
          purpose: 'REFRESH',
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          currentRevision: state.highestRevision,
          installationId: state.installationId,
          publicKeyThumbprint: state.publicKeyThumbprint,
          appVersion,
        }),
      );
      const response = await this.api.refreshLicense({
        challengeId: challenge.challengeId,
        installationId: state.installationId,
        currentRevision: state.highestRevision,
        appVersion,
        proof,
      });
      await this.acceptLicenseResponse(
        response,
        this.identity,
        challenge.nonce,
        state.highestRevision,
      );
      return true;
    } catch {
      const claims = this.claims();
      if (claims) {
        try {
          this.setStatus(await this.evaluateState(state, claims));
        } catch {
          this.setStatus('VALIDATION_REQUIRED');
        }
      } else {
        this.setStatus('VALIDATION_REQUIRED');
      }
      return false;
    } finally {
      this.refreshInFlight = false;
    }
  }

  private async acceptLicenseResponse(
    response: ActivationResponse | LicenseRefreshResponse,
    identity: InstallationIdentity,
    requestNonce: string,
    previousRevision: number,
  ): Promise<void> {
    const installationId =
      'installationId' in response
        ? response.installationId
        : this.storedState?.installationId;
    if (!installationId || !response.licenseJws) {
      throw new LicenseApiError('LICENSE_RESPONSE_INVALID');
    }

    const claims = await this.validator.verify(response.licenseJws, {
      installationId,
      publicKeyThumbprint: identity.publicKeyThumbprint,
      highestRevision: previousRevision,
      requestNonce,
    });
    if (claims.revision < previousRevision) {
      throw new LicenseApiError('LICENSE_REVISION_ROLLBACK');
    }

    const reading = await this.secureStorage
      .getRuntimeClock()
      .catch(() => null);
    if (!reading) {
      throw new LicenseApiError('LICENSE_CLOCK_READING_INVALID');
    }
    const state: StoredLicenseState = {
      licenseJws: response.licenseJws,
      installationId,
      publicKeyThumbprint: identity.publicKeyThumbprint,
      highestRevision: claims.revision,
      clock: this.clock.checkpoint(claims, reading),
      lastOnlineRefreshWallTimeMs: reading.wallTimeMs,
    };
    await this.secureStorage.saveLicenseState(state);
    this.storedState = state;
    this.claims.set(claims);
    this.setStatus(await this.evaluateState(state, claims));
    this.attachLifecycleListeners();
  }

  private attachLifecycleListeners(): void {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onNetworkOnline);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onNetworkOnline);
    }
  }

  private async refreshIfDue(): Promise<void> {
    if (!this.storedState || !this.claims()) {
      return;
    }
    if (
      this.status() === 'VALIDATION_REQUIRED' ||
      this.status() === 'EXPIRED' ||
      this.status() === 'SUSPENDED' ||
      this.status() === 'REVOKED'
    ) {
      await this.refreshStoredLicense(this.storedState);
      return;
    }
    const reading = await this.secureStorage.getRuntimeClock().catch(() => null);
    if (!reading) {
      return;
    }
    if (
      reading.wallTimeMs - this.storedState.lastOnlineRefreshWallTimeMs >=
      ONLINE_REFRESH_INTERVAL_MS
    ) {
      await this.refreshStoredLicense(this.storedState);
    }
  }

  private async getAppVersion(): Promise<string> {
    try {
      const info = await App.getInfo();
      return info.version.slice(0, 64) || '0.0.1';
    } catch {
      return '0.0.1';
    }
  }

  private setStatus(status: LicenseAccessStatus): void {
    const allowed =
      status === 'NOT_REQUIRED' ||
      status === 'ACTIVE' ||
      status === 'GRACE_PERIOD';
    this.status.set(status);
    this.canWrite.set(allowed);
    this.writeAccess.setOperationalWritesAllowed(allowed);
  }
}
