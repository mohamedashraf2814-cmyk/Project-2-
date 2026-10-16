import { mulberry32 } from '../utilities/rng';

/** SYNTHETIC MPU6050-like sample: acceleration in g, angular rate in °/s. Not real sensor data. */
export interface Sample {
  t: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
}

export const SAMPLE_HZ = 20;

export interface FallScript {
  startedAt: number;
}

export class SyntheticMotion {
  private rnd: () => number;
  private script: FallScript | null = null;
  constructor(seed = 42) {
    this.rnd = mulberry32(seed);
  }
  triggerFall(t: number) {
    this.script = { startedAt: t };
  }
  clearFall() {
    this.script = null;
  }
  get fallActive() {
    return this.script !== null;
  }

  sample(t: number): Sample {
    const n = () => (this.rnd() - 0.5) * 2; // -1..1
    if (this.script) {
      const e = t - this.script.startedAt;
      if (e < 0.4) {
        // free-fall: apparent weight close to zero
        return { t, ax: 0.1 * n(), ay: 0.1 * n(), az: 0.15 + 0.05 * n(), gx: 60 + 20 * n(), gy: 40 + 20 * n(), gz: 20 * n() };
      }
      if (e < 0.6) {
        // impact spike
        return { t, ax: 1.4 + 0.3 * n(), ay: 0.6 * n(), az: 2.6 + 0.4 * n(), gx: 150 * n(), gy: 150 * n(), gz: 80 * n() };
      }
      // lying still, gravity now mostly along x (orientation changed)
      return { t, ax: 0.99 + 0.01 * n(), ay: 0.04 * n(), az: 0.06 + 0.02 * n(), gx: 2 * n(), gy: 2 * n(), gz: 2 * n() };
    }
    // walking: gentle periodic acceleration around 1 g (z up)
    const w = Math.sin(2 * Math.PI * 1.8 * t);
    return {
      t,
      ax: 0.08 * Math.sin(2 * Math.PI * 0.9 * t) + 0.02 * n(),
      ay: 0.06 * w + 0.02 * n(),
      az: 1 + 0.18 * w + 0.03 * n(),
      gx: 18 * Math.sin(2 * Math.PI * 0.9 * t) + 2 * n(),
      gy: 12 * w + 2 * n(),
      gz: 6 * Math.sin(2 * Math.PI * 0.45 * t) + 2 * n(),
    };
  }
}

export const mag = (s: Sample) => Math.hypot(s.ax, s.ay, s.az);
export const gyroMag = (s: Sample) => Math.hypot(s.gx, s.gy, s.gz);

export type DetectorState = 'monitoring' | 'freefall' | 'impact' | 'suspected';

export const RULES = {
  freeFallG: 0.5, // |a| below this = free-fall
  impactG: 2.5, // |a| above this within impactWindowS after free-fall = impact
  impactWindowS: 1.0,
  stillBandG: 0.2, // | |a| - 1g | below this = still
  stillGyro: 40, // °/s
  stillHoldS: 2.0,
  tiltDeg: 45, // gravity must have moved at least this far from the calibrated "up" (z) axis
  confirmWindowS: 4.0,
} as const;

export interface FallResult {
  detected: true;
  at: number;
  reason: string;
}

/**
 * Transparent rule-based detector: free-fall → impact → stillness in a changed orientation.
 * It does NOT claim clinical validation, and it outputs a state, not a probability.
 */
export class FallDetector {
  state: DetectorState = 'monitoring';
  private tFree = 0;
  private tImpact = 0;
  private stillSince: number | null = null;

  reset() {
    this.state = 'monitoring';
    this.stillSince = null;
  }

  feed(s: Sample): FallResult | null {
    const m = mag(s);
    switch (this.state) {
      case 'monitoring':
        if (m < RULES.freeFallG) {
          this.state = 'freefall';
          this.tFree = s.t;
        }
        return null;
      case 'freefall':
        if (m > RULES.impactG) {
          this.state = 'impact';
          this.tImpact = s.t;
          this.stillSince = null;
        } else if (s.t - this.tFree > RULES.impactWindowS) this.state = 'monitoring';
        return null;
      case 'impact': {
        if (s.t - this.tImpact > RULES.confirmWindowS) {
          this.state = 'monitoring';
          return null;
        }
        const tilt = (Math.acos(Math.max(-1, Math.min(1, s.az / (m || 1)))) * 180) / Math.PI;
        const still = Math.abs(m - 1) < RULES.stillBandG && gyroMag(s) < RULES.stillGyro && tilt > RULES.tiltDeg;
        if (still) {
          if (this.stillSince == null) this.stillSince = s.t;
          if (s.t - this.stillSince >= RULES.stillHoldS) {
            this.state = 'suspected';
            return { detected: true, at: s.t, reason: `سقوط حر ثم اصطدام (≥${RULES.impactG} g) ثم سكون ≥${RULES.stillHoldS} ث بميل أكبر من ${RULES.tiltDeg}° عن الوضع الرأسي.` };
          }
        } else this.stillSince = null;
        return null;
      }
      case 'suspected':
        return null;
    }
  }
}
