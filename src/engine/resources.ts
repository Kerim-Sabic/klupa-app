import { isIsoDate } from './load';
import { EngineError } from './types';

/*
 * Facility and resource use from the same session records the coach already
 * keeps: how much of the booked pitch was actually needed, and what floodlit
 * training roughly costs.
 *
 * Energy, cost and emissions are ESTIMATES built only from numbers the club
 * types in (lamp power, tariff, grid factor). Each is null until its inputs are
 * supplied; nothing is guessed or defaulted, and `isEstimate` is always true so
 * a screen cannot present them as metered readings.
 */

export type PitchArea = 'quarter' | 'half' | 'full';

export interface PitchSession {
  readonly id: string;
  /** Calendar date, 'YYYY-MM-DD'. */
  readonly date: string;
  readonly durationMinutes: number;
  /** How much of the pitch was booked. */
  readonly area: PitchArea;
  /** Children who attended. A count, never names. */
  readonly attended: number;
  readonly floodlit: boolean;
}

export interface ResourceSettings {
  /** Total floodlight power in kW, or null if the club has not said. */
  readonly floodlightKw: number | null;
  /** Price per kWh in the club's currency, or null. */
  readonly tariffPerKwh: number | null;
  /** Grid emissions factor in kg CO2 per kWh, or null. */
  readonly gridKgCo2PerKwh: number | null;
  /** Players who train comfortably on a full pitch. Default 22. */
  readonly comfortablePlayersFullPitch?: number;
}

export interface RightSizedSession {
  readonly sessionId: string;
  readonly date: string;
  readonly booked: PitchArea;
  /** The smallest area the attendance would have fitted in. */
  readonly wouldFit: PitchArea;
  readonly attended: number;
  readonly pitchHoursFreed: number;
}

export interface ResourceSummary {
  /** Booked pitch time weighted by area: quarter 0.25, half 0.5, full 1. */
  readonly pitchHours: number;
  readonly playerHours: number;
  /** Null when no pitch time was booked. */
  readonly playersPerPitchHour: number | null;
  /** Hours of floodlit sessions, unweighted by area. */
  readonly floodlitHours: number;
  readonly estimatedKwh: number | null;
  readonly estimatedCost: number | null;
  readonly estimatedKgCo2: number | null;
  /** Always true: these figures come from typed-in factors, not meters. */
  readonly isEstimate: true;
  readonly rightSizing: {
    readonly sessions: readonly RightSizedSession[];
    readonly pitchHoursFreed: number;
  };
}

const SHARE: Readonly<Record<PitchArea, number>> = { quarter: 0.25, half: 0.5, full: 1 };
/** Smallest first, so the first area that fits is the smallest that fits. */
const SMALLEST_FIRST: readonly PitchArea[] = ['quarter', 'half', 'full'];

function assertSession(session: PitchSession): void {
  const fail = (what: string): never => {
    throw new EngineError('INVALID_EXPOSURE', `Session ${session.id}: ${what}`);
  };
  if (session.id.length === 0) {
    throw new EngineError('INVALID_EXPOSURE', 'Session needs an id.');
  }
  if (!isIsoDate(session.date)) fail("date must be a real 'YYYY-MM-DD' date.");
  if (!Number.isFinite(session.durationMinutes) || session.durationMinutes < 0) {
    fail('duration must be 0 or more minutes.');
  }
  if (!Number.isSafeInteger(session.attended) || session.attended < 0) {
    fail('attended must be a whole number, 0 or more.');
  }
  if (!SMALLEST_FIRST.includes(session.area)) fail('unknown pitch area.');
}

function assertFactor(name: string, value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new EngineError('INVALID_EXPOSURE', `${name} must be 0 or more, or not set.`);
  }
}

function scaled(factor: number | null, base: number | null): number | null {
  return factor === null || base === null ? null : factor * base;
}

/**
 * Summarise pitch use and, where the club supplied factors, floodlight energy.
 *
 * Floodlight energy assumes the lights cover the whole pitch whatever share was
 * booked: a quarter-pitch session under floodlights still lights every lamp, so
 * kWh = floodlightKw x floodlit hours, not weighted by area.
 *
 * Right-sizing lists sessions whose attendance would have fitted a smaller
 * area at the comfortable capacity (full x share). It is a prompt about
 * booking habits, not a verdict on any session.
 */
export function summariseResources(
  sessions: readonly PitchSession[],
  settings: ResourceSettings,
): ResourceSummary {
  const comfortable = settings.comfortablePlayersFullPitch ?? 22;
  if (!Number.isFinite(comfortable) || comfortable <= 0) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      'Comfortable players on a full pitch must be above 0.',
    );
  }
  assertFactor('floodlightKw', settings.floodlightKw);
  assertFactor('tariffPerKwh', settings.tariffPerKwh);
  assertFactor('gridKgCo2PerKwh', settings.gridKgCo2PerKwh);
  sessions.forEach(assertSession);

  let pitchMinutes = 0;
  let playerMinutes = 0;
  let floodlitMinutes = 0;
  let freedMinutes = 0;
  const flagged: RightSizedSession[] = [];

  for (const session of sessions) {
    const share = SHARE[session.area];
    pitchMinutes += share * session.durationMinutes;
    playerMinutes += session.attended * session.durationMinutes;
    if (session.floodlit) floodlitMinutes += session.durationMinutes;

    const fit = SMALLEST_FIRST.find((area) => session.attended <= comfortable * SHARE[area]);
    if (fit !== undefined && SHARE[fit] < share) {
      const freed = (share - SHARE[fit]) * session.durationMinutes;
      freedMinutes += freed;
      flagged.push({
        sessionId: session.id,
        date: session.date,
        booked: session.area,
        wouldFit: fit,
        attended: session.attended,
        pitchHoursFreed: freed / 60,
      });
    }
  }

  const pitchHours = pitchMinutes / 60;
  const floodlitHours = floodlitMinutes / 60;
  const estimatedKwh = scaled(settings.floodlightKw, floodlitHours);
  return {
    pitchHours,
    playerHours: playerMinutes / 60,
    playersPerPitchHour: pitchHours === 0 ? null : playerMinutes / 60 / pitchHours,
    floodlitHours,
    estimatedKwh,
    estimatedCost: scaled(settings.tariffPerKwh, estimatedKwh),
    estimatedKgCo2: scaled(settings.gridKgCo2PerKwh, estimatedKwh),
    isEstimate: true,
    rightSizing: { sessions: flagged, pitchHoursFreed: freedMinutes / 60 },
  };
}
