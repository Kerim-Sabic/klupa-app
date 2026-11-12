import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import type { Tracking } from '../../engine/tracking';
import { createFigures, type AtlasMaker } from './figures';
import { createHullScratch, hullInto } from './hull';
import type { Layers } from './LayerPanel';
import { TRAIL_SECONDS } from './model';
import {
  createHeadings,
  createPositions,
  headingsInto,
  samplePositions,
  trailCapacity,
  trailInto,
} from './motion';
import { fanInto, ribbonFloats, ribbonInto } from './ribbon';
import { buildPitch, disposeAll, dynamicMesh, flat, positionsOf, setDrawn } from './sceneParts';
import type { SceneColors } from './sceneParts';
import { spaceInto } from './space';
import { paintSpace } from './spaceTexture';

export type { SceneColors } from './sceneParts';

export interface SceneState {
  readonly period: number;
  readonly seconds: number;
  readonly layers: Layers;
  readonly selected: number | null;
  /** Figures and numbers drawn larger than life on a small screen, so they stay readable. */
  readonly markerScale?: number;
  /** Wall seconds since the last frame: players turn over time. Left out, they turn at once. */
  readonly delta?: number;
}

export interface ReplayScene {
  /** Pitch, overlays and the ball. */
  readonly root: Group;
  /** The players, kept apart so only they answer a tap; instance n is roster slot n. */
  readonly players: Group;
  /** Where the ball is (x, z), and whether it is on the pitch: the follow camera reads it. */
  readonly ball: Group;
  update(state: SceneState): void;
  dispose(): void;
}

const MAX_OUTFIELD = 16;
/** A player's facing is read from where they were this long ago. */
const HEADING_WINDOW = 0.3;
/** Radians of forward lean per metre a second, and the most a sprinter leans. */
const LEAN_PER_SPEED = 0.035;
const MAX_LEAN = 0.3;
/**
 * A player is shown as sprinting from the physical report's sprint speed (7 m/s, 25.2 km/h)
 * and stays so until clearly below it, so a run at the threshold does not flicker. Read over
 * the same short window as the facing, from four positions a second: a picture of who is
 * sprinting now, not a count of sprints (the physical report counts those from 25 Hz data).
 */
export const SPRINT_ON = 7;
export const SPRINT_OFF = 6.3;
/** The ball leaves a short tail, so a pass can be followed by eye. */
const BALL_TAIL_SECONDS = 1.5;
/**
 * The space-control grid of the 3D pitch: cells of about 1.7 m, four times as fine as the
 * grid the share in the panel is counted on, so the border between the teams is a line
 * rather than a staircase. One 252 x 164 texture, repainted ten times a match second.
 */
const FINE_COLS = 63;
const FINE_ROWS = 41;
const FINE_CELL_PX = 4;
const SPACE_UPDATES_PER_SECOND = 10;
const DASH = { on: 2.2, off: 1.4 } as const;
// Made once: the frame loop hands these to the ribbon writer instead of building new ones.
const OUTLINE = { width: 0.32, height: 0.05 } as const;
const OUTLINES = {
  home: [
    { ...OUTLINE, closed: false, dash: null },
    { ...OUTLINE, closed: true, dash: null },
  ],
  away: [
    { ...OUTLINE, closed: false, dash: DASH },
    { ...OUTLINE, closed: true, dash: DASH },
  ],
} as const;
const TRAIL = { width: 0.45, height: 0.04 } as const;
const BALL_TAIL = { width: 0.24, height: 0.035 } as const;

/**
 * Build the whole 3D match once: the lit pitch, markings and goals to scale, a figure per
 * roster slot, the ball, and buffers for the layers. `update` only moves and rewrites; it
 * allocates nothing, so it can run every animation frame.
 */
