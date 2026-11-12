import {
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Side } from '../../engine/types';
import type { SceneColors } from './sceneParts';

/** Head to boot of a figure at scale 1, in metres: larger than life, so it reads from the stand. */
export const FIGURE_HEIGHT = 2.66;
/** How much larger the plate under a sprinting player is drawn. */
export const SPRINT_PLATE = 1.5;
/** Where a player who is off the pitch is kept: far under the grass, outside every camera. */
export const PARKED_Y = -9999;

/** Every shirt number drawn once into one texture, a grid of square cells. */
export interface NumberAtlas {
  readonly texture: Texture;
  readonly columns: number;
  readonly rows: number;
}

/** Draws the atlas for the roster's numbers; null where a 2D canvas is not available (tests). */
export type AtlasMaker = (labels: readonly string[]) => NumberAtlas | null;

export interface FigureEntry {
  readonly side: Side;
  readonly shirt: number;
}

export interface Figures {
  /** Everything that answers a tap. In each instanced mesh, instance n is roster slot n. */
  readonly group: Group;
  /**
   * Stand slot `slot` at (x, z) on the grass, facing `heading` (radians, 0 along +x, turning
   * towards -z) and leaning into the run by `lean` radians. A sprinting player's plate is
   * larger and white, so a sprint shows by size and not by colour alone.
   */
  place(
    slot: number,
    x: number,
    z: number,
    heading: number,
    lean: number,
    scale: number,
    sprinting?: boolean,
  ): void;
  hide(slot: number): void;
  /** After a round of `place` and `hide`: hand the new positions to the GPU. */
  commit(): void;
}

function shaded(geometry: BufferGeometry, shade: number): BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(shade), 3));
  return geometry;
}

/** Shirt, arms and legs as one shape; the shade darkens the legs under the instance's kit colour. */
function kitGeometry(): BufferGeometry {
  const torso = shaded(new CapsuleGeometry(0.4, 0.45, 4, 12), 1);
  // Flat front to back and wide at the shoulders, so the way a player faces is visible.
  torso.scale(0.62, 1, 1.15);
  torso.translate(0, 1.5, 0);
  const parts = [torso];
  for (const side of [-1, 1]) {
    const arm = shaded(new BoxGeometry(0.2, 0.78, 0.17), 0.82);
    arm.translate(0, 1.62, side * 0.58);
    const leg = shaded(new BoxGeometry(0.27, 0.95, 0.24), 0.45);
    leg.translate(0, 0.475, side * 0.2);
    parts.push(arm, leg);
  }
  return mergeGeometries(parts);
}

const NUMBER_VERTEX = `
attribute vec2 cell;
uniform vec2 grid;
uniform float size;
uniform float lift;
uniform float least;
varying vec2 vUv;
void main() {
  float scale = length(instanceMatrix[1].xyz);
  vec4 feet = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  // Never smaller on screen than a set share of the distance: readable from the far stand.
  float side = max(size * scale, -feet.z * least);
  vec3 above = instanceMatrix[3].xyz + vec3(0.0, lift * scale + side * 0.5, 0.0);
  vec4 centre = modelViewMatrix * vec4(above, 1.0);
  centre.xy += position.xy * side;
  gl_Position = projectionMatrix * centre;
  vUv = (uv + cell) / grid;
}`;

