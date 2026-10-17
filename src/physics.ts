export interface VectorLike {
  x: number;
  y: number;
  z: number;
}

export interface ScalableVector {
  multiplyScalar(value: number): unknown;
}

export type ProjectilePass = 'hit' | 'near-miss' | 'miss';

export interface CameraFollowProfile {
  height: number;
  distance: number;
  lookAhead: number;
  fieldOfView: number;
}

export function cameraFollowProfile(speed: number, close = false): CameraFollowProfile {
  const pace = Math.max(0, Math.min(1, speed / 42));
  return close
    ? { height: 2.8 + pace * 0.3, distance: 7.2 + pace * 0.7, lookAhead: 9 + pace * 2, fieldOfView: 58 + pace * 7 }
    : { height: 4.2 + pace * 0.45, distance: 11.5 + pace * 1.2, lookAhead: 12 + pace * 3, fieldOfView: 55 + pace * 10 };
}

export function reinforcementBatchSize(aliveCount: number, pendingCount: number, cooldownSeconds: number, threshold = 2, batchSize = 2): number {
  if (pendingCount <= 0 || cooldownSeconds > 0 || aliveCount > threshold) return 0;
  return Math.min(Math.max(0, Math.floor(pendingCount)), Math.max(1, Math.floor(batchSize)));
}

export interface BoostState {
  energy: number;
  active: boolean;
}

export function applyFrameIndependentDamping<T extends ScalableVector>(velocity: T, rate: number, deltaSeconds: number): void {
  velocity.multiplyScalar(Math.exp(-Math.max(0, rate) * Math.max(0, deltaSeconds)));
}

export function classifyProjectilePass(distanceSquared: number, hitRadius: number, nearMissRadius: number): ProjectilePass {
  if (distanceSquared <= hitRadius * hitRadius) return 'hit';
  if (distanceSquared <= nearMissRadius * nearMissRadius) return 'near-miss';
  return 'miss';
}

export function advanceBoostState(
  energy: number,
  requested: boolean,
  wasActive: boolean,
  deltaSeconds: number,
  drainPerSecond = 38,
  rechargePerSecond = 26,
  restartThreshold = 30,
): BoostState {
  const dt = Math.max(0, deltaSeconds);
  const available = Math.max(0, Math.min(100, energy));
  if (!requested) return { energy: Math.min(100, available + rechargePerSecond * dt), active: false };
  if (wasActive) {
    const nextEnergy = Math.max(0, available - drainPerSecond * dt);
    return { energy: nextEnergy, active: nextEnergy > 0 };
  }
  const recharged = Math.min(100, available + rechargePerSecond * dt);
  if (recharged < restartThreshold) return { energy: recharged, active: false };
  const nextEnergy = Math.max(0, recharged - drainPerSecond * dt);
  return { energy: nextEnergy, active: nextEnergy > 0 };
}

export function pointToSegmentDistanceSquared(point: VectorLike, start: VectorLike, end: VectorLike): number {
  const sx = end.x - start.x;
  const sy = end.y - start.y;
  const sz = end.z - start.z;
  const lengthSquared = sx * sx + sy * sy + sz * sz;
  if (lengthSquared === 0) return squaredDistance(point, start);
  const px = point.x - start.x;
  const py = point.y - start.y;
  const pz = point.z - start.z;
  const amount = Math.max(0, Math.min(1, (px * sx + py * sy + pz * sz) / lengthSquared));
  return squaredDistance(point, { x: start.x + sx * amount, y: start.y + sy * amount, z: start.z + sz * amount });
}

function squaredDistance(a: VectorLike, b: VectorLike): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}
