import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { GoalSequence } from '../../engine/pro';
import { Spinner } from '../../ui';
import { ProPitch, toPitch } from './ProPitch';
import { ballPath, pathAt } from './replayModel';

// three.js is only downloaded when someone switches a replay to 3D.
const GoalReplay3D = lazy(async () => ({ default: (await import('./GoalReplay3D')).GoalReplay3D }));

const STROKE = ['stroke-home', 'stroke-away'] as const;
const FILL = ['fill-home', 'fill-away'] as const;

/** A lost or refused WebGL context falls back to the flat pitch instead of breaking the card. */
class ViewBoundary extends Component<
  { readonly fallback: ReactNode; readonly children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface ReplayViewProps {
  readonly sequence: GoalSequence;
  readonly progress: number;
  readonly label: string;
  readonly mode: '2d' | '3d';
  readonly reduced: boolean;
}

/** The build-up on a flat pitch, drawn up to `progress`. */
function FlatReplay({ sequence, progress, label }: Omit<ReplayViewProps, 'mode' | 'reduced'>) {
  const team = sequence.goal.team;
  const { ball, drawn } = pathAt(ballPath(sequence.steps), progress);
  return (
    <ProPitch label={label}>
      {drawn.length > 1 && (
        <polyline
          points={drawn
            .map((p) => {
              const q = toPitch(p);
              return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
            })
            .join(' ')}
          className={`fill-none ${STROKE[team]}`}
          strokeWidth={0.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {sequence.steps.map((step) => {
        const q = toPitch(step.from);
        return (
          <circle
            key={step.index}
            cx={q.x}
            cy={q.y}
            r={0.9}
            className={`${FILL[team]} stroke-raised`}
            strokeWidth={0.3}
          />
        );
      })}
      {ball !== null && (
        <circle
          cx={toPitch(ball).x}
          cy={toPitch(ball).y}
          r={1.5}
          className="fill-raised stroke-ink"
          strokeWidth={0.45}
        />
      )}
    </ProPitch>
  );
}

/** The flat drawing, or the 3D scene with the same words for a screen reader. */
export function ReplayView(props: ReplayViewProps) {
  const flat = (
    <FlatReplay sequence={props.sequence} progress={props.progress} label={props.label} />
  );
  if (props.mode === '2d') return flat;
  return (
    <div role="img" aria-label={props.label}>
      <ViewBoundary fallback={flat}>
        <Suspense
          fallback={
            <div className="grid aspect-[16/10] place-items-center rounded-control bg-pitch-soft">
              <Spinner />
            </div>
          }
        >
          <GoalReplay3D
            steps={props.sequence.steps}
            team={props.sequence.goal.team}
            progress={props.progress}
            reduced={props.reduced}
          />
        </Suspense>
      </ViewBoundary>
    </div>
  );
}
