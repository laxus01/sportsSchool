import { describe, expect, it } from 'vitest';

import { SignedLicenseClaims } from './license.models';
import { LicenseClockService } from './license-clock.service';

const CLAIMS = {
  iat: 1_800_000_000,
} as SignedLicenseClaims;

describe('LicenseClockService', () => {
  it('advances signed server time from Android monotonic time', () => {
    const service = new LicenseClockService();
    const checkpoint = service.checkpoint(CLAIMS, {
      wallTimeMs: 1_800_000_000_000,
      elapsedRealtimeMs: 100_000,
    });

    expect(
      service.evaluate(checkpoint, {
        wallTimeMs: 1_800_000_060_000,
        elapsedRealtimeMs: 160_000,
      }),
    ).toEqual({
      trustedNowMs: 1_800_000_060_000,
      requiresOnlineValidation: false,
    });
  });

  it('requires online validation after reboot or a civil-clock change', () => {
    const service = new LicenseClockService();
    const checkpoint = service.checkpoint(CLAIMS, {
      wallTimeMs: 1_800_000_000_000,
      elapsedRealtimeMs: 100_000,
    });

    expect(
      service.evaluate(checkpoint, {
        wallTimeMs: 1_800_000_060_000,
        elapsedRealtimeMs: 10_000,
      }).requiresOnlineValidation,
    ).toBe(true);
    expect(
      service.evaluate(checkpoint, {
        wallTimeMs: 1_800_600_000_000,
        elapsedRealtimeMs: 160_000,
      }).requiresOnlineValidation,
    ).toBe(true);
  });
});
