import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ActivationResponse,
  DeviceChallengeResponse,
  LicenseRefreshResponse,
} from './license.models';
import { InstallationIdentity } from './license-security.plugin';

export type DeviceProofPurpose = 'ACTIVATION' | 'REFRESH' | 'DEACTIVATION';

export interface DeviceProofPayload {
  purpose: DeviceProofPurpose;
  challengeId: string;
  nonce: string;
  currentRevision?: number | null;
  installationId?: string;
  publicKeyThumbprint?: string;
  appVersion?: string;
}

export class LicenseApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LicenseApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class LicenseApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.licenseApiBaseUrl.replace(/\/+$/, '');

  createActivationChallenge(
    activationCode: string,
  ): Promise<DeviceChallengeResponse> {
    return this.post<DeviceChallengeResponse>('device-challenges', {
      purpose: 'activation',
      activationCode: activationCode.trim(),
    });
  }

  activateInstallation(input: {
    challengeId: string;
    identity: InstallationIdentity;
    proof: string;
    appVersion: string;
  }): Promise<ActivationResponse> {
    return this.post<ActivationResponse>('installations/activate', {
      challengeId: input.challengeId,
      installationPublicKeyJwk: input.identity.publicKeyJwk,
      proof: input.proof,
      appVersion: input.appVersion,
    });
  }

  createRefreshChallenge(
    installationId: string,
  ): Promise<DeviceChallengeResponse> {
    return this.post<DeviceChallengeResponse>('device-challenges', {
      purpose: 'refresh',
      installationId,
    });
  }

  refreshLicense(input: {
    challengeId: string;
    installationId: string;
    currentRevision: number;
    appVersion: string;
    proof: string;
  }): Promise<LicenseRefreshResponse> {
    return this.post<LicenseRefreshResponse>('licenses/refresh', input);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.baseUrl.startsWith('https://')) {
      throw new LicenseApiError('LICENSE_API_HTTPS_REQUIRED');
    }

    try {
      return await firstValueFrom(
        this.http
          .post<T>(`${this.baseUrl}/${path}`, body)
          .pipe(timeout({ first: 20_000 })),
      );
    } catch (error) {
      throw new LicenseApiError(this.getErrorCode(error));
    }
  }

  private getErrorCode(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'LICENSE_NETWORK_UNAVAILABLE';
      }
      const body = error.error as { message?: unknown } | null;
      if (typeof body?.message === 'string') {
        return body.message.slice(0, 80);
      }
      if (Array.isArray(body?.message)) {
        return 'LICENSE_REQUEST_INVALID';
      }
      return `LICENSE_HTTP_${error.status}`;
    }
    return 'LICENSE_NETWORK_UNAVAILABLE';
  }
}

export function buildDeviceProofMessage(payload: DeviceProofPayload): string {
  return JSON.stringify({
    appVersion: payload.appVersion ?? '',
    challengeId: payload.challengeId,
    currentRevision: payload.currentRevision ?? null,
    installationId: payload.installationId ?? '',
    nonce: payload.nonce,
    publicKeyThumbprint: payload.publicKeyThumbprint ?? '',
    purpose: payload.purpose,
  });
}
