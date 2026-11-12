/** Which team an observation favours. `home` is "us" in a coach's own match. */
export type Side = 'home' | 'away';

export const SIDES: readonly Side[] = ['home', 'away'];

/**
 * One observed, source-linked piece of match evidence (a shot, a tagged chance,
 * a recovery). The engine never invents events and never looks ahead of `t`.
 */
export interface EvidenceEvent {
  /** Stable identifier so every number on screen can be traced to its source. */
  readonly id: string;
  /** 1-based period index. Trailing windows reset at each period start. */
  readonly period: number;
  /** Seconds since the start of the period. */
  readonly t: number;
  readonly side: Side;
  /**
   * Non-negative integer weight. Provider xG is stored in 1/10,000 units and
   * coach tags as whole points, so sums and comparisons are exact.
   */
  readonly weight: number;
}

/** +1 favours home, -1 favours away, 0 is level or empty. */
export type Lean = -1 | 0 | 1;

/** Stable, machine-readable failure codes for invalid engine input. */
export type EngineErrorCode =
  'INVALID_EVENT' | 'INVALID_WINDOW' | 'INVALID_GRID' | 'INVALID_DECIMAL' | 'INVALID_EXPOSURE';

export class EngineError extends RangeError {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
