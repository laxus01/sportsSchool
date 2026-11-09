import {
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  buildDeviceProofMessage,
  LicenseApiService,
} from './license-api.service';

describe('LicenseApiService', () => {
  let api: LicenseApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        LicenseApiService,
      ],
    });
    api = TestBed.inject(LicenseApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('sends activation codes only to the HTTPS challenge endpoint', async () => {
    const response = api.createActivationChallenge('  activation-code  ');
    const request = http.expectOne(
      `${environment.licenseApiBaseUrl}/device-challenges`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      purpose: 'activation',
      activationCode: 'activation-code',
    });
    request.flush({
      challengeId: 'challenge-1',
      nonce: 'nonce-1',
      expiresAt: '2026-11-08T00:00:00.000Z',
    });
    await expect(response).resolves.toMatchObject({
      challengeId: 'challenge-1',
    });
  });

  it('builds the exact canonical device-proof field order', () => {
    expect(
      buildDeviceProofMessage({
        purpose: 'REFRESH',
        challengeId: 'challenge-1',
        nonce: 'nonce-1',
        currentRevision: 7,
        installationId: 'installation-1',
        publicKeyThumbprint: 'thumbprint-1',
        appVersion: '1.0.0',
      }),
    ).toBe(
      '{"appVersion":"1.0.0","challengeId":"challenge-1","currentRevision":7,"installationId":"installation-1","nonce":"nonce-1","publicKeyThumbprint":"thumbprint-1","purpose":"REFRESH"}',
    );
  });
});
