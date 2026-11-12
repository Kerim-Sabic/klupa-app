import { Color, InstancedMesh, Matrix4, Mesh, Quaternion, Texture, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { frameAt } from '../../engine/tracking';
import { PARKED_Y, SPRINT_PLATE, type NumberAtlas } from './figures';
import { createReplayScene, type ReplayScene } from './scene';
import { NIGHT, paintFade } from './sceneParts';
import { shippedTracking, syntheticTracking } from './testTracking';

const real = shippedTracking();
const all = { shape: true, space: true, trail: true };
const none = { shape: false, space: false, trail: false };
const noAtlas = () => null;

function part(scene: ReplayScene, name: string): InstancedMesh {
  const mesh: unknown = scene.players.children.find((child) => child.name === name);
  if (!(mesh instanceof InstancedMesh)) throw new Error(`No instanced mesh called ${name}.`);
  return mesh as InstancedMesh;
}

function pose(mesh: InstancedMesh, slot: number) {
  const matrix = new Matrix4();
  mesh.getMatrixAt(slot, matrix);
  const position = new Vector3();
  const turn = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, turn, scale);
  return { position, scale, forward: new Vector3(1, 0, 0).applyQuaternion(turn) };
}

function drawn(mesh: Mesh): number {
  return mesh.geometry.drawRange.count;
}

