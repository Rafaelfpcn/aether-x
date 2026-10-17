import * as THREE from 'three';

const FUSELAGE_SIDES = 8;
const FUSELAGE_PROFILE = [
  { z: 1.38, width: 0.46, height: 0.24 },
  { z: 0.88, width: 0.82, height: 0.34 },
  { z: 0.16, width: 1.0, height: 0.42 },
  { z: -0.66, width: 0.7, height: 0.3 },
  { z: -1.52, width: 0.055, height: 0.08 },
] as const;

export const PLAYER_ROTOR_LAYOUT = [
  { x: -3.1, z: -2.35, direction: 1 },
  { x: -3.1, z: 2.35, direction: -1 },
  { x: 3.1, z: -2.35, direction: -1 },
  { x: 3.1, z: 2.35, direction: 1 },
] as const;

export function createFuselageGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  FUSELAGE_PROFILE.forEach(({ z, width, height }) => {
    for (let side = 0; side < FUSELAGE_SIDES; side++) {
      const angle = (side / FUSELAGE_SIDES) * Math.PI * 2;
      positions.push(Math.cos(angle) * width, Math.sin(angle) * height, z);
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
      const next = ringStart + (side + 1) % FUSELAGE_SIDES;
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
