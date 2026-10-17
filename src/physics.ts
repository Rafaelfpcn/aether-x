export interface VectorLike {
  x: number;
  y: number;
  z: number;
}

export interface ScalableVector {
  multiplyScalar(value: number): unknown;
}

export function applyFrameIndependentDamping<T extends ScalableVector>(velocity: T, rate: number, deltaSeconds: number): void {
  velocity.multiplyScalar(Math.exp(-Math.max(0, rate) * Math.max(0, deltaSeconds)));
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
