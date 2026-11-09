import { beforeAll, describe, expect, it } from 'vitest';

import { SignedLicenseClaims } from './license.models';
import { verifyLicenseJws } from './license-validator.service';

const ISSUER = 'https://licenses.example.test';
const AUDIENCE = 'SPORTS_SCHOOL';
const CONTEXT = {
  installationId: 'installation-1',
  publicKeyThumbprint: 'device-thumbprint',
  highestRevision: 3,
  requestNonce: 'challenge-nonce',
};
const HEADER = { alg: 'EdDSA', kid: 'test-key', typ: 'JWT' };

describe('license JWS validation', () => {
  let privateKey: CryptoKey;
  let publicKeyBase64Url: string;

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'Ed25519' } as Algorithm,
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    privateKey = pair.privateKey;
    publicKeyBase64Url = encodeBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    );
  });

  it('accepts an active subscription bound to this installation and challenge', async () => {
    const token = await signToken(subscriptionClaims());

    const claims = await verifyLicenseJws(
      token,
      CONTEXT,
      ISSUER,
      AUDIENCE,
      { 'test-key': publicKeyBase64Url },
    );

    expect(claims.licenseType).toBe('SUBSCRIPTION');
    expect(claims.revision).toBe(4);
  });

  it('rejects a signature changed after signing', async () => {
    const token = await signToken(subscriptionClaims());
    const [header, payload, signature] = token.split('.');
    const changedFirstCharacter = signature[0] === 'A' ? 'B' : 'A';
    const tampered = `${header}.${payload}.${changedFirstCharacter}${signature.slice(1)}`;

    await expect(
      verifyLicenseJws(
        tampered,
        CONTEXT,
        ISSUER,
        AUDIENCE,
        { 'test-key': publicKeyBase64Url },
      ),
    ).rejects.toMatchObject({
      code: 'LICENSE_SIGNATURE_INVALID',
    });
  });

  it('rejects an unknown signing key id', async () => {
    const token = await signToken(subscriptionClaims(), {
      ...HEADER,
      kid: 'unknown-key',
    });

    await expect(
      verifyLicenseJws(token, CONTEXT, ISSUER, AUDIENCE, {
        'test-key': publicKeyBase64Url,
      }),
    ).rejects.toMatchObject({ code: 'LICENSE_SIGNING_KEY_UNKNOWN' });
  });

  it('rejects tokens bound to another device, an old revision, or another challenge', async () => {
    const token = await signToken(subscriptionClaims());

    await expect(
      verifyLicenseJws(
        token,
        { ...CONTEXT, installationId: 'other-installation' },
        ISSUER,
        AUDIENCE,
        { 'test-key': publicKeyBase64Url },
      ),
    ).rejects.toMatchObject({ code: 'LICENSE_CLAIMS_MISMATCH' });

    await expect(
      verifyLicenseJws(
        token,
        { ...CONTEXT, highestRevision: 5 },
        ISSUER,
        AUDIENCE,
        { 'test-key': publicKeyBase64Url },
      ),
    ).rejects.toMatchObject({ code: 'LICENSE_REVISION_ROLLBACK' });

    await expect(
      verifyLicenseJws(
        token,
        { ...CONTEXT, requestNonce: 'different-nonce' },
        ISSUER,
        AUDIENCE,
        { 'test-key': publicKeyBase64Url },
      ),
    ).rejects.toMatchObject({ code: 'LICENSE_NONCE_MISMATCH' });
  });

  it('rejects inconsistent subscription expiry claims', async () => {
    const token = await signToken({
      ...subscriptionClaims(),
      exp: Date.parse('2026-12-05T00:00:00.000Z') / 1000,
    });

    await expect(
      verifyLicenseJws(
        token,
        CONTEXT,
        ISSUER,
        AUDIENCE,
        { 'test-key': publicKeyBase64Url },
      ),
    ).rejects.toMatchObject({
      code: 'LICENSE_SUBSCRIPTION_DATES_INCOHERENT',
    });
  });

  it('returns signed suspended status for the access policy to deny', async () => {
    const token = await signToken({
      ...subscriptionClaims(),
      status: 'SUSPENDED',
    });

    const claims = await verifyLicenseJws(
      token,
      CONTEXT,
      ISSUER,
      AUDIENCE,
      { 'test-key': publicKeyBase64Url },
    );

    expect(claims.status).toBe('SUSPENDED');
  });

  it('accepts perpetual licenses only without subscription expiry claims', async () => {
    const token = await signToken({
      ...subscriptionClaims(),
      licenseType: 'PERPETUAL',
      exp: undefined,
      paidThrough: undefined,
      graceUntil: undefined,
      offlineUntil: undefined,
    });

    const claims = await verifyLicenseJws(
      token,
      CONTEXT,
      ISSUER,
      AUDIENCE,
      { 'test-key': publicKeyBase64Url },
    );

    expect(claims.licenseType).toBe('PERPETUAL');
    expect(claims.exp).toBeUndefined();
  });

  async function signToken(
    claims: object,
    header: Record<string, unknown> = HEADER,
  ): Promise<string> {
    const encodedHeader = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify(header)),
    );
    const encodedPayload = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify(claims)),
    );
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' } as Algorithm,
      privateKey,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
  }

  function subscriptionClaims(): SignedLicenseClaims {
    return {
      iss: ISSUER,
      aud: AUDIENCE,
      licenseId: 'license-1',
      schoolId: 'school-1',
      installationId: CONTEXT.installationId,
      product: 'SPORTS_SCHOOL',
      licenseType: 'SUBSCRIPTION',
      status: 'ACTIVE',
      iat: Date.parse('2026-11-01T00:00:00.000Z') / 1000,
      exp: Date.parse('2026-12-01T00:00:00.000Z') / 1000,
      paidThrough: '2026-11-20T00:00:00.000Z',
      graceUntil: '2026-12-05T00:00:00.000Z',
      offlineUntil: '2026-12-01T00:00:00.000Z',
      licenseVersion: 1,
      revision: 4,
      jti: 'jti-1',
      cnf: { jkt: CONTEXT.publicKeyThumbprint },
      requestNonce: CONTEXT.requestNonce,
    };
  }

  function encodeBase64Url(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
});
