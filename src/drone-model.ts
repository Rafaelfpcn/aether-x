import * as THREE from 'three';
import type { EnemyArchetype } from './missions';

const FUSELAGE_SIDES = 16;
const FUSELAGE_PROFILE = [
  { z: 1.44, width: 0.34, height: 0.18 },
  { z: 1.12, width: 0.68, height: 0.28 },
  { z: 0.62, width: 0.94, height: 0.38 },
  { z: 0.08, width: 1.04, height: 0.44 },
  { z: -0.48, width: 0.86, height: 0.36 },
  { z: -1.04, width: 0.52, height: 0.24 },
  { z: -1.56, width: 0.06, height: 0.08 },
] as const;

export const PLAYER_ROTOR_LAYOUT = [
  { x: -3.1, z: -2.35, direction: 1 },
  { x: -3.1, z: 2.35, direction: -1 },
  { x: 3.1, z: -2.35, direction: -1 },
  { x: 3.1, z: 2.35, direction: 1 },
] as const;

export const PLAYER_HEX_EXTRA_ROTORS = [
  { x: -3.65, z: 0, direction: 1 },
  { x: 3.65, z: 0, direction: -1 },
] as const;

export function createFuselageGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  FUSELAGE_PROFILE.forEach(({ z, width, height }) => {
    for (let side = 0; side < FUSELAGE_SIDES; side++) {
      const angle = (side / FUSELAGE_SIDES) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const chine = 1 + 0.08 * Math.cos(angle * 2);
      const verticalShape = sin >= 0 ? Math.pow(sin, 0.88) : -Math.pow(-sin, 1.15);
      positions.push(cos * width * chine, verticalShape * height, z);
    }
  });

  for (let section = 0; section < FUSELAGE_PROFILE.length - 1; section++) {
    const rearStart = section * FUSELAGE_SIDES;
    const frontStart = (section + 1) * FUSELAGE_SIDES;
    for (let side = 0; side < FUSELAGE_SIDES; side++) {
      const next = (side + 1) % FUSELAGE_SIDES;
      const rear = rearStart + side;
      const rearNext = rearStart + next;
      const front = frontStart + side;
      const frontNext = frontStart + next;
      indices.push(rear, front, frontNext, rear, frontNext, rearNext);
    }
  }

  const cap = (sectionIndex: number, reverse: boolean): void => {
    const { z } = FUSELAGE_PROFILE[sectionIndex];
    const centerIndex = positions.length / 3;
    positions.push(0, 0, z);
    const ringStart = sectionIndex * FUSELAGE_SIDES;
    for (let side = 0; side < FUSELAGE_SIDES; side++) {
      const current = ringStart + side;
      const next = ringStart + ((side + 1) % FUSELAGE_SIDES);
      indices.push(centerIndex, ...(reverse ? [next, current] : [current, next]));
    }
  };

  cap(0, false);
  cap(FUSELAGE_PROFILE.length - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Cria a geometria de uma pá de hélice aerodinâmica (airfoil) com corda variável,
 * curvatura (sweep) na ponta e torção de passo (pitch) da raiz até a ponta.
 */
export function createPropellerBladeGeometry(direction = 1): THREE.BufferGeometry {
  const spanSegments = 12;
  const chordPoints = 8;
  const positions: number[] = [];
  const indices: number[] = [];

  const innerRadius = 0.16;
  const outerRadius = 1.02;

  for (let i = 0; i <= spanSegments; i++) {
    const t = i / spanSegments;
    const zBase = THREE.MathUtils.lerp(innerRadius, outerRadius, t);
    const chord = 0.055 + Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.135 * (1 - t * 0.22);
    const thickness = THREE.MathUtils.lerp(0.026, 0.006, t);
    const pitch = THREE.MathUtils.lerp(0.38, 0.14, t) * direction;
    const sweep = Math.pow(t, 2.2) * 0.075 * direction;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    for (let j = 0; j < chordPoints; j++) {
      const angle = (j / chordPoints) * Math.PI * 2;
      const localX = Math.cos(angle) * (chord * 0.5) + sweep;
      const camber = (1 - Math.cos(angle) * 0.35) * 0.5;
      const localY = Math.sin(angle) * thickness * camber + Math.sin(Math.cos(angle) * Math.PI * 0.5) * 0.006;

      const x = localX * cosP - localY * sinP;
      const y = localX * sinP + localY * cosP;
      positions.push(x, y, zBase);
    }
  }

  for (let i = 0; i < spanSegments; i++) {
    const rowA = i * chordPoints;
    const rowB = (i + 1) * chordPoints;
    for (let j = 0; j < chordPoints; j++) {
      const next = (j + 1) % chordPoints;
      indices.push(rowA + j, rowB + j, rowB + next, rowA + j, rowB + next, rowA + next);
    }
  }

  const capRing = (ringIndex: number, reverse: boolean): void => {
    const ringStart = ringIndex * chordPoints;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < chordPoints; j++) {
      cx += positions[(ringStart + j) * 3];
      cy += positions[(ringStart + j) * 3 + 1];
      cz += positions[(ringStart + j) * 3 + 2];
    }
    const centerIndex = positions.length / 3;
    positions.push(cx / chordPoints, cy / chordPoints, cz / chordPoints);
    for (let j = 0; j < chordPoints; j++) {
      const current = ringStart + j;
      const next = ringStart + ((j + 1) % chordPoints);
      indices.push(centerIndex, ...(reverse ? [next, current] : [current, next]));
    }
  };

  capRing(0, true);
  capRing(spanSegments, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Cria o casco 3D esculpido para cada arquétipo de inimigo (scout, gunner, bulwark, sniper, swarmer ou boss).
 */
export function createEnemyHullGeometry(kind: EnemyArchetype | 'boss' | 'attackheli'): THREE.BufferGeometry {
  const sides =
    kind === 'bulwark' || kind === 'heavyhex'
      ? 8
      : kind === 'boss' || kind === 'attackheli'
        ? 16
        : kind === 'sniper' || kind === 'fixedwing'
          ? 10
          : 12;
  const profile =
    kind === 'scout'
      ? [
          { z: 1.25, w: 0.26, h: 0.14 },
          { z: 0.52, w: 1.04, h: 0.28 },
          { z: -0.1, w: 0.84, h: 0.36 },
          { z: -0.78, w: 0.42, h: 0.22 },
          { z: -1.48, w: 0.05, h: 0.05 },
        ]
      : kind === 'gunner'
        ? [
            { z: 1.18, w: 0.56, h: 0.32 },
            { z: 0.48, w: 1.18, h: 0.48 },
            { z: -0.22, w: 1.12, h: 0.54 },
            { z: -0.86, w: 0.72, h: 0.38 },
            { z: -1.32, w: 0.22, h: 0.16 },
          ]
        : kind === 'bulwark' || kind === 'heavyhex'
          ? [
              { z: 1.24, w: 0.78, h: 0.48 },
              { z: 0.56, w: 1.32, h: 0.78 },
              { z: -0.36, w: 1.3, h: 0.8 },
              { z: -0.98, w: 0.88, h: 0.52 },
              { z: -1.36, w: 0.34, h: 0.24 },
            ]
          : kind === 'sniper' || kind === 'fixedwing'
            ? [
                { z: 1.55, w: 0.24, h: 0.18 },
                { z: 0.68, w: 0.58, h: 0.28 },
                { z: -0.18, w: 0.56, h: 0.32 },
                { z: -1.05, w: 0.38, h: 0.22 },
                { z: -1.78, w: 0.08, h: 0.08 },
              ]
            : kind === 'swarmer' || kind === 'fpv'
              ? [
                  { z: 0.82, w: 0.22, h: 0.16 },
                  { z: 0.28, w: 0.64, h: 0.32 },
                  { z: -0.18, w: 0.68, h: 0.36 },
                  { z: -0.62, w: 0.38, h: 0.22 },
                  { z: -0.95, w: 0.12, h: 0.1 },
                ]
              : kind === 'gunboat'
                ? [
                    { z: 1.95, w: 0.78, h: 0.38 },
                    { z: 0.85, w: 1.12, h: 0.46 },
                    { z: -0.35, w: 1.06, h: 0.48 },
                    { z: -1.35, w: 0.64, h: 0.42 },
                    { z: -2.15, w: 0.12, h: 0.32 },
                  ]
                : kind === 'aaturret'
                  ? [
                      { z: 1.05, w: 0.92, h: 0.56 },
                      { z: 0.35, w: 1.18, h: 0.72 },
                      { z: -0.35, w: 1.18, h: 0.72 },
                      { z: -1.05, w: 0.92, h: 0.56 },
                    ]
                  : kind === 'attackheli'
                    ? [
                        { z: 2.35, w: 0.22, h: 0.24 },
                        { z: 1.15, w: 0.54, h: 0.46 },
                        { z: 0.15, w: 0.98, h: 0.82 },
                        { z: -0.78, w: 0.88, h: 0.72 },
                        { z: -1.68, w: 0.28, h: 0.32 },
                      ]
                    : [
                        { z: 1.62, w: 0.68, h: 0.52 },
                        { z: 0.82, w: 1.38, h: 0.92 },
                        { z: 0.0, w: 1.62, h: 1.12 },
                        { z: -0.82, w: 1.34, h: 0.9 },
                        { z: -1.62, w: 0.46, h: 0.34 },
                      ];

  const positions: number[] = [];
  const indices: number[] = [];

  profile.forEach(({ z, w, h }) => {
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const ridge =
        kind === 'scout'
          ? 1 + 0.24 * Math.cos(a * 2)
          : kind === 'sniper'
            ? 1 + 0.28 * Math.cos(a * 2) - 0.08 * Math.cos(a * 4)
            : kind === 'swarmer'
              ? 1 + 0.14 * Math.cos(a * 3)
              : 1 + 0.1 * Math.cos(a * 4);
      positions.push(Math.cos(a) * w * ridge, Math.sin(a) * h, z);
    }
  });

  for (let sec = 0; sec < profile.length - 1; sec++) {
    const rA = sec * sides;
    const rB = (sec + 1) * sides;
    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      indices.push(rA + s, rB + s, rB + next, rA + s, rB + next, rA + next);
    }
  }

  const cap = (secIdx: number, rev: boolean): void => {
    const { z } = profile[secIdx];
    const center = positions.length / 3;
    positions.push(0, 0, z);
    const start = secIdx * sides;
    for (let s = 0; s < sides; s++) {
      const cur = start + s;
      const nxt = start + ((s + 1) % sides);
      indices.push(center, ...(rev ? [nxt, cur] : [cur, nxt]));
    }
  };
  cap(0, false);
  cap(profile.length - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Cria asa enflechada aerodinâmica com ponta dobrada (winglet) para batedores e caças inimigos.
 */
export function createSweptWingGeometry(side: -1 | 1): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.45);
  shape.lineTo(side * 1.38, -0.78);
  shape.lineTo(side * 1.52, -0.42);
  shape.lineTo(side * 0.48, 0.42);
  shape.lineTo(0, 0.36);
  shape.closePath();

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  extrude.rotateX(Math.PI / 2);
  extrude.computeVertexNormals();
  extrude.computeBoundingSphere();
  return extrude;
}