const NUMBER_FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(map, vUv);
  if (texel.a < 0.04) discard;
  gl_FragColor = texel;
  #include <colorspace_fragment>
}`;

/** One quad per player that always faces the camera, all drawn in one call from the atlas. */
function numberMaterial(atlas: NumberAtlas): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      map: { value: atlas.texture },
      grid: { value: [atlas.columns, atlas.rows] },
      size: { value: 2.1 },
      lift: { value: FIGURE_HEIGHT + 0.25 },
      least: { value: 0.03 },
    },
    vertexShader: NUMBER_VERTEX,
    fragmentShader: NUMBER_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * The players as instanced figures: a kit-coloured body with arms and legs, a head, a plate
 * on the grass (round for the first-named club, square for the second, so the sides never
 * differ by colour alone), a shirt number that faces the camera and an unseen, generous tap
 * target. Six draw calls for the whole roster, and moving a player writes sixteen numbers.
 */
export function createFigures(
  roster: readonly FigureEntry[],
  colors: SceneColors,
  makeAtlas: AtlasMaker,
): Figures {
  const count = roster.length;
  const group = new Group();
  // Instances move every frame, so three.js is told where they can be instead of measuring.
  const reach = new Sphere(new Vector3(0, 0, 0), 400);
  const instanced = (mesh: InstancedMesh, name: string) => {
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.boundingSphere = reach;
    group.add(mesh);
    return mesh;
  };

  const kit = instanced(
    new InstancedMesh(
      kitGeometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
      count,
    ),
    'kit',
  );
  const tint = new Color();
  roster.forEach((entry, slot) => {
    kit.setColorAt(slot, tint.set(entry.side === 'home' ? colors.home : colors.away));
  });
  const shared = kit.instanceMatrix;

  const headShape = new SphereGeometry(0.3, 16, 12);
  headShape.translate(0, 2.36, 0);
  const head = instanced(
    new InstancedMesh(
      headShape,
      new MeshStandardMaterial({ color: colors.head, roughness: 0.7 }),
      count,
    ),
    'head',
  );
  head.instanceMatrix = shared;

  const hitShape = new CylinderGeometry(2.4, 2.4, 4.5, 12);
  hitShape.translate(0, 2, 0);
  const hit = instanced(
    new InstancedMesh(
      hitShape,
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      count,
    ),
    'hit',
  );
  hit.instanceMatrix = shared;

  const plateShapes: Readonly<Record<Side, BufferGeometry>> = {
    home: new CircleGeometry(1.15, 28),
    away: new PlaneGeometry(2, 2),
  };
  const plateColours: Readonly<Record<Side, Color>> = {
    home: new Color(colors.home),
    away: new Color(colors.away),
  };
  const sprintColour = new Color(colors.ink);
  const plate = (side: Side) => {
    plateShapes[side].rotateX(-Math.PI / 2);
    // White, tinted per instance: the team's colour, or left white for a sprint.
    const material = new MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
    const mesh = instanced(new InstancedMesh(plateShapes[side], material, count), `plate-${side}`);
    for (let slot = 0; slot < count; slot += 1) mesh.setColorAt(slot, plateColours[side]);
    return mesh;
  };
  const sprints = new Uint8Array(count);
  const plates: Readonly<Record<Side, InstancedMesh>> = {
    home: plate('home'),
    away: plate('away'),
  };

  const atlas = makeAtlas(roster.map((entry) => String(entry.shirt)));
  if (atlas !== null) {
    const quad = new PlaneGeometry(1, 1);
    const cells = new Float32Array(count * 2);
    roster.forEach((_, slot) => {
      cells[slot * 2] = slot % atlas.columns;
      // The texture's first row is the bottom of the canvas the numbers were drawn on.
      cells[slot * 2 + 1] = atlas.rows - 1 - Math.floor(slot / atlas.columns);
    });
    quad.setAttribute('cell', new InstancedBufferAttribute(cells, 2));
    const numbers = instanced(new InstancedMesh(quad, numberMaterial(atlas), count), 'numbers');
    numbers.instanceMatrix = shared;
    numbers.renderOrder = 2;
  }

  const pose = new Object3D();
  const park = (slot: number) => {
    pose.position.set(0, PARKED_Y, 0);
    pose.rotation.set(0, 0, 0, 'YXZ');
    pose.scale.setScalar(1);
    pose.updateMatrix();
    kit.setMatrixAt(slot, pose.matrix);
    plates.home.setMatrixAt(slot, pose.matrix);
    plates.away.setMatrixAt(slot, pose.matrix);
  };
  for (let slot = 0; slot < count; slot += 1) park(slot);

  return {
    group,
    place(slot, x, z, heading, lean, scale, sprinting = false) {
      const side = roster[slot]?.side;
      if (side === undefined) return;
      pose.position.set(x, 0, z);
      // Turn about the vertical first, then tip forwards about the shoulder line.
      pose.rotation.set(0, heading, -lean, 'YXZ');
      pose.scale.setScalar(scale);
      pose.updateMatrix();
      kit.setMatrixAt(slot, pose.matrix);
      pose.position.y = 0.03;
      pose.rotation.set(0, 0, 0, 'YXZ');
      pose.scale.setScalar(sprinting ? scale * SPRINT_PLATE : scale);
      pose.updateMatrix();
      plates[side].setMatrixAt(slot, pose.matrix);
      // Colours are only sent to the GPU when somebody starts or stops sprinting.
      if (sprints[slot] === (sprinting ? 1 : 0)) return;
      sprints[slot] = sprinting ? 1 : 0;
      plates[side].setColorAt(slot, sprinting ? sprintColour : plateColours[side]);
      const tints = plates[side].instanceColor;
      if (tints !== null) tints.needsUpdate = true;
    },
    hide: park,
    commit() {
      shared.needsUpdate = true;
      plates.home.instanceMatrix.needsUpdate = true;
      plates.away.instanceMatrix.needsUpdate = true;
    },
  };
}
