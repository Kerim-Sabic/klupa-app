import { CircleDashed, EyeOff, Footprints } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { smoothPoses, type ShotAnalysis, type StrikeFound } from '../../engine/pose';
import { Card, CardTitle, Pill } from '../../ui';
import type { DetectedFrame } from './detector';
import { trailRange } from './draw';
import { formatMeasurement, formatNumber, formatSeconds } from './format';
import { LimitsNote } from './LimitsNote';
import { MeasurementList } from './MeasurementList';
import { promptsFor } from './prompts';
import { Scrubber } from './Scrubber';
import { SkeletonPanel } from './SkeletonPanel';
import { VideoStage } from './VideoStage';

export interface ResultViewProps {
  readonly frames: readonly DetectedFrame[];
  readonly analysis: ShotAnalysis;
  readonly videoUrl: string | null;
  readonly source: 'video' | 'example' | 'live';
  readonly truncated: boolean;
}

function useStrikeSummary(result: StrikeFound | null): string {
  const { t, i18n } = useTranslation();
  if (result === null) return t('shotlab.view3d.noStrikeSummary');
  const read = (id: string) => {
    const m = result.measurements.find((x) => x.id === id);
    return m === undefined ? '' : formatMeasurement(m, i18n.language);
  };
  return t('shotlab.view3d.summary', {
    foot: t(`shotlab.foot.${result.foot}`),
    knee: read('kneeAtStrike'),
    lean: read('trunkLeanForward'),
    plantBack: read('plantFrontBack'),
    plantSide: read('plantSideways'),
  });
}

/** Everything after the analysis: clip and skeleton, 3D view, measurements and limits. */
export function ResultView({ frames, analysis, videoUrl, source, truncated }: ResultViewProps) {
  const { t, i18n } = useTranslation();
  const strike = analysis.kind === 'strike' ? analysis : null;
  const [index, setIndex] = useState(strike?.strikeFrame ?? 0);
  const poses = useMemo(() => smoothPoses(frames), [frames]);
  const times = useMemo(() => frames.map((f) => f.time), [frames]);
  const summary = useStrikeSummary(strike);
  const prompts = useMemo(() => (strike === null ? [] : promptsFor(strike.measurements)), [strike]);
  const stageRef = useRef<HTMLElement>(null);
  const showFrame = useCallback((frame: number) => {
    setIndex(frame);
    // Bring the clip into view so the coach sees the frame the number came from.
    const stage = stageRef.current;
    if (stage !== null && typeof stage.scrollIntoView === 'function') {
      stage.scrollIntoView({ block: 'nearest' });
    }
  }, []);
  const foot = strike?.foot ?? null;
  const trail =
    strike === null
      ? null
      : trailRange(strike.backswingFrame, strike.strikeFrame, strike.followThroughFrame, index);
  const fullTrail =
    strike === null
      ? null
      : trailRange(
          strike.backswingFrame,
          strike.strikeFrame,
          strike.followThroughFrame,
          frames.length,
        );

  return (
    <div className="flex flex-col gap-6">
      <Verdict analysis={analysis} source={source} truncated={truncated} times={times} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section
          ref={stageRef}
          aria-labelledby="shotlab-clip-title"
          className="flex flex-col gap-3"
        >
          <h2 id="shotlab-clip-title" className="text-[17px] font-semibold text-ink">
            {t(`shotlab.stage.titles.${source}`)}
          </h2>
          <VideoStage
            frames={frames}
            poses={source === 'video' ? [] : poses}
            index={index}
            videoUrl={videoUrl}
            foot={foot}
            trail={trail}
          />
          <Scrubber
            times={times}
            index={index}
            onChange={setIndex}
            marks={
              strike === null
                ? null
                : {
                    backswing: strike.backswingFrame,
                    strike: strike.strikeFrame,
                    follow: strike.followThroughFrame,
                  }
            }
            speeds={strike?.footSpeed ?? null}
          />
        </section>
        {analysis.kind !== 'not-seen' && poses.length > 0 && (
          <section aria-labelledby="shotlab-3d-title" className="flex flex-col gap-3">
            <h2 id="shotlab-3d-title" className="text-[17px] font-semibold text-ink">
              {t('shotlab.view3d.title')}
            </h2>
            <SkeletonPanel
              poses={poses}
              index={index}
              foot={foot}
              trail={fullTrail}
              summary={summary}
            />
          </section>
        )}
      </div>
      {strike !== null && (
        <section aria-labelledby="shotlab-m-title" className="flex flex-col gap-3">
          <div>
            <h2 id="shotlab-m-title" className="text-[22px] font-semibold text-ink">
              {t('shotlab.m.title')}
            </h2>
            <p className="mt-1 max-w-prose text-[15px] text-ink-soft">
              {t('shotlab.m.intro', {
                confidence: formatNumber(strike.confidence * 100, 0, i18n.language),
              })}
            </p>
          </div>
          <MeasurementList
            measurements={strike.measurements}
            prompts={prompts}
            onShowFrame={showFrame}
          />
        </section>
      )}
      <LimitsNote />
    </div>
  );
}

