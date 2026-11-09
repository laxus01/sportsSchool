import { Injectable } from '@angular/core';

import {
  LicenseClockCheckpoint,
  SignedLicenseClaims,
} from './license.models';
import { RuntimeClockReading } from './license-security.plugin';

const MAX_WALL_CLOCK_DRIFT_MS = 5 * 60 * 1000;

export interface LicenseClockEvaluation {
  trustedNowMs: number | null;
  requiresOnlineValidation: boolean;
}

@Injectable({ providedIn: 'root' })
export class LicenseClockService {
  checkpoint(
    claims: SignedLicenseClaims,
    reading: RuntimeClockReading,
  ): LicenseClockCheckpoint {
    this.assertReading(reading);
    return {
      serverTimeMs: claims.iat * 1000,
      wallTimeMs: reading.wallTimeMs,
      elapsedRealtimeMs: reading.elapsedRealtimeMs,
    };
  }

  evaluate(
    checkpoint: LicenseClockCheckpoint,
    reading: RuntimeClockReading,
  ): LicenseClockEvaluation {
    this.assertReading(reading);
    if (
      !Number.isFinite(checkpoint.serverTimeMs) ||
      !Number.isFinite(checkpoint.wallTimeMs) ||
      !Number.isFinite(checkpoint.elapsedRealtimeMs) ||
      reading.elapsedRealtimeMs < checkpoint.elapsedRealtimeMs
    ) {
      return { trustedNowMs: null, requiresOnlineValidation: true };
    }

    const elapsedDelta =
      reading.elapsedRealtimeMs - checkpoint.elapsedRealtimeMs;
    const expectedWallTime = checkpoint.wallTimeMs + elapsedDelta;
    if (
      Math.abs(reading.wallTimeMs - expectedWallTime) >
      MAX_WALL_CLOCK_DRIFT_MS
    ) {
      return { trustedNowMs: null, requiresOnlineValidation: true };
    }

    return {
      trustedNowMs: checkpoint.serverTimeMs + elapsedDelta,
      requiresOnlineValidation: false,
    };
  }

  private assertReading(reading: RuntimeClockReading): void {
    if (
      !Number.isFinite(reading.wallTimeMs) ||
      !Number.isFinite(reading.elapsedRealtimeMs) ||
      reading.wallTimeMs <= 0 ||
      reading.elapsedRealtimeMs < 0
    ) {
      throw new Error('LICENSE_CLOCK_READING_INVALID');
    }
  }
}