export function createReplayScene(
  tracking: Tracking,
  colors: SceneColors,
  makeAtlas: AtlasMaker,
): ReplayScene {
  const { lengthMetres: length, widthMetres: width } = tracking.meta.pitch;
  const roster = tracking.meta.roster;
  const root = new Group();

  root.add(buildPitch(length, width, colors));
  const pixels = new Uint8Array(FINE_COLS * FINE_CELL_PX * FINE_ROWS * FINE_CELL_PX * 4);
  const space = new DataTexture(pixels, FINE_COLS * FINE_CELL_PX, FINE_ROWS * FINE_CELL_PX);
  space.magFilter = LinearFilter;
  space.colorSpace = SRGBColorSpace;
  const spacePlane = new Mesh(
    new PlaneGeometry(length, width),
    new MeshBasicMaterial({ map: space, transparent: true, depthWrite: false }),
  );
  spacePlane.rotation.x = -Math.PI / 2;
  spacePlane.position.y = 0.012;
  root.add(spacePlane);

  const figures = createFigures(roster, colors, makeAtlas);
  const chosen = new Mesh(new RingGeometry(1.75, 2.2, 40), flat(colors.ink));
  chosen.rotation.x = -Math.PI / 2;
  chosen.position.y = 0.04;
  root.add(chosen);

  const ball = new Group();
  const ballBody = new Mesh(
    new SphereGeometry(0.6, 20, 14),
    new MeshStandardMaterial({ color: colors.ink, roughness: 0.4 }),
  );
  ballBody.position.y = 0.6;
  const ballShadow = new Mesh(new CircleGeometry(0.75, 24), flat('#000000', 0.3));
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.025;
  ball.add(ballBody, ballShadow);
  root.add(ball);

  const perimeter = 2 * (length + width);
  const shapes = (['home', 'away'] as const).map((side) => {
    const color = side === 'home' ? colors.home : colors.away;
    const fill = dynamicMesh(MAX_OUTFIELD * 9, flat(color, 0.16));
    const outline = dynamicMesh(ribbonFloats(MAX_OUTFIELD, DASH, perimeter), flat(color, 0.95));
    const centre =
      side === 'home'
        ? new Mesh(new CylinderGeometry(0.9, 0.9, 0.12, 24), flat(color))
        : new Mesh(new BoxGeometry(1.5, 0.12, 1.5), flat(color));
    if (side === 'away') centre.rotation.y = Math.PI / 4;
    centre.position.y = 0.06;
    const group = new Group();
    group.add(fill, outline, centre);
    root.add(group);
    return { side, fill, outline, centre, group };
  });

  const trailBuffer = new Float32Array(trailCapacity(tracking, TRAIL_SECONDS) * 2);
  const trail = dynamicMesh(ribbonFloats(trailBuffer.length / 2), flat(colors.ink, 0.85));
  root.add(trail);
  const tailBuffer = new Float32Array(trailCapacity(tracking, BALL_TAIL_SECONDS) * 2);
  const tail = dynamicMesh(ribbonFloats(tailBuffer.length / 2), flat(colors.ink, 0.4));
  root.add(tail);
  const sprinting = new Uint8Array(roster.length);

  const positions = createPositions(tracking);
  const earlier = createPositions(tracking);
  const headings = createHeadings(tracking);
  const isHome = Uint8Array.from(roster, (entry) => (entry.side === 'home' ? 1 : 0));
  const owners = new Uint8Array(FINE_COLS * FINE_ROWS);
  const outfieldXY = new Float32Array(MAX_OUTFIELD * 2);
  const hullXY = new Float32Array(MAX_OUTFIELD * 2);
  const hullScratch = createHullScratch(MAX_OUTFIELD);
  let spaceKey = -1;
  let lastPeriod = 0;
  let lastSeconds = 0;

  function updateShapes(period: number): void {
    const keepers = tracking.keepers[period - 1];
    for (const shape of shapes) {
      const home = shape.side === 'home' ? 1 : 0;
      const keeper = keepers?.[shape.side];
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      for (let slot = 0; slot < isHome.length && count < MAX_OUTFIELD; slot += 1) {
        if (isHome[slot] !== home || slot === keeper || positions.present[slot] !== 1) continue;
        const x = positions.xy[slot * 2] ?? 0;
        const y = positions.xy[slot * 2 + 1] ?? 0;
        outfieldXY[count * 2] = x;
        outfieldXY[count * 2 + 1] = y;
        sumX += x;
        sumY += y;
        count += 1;
      }
      const corners = hullInto(outfieldXY, count, hullScratch, hullXY);
      const closed = corners >= 3;
      setDrawn(shape.fill, closed ? fanInto(hullXY, corners, 0.016, positionsOf(shape.fill)) : 0);
      setDrawn(
        shape.outline,
        ribbonInto(
          hullXY,
          corners,
          OUTLINES[shape.side][closed ? 1 : 0],
          positionsOf(shape.outline),
        ),
      );
      shape.centre.visible = count > 0;
      shape.centre.position.x = sumX / Math.max(1, count);
      shape.centre.position.z = -sumY / Math.max(1, count);
    }
  }

  function updateSpace(period: number, seconds: number): void {
    // Recomputed as the match plays, but not on every frame: smooth to the eye at a sixth of the work.
    const key = period * 1e7 + Math.floor(seconds * SPACE_UPDATES_PER_SECOND);
    if (key === spaceKey) return;
    spaceKey = key;
    const share = spaceInto(positions, isHome, FINE_COLS, FINE_ROWS, length, width, owners);
    if (share === null) return;
    paintSpace(owners, pixels, colors, FINE_COLS, FINE_ROWS, FINE_CELL_PX);
    space.needsUpdate = true;
  }

  return {
    root,
    players: figures.group,
    ball,
    update({ period, seconds, layers, selected, markerScale = 1, delta }) {
      samplePositions(tracking, period, seconds, positions);
      const back = Math.min(HEADING_WINDOW, Math.max(0, seconds));
      samplePositions(tracking, period, seconds - back, earlier);
      // After a jump in time nobody turns slowly towards where they now run: they face it.
      const jumped = period !== lastPeriod || Math.abs(seconds - lastSeconds) > 1;
      lastPeriod = period;
      lastSeconds = seconds;
      const ease = delta === undefined || jumped ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 9);
      headingsInto(positions, earlier, back, ease, headings);

      chosen.visible = false;
      for (let slot = 0; slot < isHome.length; slot += 1) {
        if (positions.present[slot] !== 1) {
          figures.hide(slot);
          continue;
        }
        const x = positions.xy[slot * 2] ?? 0;
        const z = -(positions.xy[slot * 2 + 1] ?? 0);
        const speed = headings.speed[slot] ?? 0;
        const lean = Math.min(MAX_LEAN, speed * LEAN_PER_SPEED);
        sprinting[slot] = speed >= (sprinting[slot] === 1 ? SPRINT_OFF : SPRINT_ON) ? 1 : 0;
        figures.place(
          slot,
          x,
          z,
          headings.angle[slot] ?? 0,
          lean,
          markerScale,
          sprinting[slot] === 1,
        );
        if (slot === selected) {
          chosen.visible = true;
          chosen.position.x = x;
          chosen.position.z = z;
          chosen.scale.setScalar(markerScale);
        }
      }
      figures.commit();

      const b = tracking.meta.ballColumn;
      ball.visible = positions.present[b] === 1;
      ball.position.set(positions.xy[b * 2] ?? 0, 0, -(positions.xy[b * 2 + 1] ?? 0));
      for (const shape of shapes) shape.group.visible = layers.shape;
      if (layers.shape) updateShapes(period);
      spacePlane.visible = layers.space;
      if (layers.space) updateSpace(period, seconds);
      const count =
        layers.trail && selected !== null
          ? trailInto(tracking, selected, period, seconds, TRAIL_SECONDS, positions, trailBuffer)
          : 0;
      setDrawn(trail, count > 1 ? ribbonInto(trailBuffer, count, TRAIL, positionsOf(trail)) : 0);
      const behind = trailInto(
        tracking,
        b,
        period,
        seconds,
        BALL_TAIL_SECONDS,
        positions,
        tailBuffer,
      );
      setDrawn(tail, behind > 1 ? ribbonInto(tailBuffer, behind, BALL_TAIL, positionsOf(tail)) : 0);
    },
    dispose() {
      disposeAll([root, figures.group]);
    },
  };
}