function Verdict({
  analysis,
  source,
  truncated,
  times,
}: {
  analysis: ShotAnalysis;
  source: 'video' | 'example' | 'live';
  truncated: boolean;
  times: readonly number[];
}) {
  const { t, i18n } = useTranslation();
  const pills = (
    <div className="flex flex-wrap gap-2">
      {source === 'example' && <Pill tone="ink">{t('shotlab.verdict.example')}</Pill>}
      {source === 'live' && <Pill tone="ink">{t('shotlab.verdict.live')}</Pill>}
      {truncated && <Pill tone="amber">{t('shotlab.verdict.truncated')}</Pill>}
    </div>
  );
  if (analysis.kind === 'strike') {
    return (
      <Card as="section" aria-live="polite" className="flex flex-col gap-3">
        {pills}
        <div className="flex items-start gap-3">
          <Footprints aria-hidden="true" size={28} className="mt-1 shrink-0 text-pitch" />
          <div>
            <CardTitle>
              {t(
                analysis.foot === 'left'
                  ? 'shotlab.verdict.foundLeft'
                  : 'shotlab.verdict.foundRight',
                {
                  time: formatSeconds(times[analysis.strikeFrame] ?? 0, i18n.language),
                },
              )}
            </CardTitle>
            <p className="mt-1 text-[15px] text-ink-soft">
              {promptsFor(analysis.measurements).length === 0
                ? t('shotlab.verdict.nothingStandsOut')
                : t('shotlab.verdict.prompts', { count: promptsFor(analysis.measurements).length })}
            </p>
          </div>
        </div>
      </Card>
    );
  }
  const reasons =
    analysis.kind === 'not-seen'
      ? analysis.reasons.map((r) => t(`shotlab.notSeen.${r}`))
      : [t(`shotlab.noStrike.${analysis.reason}`)];
  return (
    <Card as="section" aria-live="polite" className="flex flex-col gap-3">
      {pills}
      <div className="flex items-start gap-3">
        {analysis.kind === 'not-seen' ? (
          <EyeOff aria-hidden="true" size={28} className="mt-1 shrink-0 text-amber" />
        ) : (
          <CircleDashed aria-hidden="true" size={28} className="mt-1 shrink-0 text-mute" />
        )}
        <div>
          <CardTitle>
            {t(analysis.kind === 'not-seen' ? 'shotlab.notSeen.title' : 'shotlab.noStrike.title')}
          </CardTitle>
          <ul className="mt-2 list-disc pl-5 text-[15px] text-ink-soft">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="mt-2 text-[15px] text-ink">{t('shotlab.start.tips')}</p>
        </div>
      </div>
    </Card>
  );
}
