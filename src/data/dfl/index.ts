import { decimalToUnits } from '../../engine/momentum';
import type { EvidenceEvent, Side } from '../../engine/types';

/**
 * Seven professional matches from the DFL IDSSE open dataset (CC BY 4.0,
 * doi:10.6084/m9.figshare.28196177.v1). Only shot time, side and provider xG
 * are bundled; see scripts/research/dfl_to_fixture.py for the conversion.
 * They demonstrate and validate the evidence engine. They are not grassroots data.
 */
interface DflShot {
  readonly t: number;
  readonly side: Side;
  /** Provider xG as a decimal string, kept exact. */
  readonly xg: string;
}

interface DflFixture {
  readonly match: string;
  readonly source: string;
  readonly sourceSha256: string;
  readonly periods: readonly {
    readonly period: number;
    readonly durationSeconds: number;
    readonly shots: readonly DflShot[];
  }[];
}

export interface DemoPeriod {
  readonly period: number;
  readonly durationSeconds: number;
}

export interface DemoMatch {
  readonly id: string;
  readonly source: string;
  readonly periods: readonly DemoPeriod[];
  /** Provider xG in 1/10,000 units. */
  readonly events: readonly EvidenceEvent[];
}

/** xG is published with four decimals; integer units keep every sum exact. */
export const XG_DECIMALS = 4;

function toDemoMatch(fixture: DflFixture): DemoMatch {
  return {
    id: fixture.match,
    source: fixture.source,
    periods: fixture.periods.map(({ period, durationSeconds }) => ({ period, durationSeconds })),
    events: fixture.periods.flatMap((period) =>
      period.shots.map((shot, index) => ({
        id: `${fixture.match}:${String(period.period)}:${String(index + 1)}`,
        period: period.period,
        t: shot.t,
        side: shot.side,
        weight: decimalToUnits(shot.xg, XG_DECIMALS),
      })),
    ),
  };
}

const fixtures = import.meta.glob<DflFixture>('./DFL-MAT-*.json', {
  eager: true,
  import: 'default',
});

export const demoMatches: readonly DemoMatch[] = Object.keys(fixtures)
  .sort()
  .flatMap((path) => {
    const fixture = fixtures[path];
    return fixture === undefined ? [] : [toDemoMatch(fixture)];
  });
