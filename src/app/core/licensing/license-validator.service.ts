import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';
import {
  LicenseVerificationContext,
  SignedLicenseClaims,
} from './license.models';

export class LicenseValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LicenseValidationError';
  }
}

type JsonRecord = Record<string, unknown>;
const MAX_OFFLINE_DURATION_SECONDS = 30 * 24 * 60 * 60;

interface JwsHeader extends JsonRecord {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface LicenseClaimsRecord extends JsonRecord {
  iss?: unknown;
  aud?: unknown;
  licenseId?: unknown;
  schoolId?: unknown;
  installationId?: unknown;
  product?: unknown;
  licenseType?: unknown;
  status?: unknown;
  iat?: unknown;
  licenseVersion?: unknown;
  revision?: unknown;
  jti?: unknown;
  cnf?: unknown;
  requestNonce?: unknown;
  exp?: unknown;
  paidThrough?: unknown;
  graceUntil?: unknown;
  offlineUntil?: unknown;
}

export async function verifyLicenseJws(
  token: string,
  context: LicenseVerificationContext,
  issuer: string,
  audience: string,
  trustedPublicKeys: Readonly<Record<string, string>>,
): Promise<SignedLicenseClaims> {
  if (
    !isNonEmptyString(context.installationId) ||
    !isNonEmptyString(context.publicKeyThumbprint) ||
    !isNonNegativeInteger(context.highestRevision)
  ) {
    throw new LicenseValidationError('LICENSE_VERIFICATION_CONTEXT_INVALID');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new LicenseValidationError('LICENSE_JWS_FORMAT_INVALID');
  }

  const header = parseJsonPart(
    parts[0],
    'LICENSE_JWS_HEADER_INVALID',
  ) as JwsHeader;
  const keyId = header.kid;
  if (
    header.alg !== 'EdDSA' ||
    header.typ !== 'JWT' ||
    typeof keyId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(keyId) ||
    Object.keys(header).some((key) => !['alg', 'kid', 'typ'].includes(key))
  ) {
    throw new LicenseValidationError('LICENSE_JWS_HEADER_UNSUPPORTED');
  }

  const encodedKey = trustedPublicKeys[keyId];
  if (!encodedKey) {
    throw new LicenseValidationError('LICENSE_SIGNING_KEY_UNKNOWN');
  }

  let verified: boolean;
  try {
    const publicKey = await crypto.subtle.importKey(
      'raw',
      decodeBase64Url(encodedKey),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    verified = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    throw new LicenseValidationError('LICENSE_SIGNATURE_UNVERIFIABLE');
  }
  if (!verified) {
    throw new LicenseValidationError('LICENSE_SIGNATURE_INVALID');
  }

  return validateClaims(
    parseJsonPart(parts[1], 'LICENSE_CLAIMS_INVALID') as LicenseClaimsRecord,
    context,
    issuer,
    audience,
  );
}

@Injectable({ providedIn: 'root' })
export class LicenseValidatorService {
  verify(
    token: string,
    context: LicenseVerificationContext,
  ): Promise<SignedLicenseClaims> {
    return verifyLicenseJws(
      token,
      context,
      environment.licenseIssuer,
      environment.licenseAudience,
      environment.licenseSigningPublicKeys,
    );
  }
}

function validateClaims(
  claims: LicenseClaimsRecord,
  context: LicenseVerificationContext,
  issuer: string,
  audience: string,
): SignedLicenseClaims {
  if (
    claims.iss !== issuer ||
    claims.aud !== audience ||
    claims.product !== 'SPORTS_SCHOOL' ||
    claims.installationId !== context.installationId ||
    !isNonEmptyString(claims.licenseId) ||
    !isNonEmptyString(claims.schoolId) ||
    !isNonEmptyString(claims.jti) ||
    !['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(String(claims.status)) ||
    claims.licenseVersion !== 1 ||
    !isNonNegativeInteger(claims.iat) ||
    !isNonNegativeInteger(claims.revision)
  ) {
    throw new LicenseValidationError('LICENSE_CLAIMS_MISMATCH');
  }

  const confirmation = asRecord(claims.cnf);
  if (
    !confirmation ||
    confirmation['jkt'] !== context.publicKeyThumbprint
  ) {
    throw new LicenseValidationError('LICENSE_DEVICE_BINDING_MISMATCH');
  }
  if (claims.revision < context.highestRevision) {
    throw new LicenseValidationError('LICENSE_REVISION_ROLLBACK');
  }
  if (
    context.requestNonce !== undefined &&
    claims.requestNonce !== context.requestNonce
  ) {
    throw new LicenseValidationError('LICENSE_NONCE_MISMATCH');
  }
  if (claims.licenseType === 'SUBSCRIPTION') {
    validateSubscriptionClaims(claims);
  } else if (claims.licenseType === 'PERPETUAL') {
    if (
      'exp' in claims ||
      'paidThrough' in claims ||
      'graceUntil' in claims ||
      'offlineUntil' in claims
    ) {
      throw new LicenseValidationError('LICENSE_PERPETUAL_HAS_EXPIRY');
    }
  } else {
    throw new LicenseValidationError('LICENSE_TYPE_INVALID');
  }

  return claims as unknown as SignedLicenseClaims;
}

function validateSubscriptionClaims(claims: LicenseClaimsRecord): void {
  if (
    !isNonNegativeInteger(claims.exp) ||
    !isIsoUtcDate(claims.paidThrough) ||
    !isIsoUtcDate(claims.graceUntil) ||
    !isIsoUtcDate(claims.offlineUntil)
  ) {
    throw new LicenseValidationError('LICENSE_SUBSCRIPTION_DATES_INVALID');
  }

  const paidThrough = Date.parse(claims.paidThrough as string);
  const graceUntil = Date.parse(claims.graceUntil as string);
  const offlineUntil = Date.parse(claims.offlineUntil as string);
  const issuedAt = claims.iat as number;
  if (
    claims.exp !== Math.floor(offlineUntil / 1000) ||
    paidThrough >= graceUntil ||
    offlineUntil <= issuedAt * 1000 ||
    offlineUntil > graceUntil ||
    offlineUntil / 1000 - issuedAt > MAX_OFFLINE_DURATION_SECONDS
  ) {
    throw new LicenseValidationError('LICENSE_SUBSCRIPTION_DATES_INCOHERENT');
  }
}

function parseJsonPart(part: string, errorCode: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(part)),
    );
    const record = asRecord(parsed);
    if (!record) {
      throw new Error(errorCode);
    }
    return record;
  } catch {
    throw new LicenseValidationError(errorCode);
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new LicenseValidationError('LICENSE_BASE64URL_INVALID');
  }

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (encodeBase64Url(bytes) !== value) {
    throw new LicenseValidationError('LICENSE_BASE64URL_INVALID');
  }
  return bytes;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isIsoUtcDate(value: unknown): value is string {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