describe('createReplayScene', () => {
  it('stands every player where the engine says, and keeps the rest out of sight', () => {
    const scene = createReplayScene(real, NIGHT, noAtlas);
    scene.update({ period: 1, seconds: 600, layers: none, selected: null, markerScale: 1.5 });
    const kit = part(scene, 'kit');
    expect(kit.count).toBe(29);
    const frame = frameAt(real, 1, 600);
    const on = new Set(frame.players.map((p) => p.slot));
    for (const player of frame.players) {
      const { position, scale } = pose(kit, player.slot);
      expect(position.x).toBeCloseTo(player.x, 3);
      expect(position.z).toBeCloseTo(-player.y, 3);
      expect(position.y).toBe(0);
      expect(scale.x).toBeCloseTo(1.5);
      // The plate of their own side is under them; the other side's stays parked.
      const own = pose(part(scene, `plate-${player.side}`), player.slot).position;
      expect(own.x).toBeCloseTo(player.x, 3);
      const other = player.side === 'home' ? 'away' : 'home';
      expect(pose(part(scene, `plate-${other}`), player.slot).position.y).toBe(PARKED_Y);
    }
    for (let slot = 0; slot < 29; slot += 1) {
      if (!on.has(slot)) expect(pose(kit, slot).position.y).toBe(PARKED_Y);
    }
    // Head and tap target ride on the very same matrices as the body.
    expect(part(scene, 'head').instanceMatrix).toBe(kit.instanceMatrix);
    expect(part(scene, 'hit').instanceMatrix).toBe(kit.instanceMatrix);
    expect(scene.ball.visible).toBe(frame.ball !== null);
    expect(scene.ball.position.x).toBeCloseTo(frame.ball?.x ?? 0, 3);
  });

  it('turns a running player to face the way they run', () => {
    const scene = createReplayScene(real, NIGHT, noAtlas);
    scene.update({ period: 1, seconds: 600, layers: none, selected: null });
    const before = frameAt(real, 1, 599.75);
    const now = frameAt(real, 1, 600);
    let checked = 0;
    for (const player of now.players) {
      const was = before.players.find((p) => p.slot === player.slot);
      if (was === undefined) continue;
      const dx = player.x - was.x;
      const dy = player.y - was.y;
      // Only clear runs: slower ones keep whatever facing they had.
      if (Math.hypot(dx, dy) / 0.25 < 3) continue;
      const { forward } = pose(part(scene, 'kit'), player.slot);
      const along = (forward.x * dx - forward.z * dy) / Math.hypot(dx, dy);
      expect(along).toBeGreaterThan(0.7);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rings the chosen player and draws shapes, space and trail only when asked', () => {
    const scene = createReplayScene(real, NIGHT, noAtlas);
    const meshes: Mesh[] = [];
    scene.root.traverse((node) => {
      if (node instanceof Mesh) meshes.push(node as Mesh);
    });
    const showing = () => meshes.filter((m) => drawn(m) > 0 && m.visible && m.parent?.visible);
    scene.update({ period: 1, seconds: 600, layers: all, selected: 5, delta: 1 / 60 });
    const busy = showing().length;
    const at = pose(part(scene, 'kit'), 5).position;
    const ring = meshes.find((m) => m.geometry.type === 'RingGeometry');
    expect(ring?.visible).toBe(true);
    expect(ring?.position.x).toBeCloseTo(at.x);
    expect(ring?.position.z).toBeCloseTo(at.z);
    scene.update({ period: 1, seconds: 600.5, layers: none, selected: null, delta: 1 / 60 });
    expect(ring?.visible).toBe(false);
    expect(busy).toBeGreaterThan(showing().length);
    // Seeking past the end and into the other half never throws.
    scene.update({ period: 2, seconds: 99_999, layers: all, selected: 28 });
    scene.update({ period: 2, seconds: 10, layers: all, selected: null });
  });

  it('draws the shirt numbers from one atlas, and frees everything on dispose', () => {
    const texture = new Texture();
    const free = vi.spyOn(texture, 'dispose');
    const labels: string[] = [];
    const atlas = (shirts: readonly string[]): NumberAtlas => {
      labels.push(...shirts);
      return { texture, columns: 8, rows: 4 };
    };
    const scene = createReplayScene(real, NIGHT, atlas);
    expect(labels).toEqual(real.meta.roster.map((entry) => String(entry.shirt)));
    const numbers = part(scene, 'numbers');
    expect(numbers.instanceMatrix).toBe(part(scene, 'kit').instanceMatrix);
    const cells = numbers.geometry.getAttribute('cell');
    // Slot 9 is the second cell of the second row from the top: row 2 counted from below.
    expect([cells.getX(9), cells.getY(9)]).toEqual([1, 2]);
    scene.dispose();
    expect(free).toHaveBeenCalled();
  });
});

/**
 * Home 9 (slot 1) runs along the pitch at 7.5 m/s for five seconds, then 6.6, then 4; the
 * ball rolls along the halfway line; the other three stand still.
 */
function sprintThenJog() {
  const metres = (f: number) => {
    const t = f / 4;
    if (t <= 5) return 7.5 * t;
    if (t <= 10) return 37.5 + 6.6 * (t - 5);
    return 70.5 + 4 * (t - 10);
  };
  return syntheticTracking(61, (f, c) => {
    if (c === 0) return [-5000, 0];
    if (c === 1) return [-5000 + Math.round(metres(f) * 100), 500];
    if (c === 2) return [5000, 0];
    if (c === 3) return [1000, -500];
    return [0, -3000 + f * 100];
  });
}

describe('sprints and the ball', () => {
  const colourOf = (mesh: InstancedMesh, slot: number) => {
    const colour = new Color();
    mesh.getColorAt(slot, colour);
    return colour.getHexString();
  };

  it('puts a larger white plate under a sprinter, and keeps it until clearly below sprint speed', () => {
    const scene = createReplayScene(sprintThenJog(), NIGHT, noAtlas);
    const plate = part(scene, 'plate-home');
    const at = (seconds: number) => {
      scene.update({ period: 1, seconds, layers: none, selected: null });
      return pose(plate, 1).scale.x;
    };
    expect(at(3)).toBeCloseTo(SPRINT_PLATE);
    expect(colourOf(plate, 1)).toBe(new Color(NIGHT.ink).getHexString());
    // The keeper beside them stands still: team colour, life size.
    expect(pose(plate, 0).scale.x).toBeCloseTo(1);
    expect(colourOf(plate, 0)).toBe(new Color(NIGHT.home).getHexString());
    // 6.6 m/s is under the sprint speed but not clearly: the mark stays.
    expect(at(8)).toBeCloseTo(SPRINT_PLATE);
    expect(at(13)).toBeCloseTo(1);
    expect(colourOf(plate, 1)).toBe(new Color(NIGHT.home).getHexString());
    // Someone who only ever ran 6.6 m/s was never marked.
    const fresh = createReplayScene(sprintThenJog(), NIGHT, noAtlas);
    fresh.update({ period: 1, seconds: 8, layers: none, selected: null });
    expect(pose(part(fresh, 'plate-home'), 1).scale.x).toBeCloseTo(1);
  });

  it('leans a runner into the run and leaves someone standing upright', () => {
    const scene = createReplayScene(sprintThenJog(), NIGHT, noAtlas);
    scene.update({ period: 1, seconds: 3, layers: none, selected: null });
    const up = (slot: number) => {
      const matrix = new Matrix4();
      part(scene, 'kit').getMatrixAt(slot, matrix);
      return new Vector3(0, 1, 0).transformDirection(matrix);
    };
    expect(up(0).y).toBeCloseTo(1);
    // The runner's head is ahead of their feet, along the run (+x).
    expect(up(1).x).toBeGreaterThan(0.15);
    expect(up(1).y).toBeLessThan(1);
  });

  it('draws a short tail behind a moving ball and none behind a still one', () => {
    const drawnMeshes = (scene: ReplayScene) => {
      let count = 0;
      scene.root.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        const mesh = node as Mesh;
        // The rewritten strips (lines, outlines, trails) are plain buffer geometries.
        if (drawn(mesh) > 0 && mesh.geometry.type === 'BufferGeometry') count += 1;
      });
      return count;
    };
    const rolling = createReplayScene(sprintThenJog(), NIGHT, noAtlas);
    rolling.update({ period: 1, seconds: 6, layers: none, selected: null });
    const still = createReplayScene(
      syntheticTracking(61, (_, c) => [c * 1000 - 2000, 0]),
      NIGHT,
      noAtlas,
    );
    still.update({ period: 1, seconds: 6, layers: none, selected: null });
    expect(drawnMeshes(rolling)).toBe(drawnMeshes(still) + 1);
  });
});

describe('paintFade', () => {
  it('is clear over the pitch and solid night at the edge of the ground', () => {
    const pixels = paintFade(105, 68, [4, 7, 10]);
    const alpha = (px: number, py: number) => pixels[(py * 64 + px) * 4 + 3];
    expect(alpha(32, 32)).toBe(0);
    expect(alpha(20, 40)).toBe(0);
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(63, 32)).toBeGreaterThan(200);
    expect(Array.from(pixels.slice(0, 3))).toEqual([4, 7, 10]);
  });
});
