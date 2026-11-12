import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type Material,
  type Texture,
} from 'three';
import { LAW, pitchMarkings } from './pitch';
import { ribbonFloats, ribbonInto } from './ribbon';

/** What the 3D scene is painted with, as concrete colours. */
export interface SceneColors {
  /** Everything beyond the pitch, and the canvas behind it. */
  readonly sky: string;
  readonly grass: string;
  readonly line: string;
  readonly home: string;
  readonly away: string;
  /** The ball, the goals, the chosen player's ring and trail. */
  readonly ink: string;
  readonly head: string;
}

/**
 * The replay is a night match in both themes: a lit pitch on a dark stage, so the canvas is
 * never a pale rectangle on a dark page. The two kit colours are the dark theme's.
 */
export const NIGHT: SceneColors = {
  sky: '#04070a',
  grass: '#1c6b3a',
  line: '#f3f6f1',
  home: '#6aa5ff',
  away: '#c4a6ff',
  ink: '#f5f5f7',
  head: '#efe6da',
};

/** How far the lit grass runs past the lines before it fades into the dark, in metres. */
const APRON = 26;
const FADE_PX = 64;

/**
 * The fall-off of the floodlights as one small texture: clear over the pitch, then the
 * colour of the night, fully opaque at the edge of the ground.
 */
export function paintFade(
  length: number,
  width: number,
  sky: readonly [number, number, number],
): Uint8Array {
  const pixels = new Uint8Array(FADE_PX * FADE_PX * 4);
  for (let py = 0; py < FADE_PX; py += 1) {
    for (let px = 0; px < FADE_PX; px += 1) {
      const x = ((px + 0.5) / FADE_PX - 0.5) * (length + 2 * APRON);
      const y = ((py + 0.5) / FADE_PX - 0.5) * (width + 2 * APRON);
      // Metres past the nearest touchline or goal line; 0 anywhere on the pitch.
      const out = Math.max(0, Math.abs(x) - length / 2 - 3, Math.abs(y) - width / 2 - 3);
      const t = Math.min(1, out / (APRON - 5));
      const at = (py * FADE_PX + px) * 4;
      pixels[at] = sky[0];
      pixels[at + 1] = sky[1];
      pixels[at + 2] = sky[2];
      pixels[at + 3] = Math.round(255 * t * t * (3 - 2 * t));
    }
  }
  return pixels;
}

/** A buffer-backed mesh whose triangles are rewritten in place each frame. */
export function dynamicMesh(floats: number, material: Material): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(floats), 3));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function setDrawn(mesh: Mesh, floats: number): void {
  const attribute = mesh.geometry.getAttribute('position');
  attribute.needsUpdate = true;
  mesh.geometry.setDrawRange(0, floats / 3);
}

export function positionsOf(mesh: Mesh): Float32Array {
  const array = mesh.geometry.getAttribute('position').array;
  return array instanceof Float32Array ? array : new Float32Array(0);
}

export function flat(color: string | Color, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: DoubleSide,
    depthWrite: opacity >= 1,
  });
}

/** Grass with mowing bands, every marking as a painted strip, and both goals, to scale. */
export function buildPitch(length: number, width: number, colors: SceneColors): Group {
  const root = new Group();
  const ground = new Mesh(new PlaneGeometry(1600, 1600), flat(colors.sky));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  root.add(ground);
  const grass = new Mesh(
    new PlaneGeometry(length + 2 * APRON, width + 2 * APRON),
    flat(colors.grass),
  );
  grass.rotation.x = -Math.PI / 2;
  root.add(grass);
  const sky = new Color(colors.sky);
  const fade = new DataTexture(
    paintFade(length, width, [sky.r * 255, sky.g * 255, sky.b * 255]),
    FADE_PX,
    FADE_PX,
  );
  fade.magFilter = LinearFilter;
  fade.needsUpdate = true;
  const dark = new Mesh(
    new PlaneGeometry(length + 2 * APRON, width + 2 * APRON),
    new MeshBasicMaterial({ map: fade, transparent: true, depthWrite: false }),
  );
  dark.rotation.x = -Math.PI / 2;
  dark.position.y = 0.008;
  root.add(dark);
  // Mowing bands, darkened in linear light.
  const stripe = new Color(colors.grass).multiplyScalar(0.8);
  const stripes = new Group();
  for (let i = 0; i < 18; i += 2) {
    const band = new Mesh(new PlaneGeometry(length / 18, width), flat(stripe));
    band.rotation.x = -Math.PI / 2;
    band.position.set(-length / 2 + (i + 0.5) * (length / 18), 0.005, 0);
    stripes.add(band);
  }
  root.add(stripes);

  const markings = pitchMarkings(length, width);
  const lineFloats = markings.lines.reduce((sum, l) => sum + ribbonFloats(l.length), 0);
  const lines = dynamicMesh(lineFloats, flat(colors.line, 0.85));
  let written = 0;
  for (const line of markings.lines) {
    const xy = line.flatMap((p) => [p.x, p.y]);
    written += ribbonInto(
      xy,
      line.length,
      { width: 0.14, height: 0.02 },
      positionsOf(lines),
      written,
    );
  }
  setDrawn(lines, written);
  root.add(lines);
  for (const spot of markings.spots) {
    const dot = new Mesh(new CircleGeometry(0.2, 16), flat(colors.line, 0.85));
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(spot.x, 0.02, -spot.y);
    root.add(dot);
  }

  const frame = new MeshStandardMaterial({ color: colors.ink, roughness: 0.5 });
  const net = new MeshBasicMaterial({
    color: colors.ink,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  for (const end of [-1, 1]) {
    const goal = new Group();
    const post = new BoxGeometry(0.12, LAW.goalHeight, 0.12);
    for (const side of [-1, 1]) {
      const upright = new Mesh(post, frame);
      upright.position.set(0, LAW.goalHeight / 2, (side * LAW.goalWidth) / 2);
      goal.add(upright);
    }
    const bar = new Mesh(new BoxGeometry(0.12, 0.12, LAW.goalWidth + 0.12), frame);
    bar.position.set(0, LAW.goalHeight, 0);
    goal.add(bar);
    const mesh = new Mesh(new BoxGeometry(2, LAW.goalHeight, LAW.goalWidth, 4, 5, 14), net);
    mesh.position.set(end, LAW.goalHeight / 2, 0);
    goal.add(mesh);
    goal.position.set((end * length) / 2, 0, 0);
    root.add(goal);
  }
  return root;
}

function mapOf(material: Material): Texture | null {
  if (material instanceof MeshBasicMaterial) return material.map;
  if (!(material instanceof ShaderMaterial)) return null;
  const value: unknown = material.uniforms.map?.value;
  return typeof value === 'object' && value !== null && 'dispose' in value
    ? (value as Texture)
    : null;
}

/** Free every geometry, material and texture under the given groups. */
export function disposeAll(groups: readonly Group[]): void {
  for (const group of groups) {
    group.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const drawn = node as Mesh;
      drawn.geometry.dispose();
      const material: Material | Material[] = drawn.material;
      for (const each of Array.isArray(material) ? material : [material]) {
        mapOf(each)?.dispose();
        each.dispose();
      }
    });
  }
}
