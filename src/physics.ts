import type { FlightProfile } from './style-profile';

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
  targetElevation: number;
}

export function cameraFollowProfile(speed: number, close = false): CameraFollowProfile {
  const pace = Math.max(0, Math.min(1, speed / 42));
  return close
    ? {
        height: 3.8 + pace * 0.3,
        distance: 14.5 + pace * 1,
        lookAhead: 12 + pace * 2,
        fieldOfView: 61 + pace * 6,
        targetElevation: 1.3 + pace * 0.2,
      }
    : {
        height: 5.8 + pace * 0.5,
        distance: 24.5 + pace * 1.8,
        lookAhead: 19 + pace * 3,
        fieldOfView: 58 + pace * 8,
        targetElevation: 2.2 + pace * 0.3,
      };
}

/**
 * Calcula a elevação da câmera e do ponto de mira garantindo que o drone
 * fique delimitado no terço inferior da tela e nunca obstrua o retículo central,
 * mesmo durante mergulhos de aceleração máxima.
 */
export function computeChaseCameraFraming(
  dronePosY: number,
  dronePitch: number,
  profile: CameraFollowProfile,
): { cameraY: number; targetY: number } {
  const diveFactor = Math.max(0, -dronePitch);
  const cameraY = dronePosY + profile.height + diveFactor * 2.1;
  const targetY = dronePosY + profile.targetElevation - Math.sin(dronePitch) * (profile.lookAhead * 0.18);
  return { cameraY, targetY };
}

export function reinforcementBatchSize(
  aliveCount: number,
  pendingCount: number,
  cooldownSeconds: number,
  threshold = 2,
  batchSize = 2,
): number {
  if (pendingCount <= 0 || cooldownSeconds > 0 || aliveCount > threshold) return 0;
  return Math.min(Math.max(0, Math.floor(pendingCount)), Math.max(1, Math.floor(batchSize)));
}

export interface BoostState {
  energy: number;
  active: boolean;
}

export function applyFrameIndependentDamping<T extends ScalableVector>(
  velocity: T,
  rate: number,
  deltaSeconds: number,
): void {
  velocity.multiplyScalar(Math.exp(-Math.max(0, rate) * Math.max(0, deltaSeconds)));
}

export function classifyProjectilePass(
  distanceSquared: number,
  hitRadius: number,
  nearMissRadius: number,
): ProjectilePass {
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
  return squaredDistance(point, {
    x: start.x + sx * amount,
    y: start.y + sy * amount,
    z: start.z + sz * amount,
  });
}

function squaredDistance(a: VectorLike, b: VectorLike): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

/**
 * Calcula vento determinístico + rajadas em função do tempo e coordenadas.
 */
export function windAt(
  elapsed: number,
  x: number,
  z: number,
  baseStrength = 3.2,
): { x: number; y: number; z: number } {
  const gust = 0.65 + 0.35 * Math.sin(elapsed * 0.85 + x * 0.025 - z * 0.018);
  const swirl = Math.cos(elapsed * 1.4 + (x + z) * 0.035);
  return {
    x: Math.sin(elapsed * 0.32 + z * 0.012) * baseStrength * gust,
    y: swirl * baseStrength * 0.16,
    z: Math.cos(elapsed * 0.27 - x * 0.014) * baseStrength * 0.78 * gust,
  };
}

/**
 * Sustentação adicional (efeito solo / colchão de ar) quando o drone voa a menos de 3.2m do chão/água.
 */
export function groundEffectLift(gapMeters: number): number {
  if (gapMeters <= 0) return 5.5;
  if (gapMeters >= 3.2) return 0;
  const ratio = 1 - gapMeters / 3.2;
  return ratio * ratio * 5.5;
}

/**
 * Dano estrutural proporcional à velocidade normal de impacto (0 abaixo do limiar de 6.5 m/s).
 */
export function impactDamage(normalSpeed: number, factor = 1): number {
  const threshold = 6.5;
  if (normalSpeed <= threshold) return 0;
  return Math.min(48, Math.round((normalSpeed - threshold) * 1.65 * Math.max(0.2, factor)));
}

export interface FlightDynamicState {
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  yawVelocity: number;
}

export interface FlightControlInput {
  forward: number; // -1..1 (W/S)
  turn: number; // -1..1 (A=+1 esquerda, D=-1 direita)
  lift: number; // -1..1 (Espaço/C)
  boost: boolean;
}

export interface FlightEnvironmentSample {
  windX: number;
  windY: number;
  windZ: number;
  proximity: number; // 0..1 proximidade a paredes/obstáculos
  groundGap: number; // altura acima do solo/água
  cargoMass: number; // 0 sem carga, >0 (ex: 0.35) com carga pendurada
}

/**
 * Avança o estado dinâmico de voo do drone de forma independente de FPS.
 * No perfil simulador, a inércia angular de pitch/roll governa a aceleração
 * e o vento/turbulência/massa de carga afetam a trajetória.
 */
export function advanceFlight(
  state: FlightDynamicState,
  input: FlightControlInput,
  profile: FlightProfile,
  env: FlightEnvironmentSample,
  dtSeconds: number,
): FlightDynamicState {
  const dt = Math.max(0, Math.min(0.1, dtSeconds));
  if (dt === 0) return { ...state };

  const massMultiplier = 1 / (1 + Math.max(0, env.cargoMass));
  const speed = Math.hypot(state.vx, state.vy, state.vz);
  const maxSpd = (input.boost ? profile.boostMaxSpeed : profile.maxSpeed) * (1 - Math.min(0.28, env.cargoMass * 0.45));
  const speedRatio = Math.min(1, speed / Math.max(1, maxSpd));

  // Guinada com inércia angular
  const targetYawVel = input.turn * profile.yawRate * (1 - speedRatio * 0.18);
  const yawBlend = 1 - Math.exp(-profile.yawAccel * dt);
  const yawVelocity = state.yawVelocity + (targetYawVel - state.yawVelocity) * yawBlend;
  const yaw = state.yaw + yawVelocity * dt;

  // Atitude (pitch e roll) com resposta elástica dependente do perfil (simulador vs arcade)
  const boostTilt = input.boost ? 1.22 : 1;
  const pitchTarget = -input.forward * profile.maxTiltRad * boostTilt;
  const rollTarget = input.turn * profile.maxTiltRad * 0.95;
  const attitudeBlend = 1 - Math.exp(-profile.angularResponse * massMultiplier * dt);
  const pitch = state.pitch + (pitchTarget - state.pitch) * attitudeBlend;
  const roll = state.roll + (rollTarget - state.roll) * attitudeBlend;

  // Vetor frontal no plano XZ
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  // Aceleração longitudinal + componente de curva por inclinação (banked turn)
  const accelMag = (input.boost ? profile.boostThrust : profile.thrust) * massMultiplier;
  const forwardFactor = input.forward >= 0 ? input.forward : input.forward * 0.7;
  // No simulador, parte do empuxo depende de o chassi já ter inclinado
  const tiltCoupling = profile.angularResponse < 5 ? 0.55 + 0.45 * Math.min(1, Math.abs(pitch) / Math.max(0.08, profile.maxTiltRad)) : 1;
  const driveAccel = forwardFactor * accelMag * tiltCoupling;
  const bankDrift = -Math.sin(roll) * accelMag * 0.22;

  const isSteering = Math.abs(input.forward) > 0.02 || Math.abs(input.turn) > 0.02;
  const isLifting = Math.abs(input.lift) > 0.02;

  let vx = state.vx + (fwdX * driveAccel + rightX * bankDrift) * dt;
  let vz = state.vz + (fwdZ * driveAccel + rightZ * bankDrift) * dt;
  let vy = state.vy + input.lift * profile.liftAccel * massMultiplier * dt;

  // Sustentação de efeito solo e leve puxão gravitacional quando carregando carga
  vy += groundEffectLift(env.groundGap) * dt;
  if (env.cargoMass > 0) {
    vy -= env.cargoMass * 3.8 * dt;
  }

  // Vento ambiente + turbulência perto de obstáculos
  // No modo hover (sem comando do piloto), o controlador de voo (GPS/Alt Hold) neutraliza vento moderado
  let effWindX = env.windX;
  let effWindZ = env.windZ;
  let effWindY = env.windY;

  if (!isSteering) {
    const horizontalWindSpeed = Math.hypot(env.windX, env.windZ);
    const holdThreshold = 6.0; // GPS hold anula deriva de vento moderado (< 21.6 km/h) quando sem comandos
    if (horizontalWindSpeed <= holdThreshold) {
      effWindX = 0;
      effWindZ = 0;
    } else {
      const excess = (horizontalWindSpeed - holdThreshold) / horizontalWindSpeed;
      effWindX *= excess;
      effWindZ *= excess;
    }
  }

  if (!isLifting) {
    const vertHoldThreshold = 2.5; // Baro hold anula correntes verticais moderadas
    if (Math.abs(env.windY) <= vertHoldThreshold) {
      effWindY = 0;
    } else {
      effWindY = env.windY > 0 ? env.windY - vertHoldThreshold : env.windY + vertHoldThreshold;
    }
  }

  const turb = env.proximity * profile.turbulenceScale * 3.4;
  vx += (effWindX * profile.windScale + Math.sin(yaw * 3.7 + state.pitch * 9) * turb * 0.35) * dt;
  vy += (effWindY * profile.windScale + Math.cos(yaw * 5.1) * turb * 0.25) * dt;
  vz += (effWindZ * profile.windScale + Math.cos(yaw * 2.9 - state.roll * 9) * turb * 0.35) * dt;

  // Arrasto e frenagem ativa de hover (posição perfeitamente estável ao soltar os controles)
  let activeBraking = 0;
  if (!isSteering) {
    // Quando o piloto solta os direcionais, o drone freia ativamente para pairar imóvel (GPS Hold)
    activeBraking = 4.8;
  }

  // Arrasto linear + frenagem ativa + arrasto quadrático independente de taxa de quadros
  const currentHorizontalSpeed = Math.hypot(vx, vz);
  const totalHorizontalDrag = profile.linearDrag + activeBraking + profile.quadraticDrag * currentHorizontalSpeed;
  const hDamping = Math.exp(-Math.max(0, totalHorizontalDrag) * dt);
  vx *= hDamping;
  vz *= hDamping;

  // Estabilização vertical de altitude
  let vDragRate = profile.linearDrag + profile.quadraticDrag * Math.abs(vy);
  if (!isLifting) {
    vDragRate += 4.8;
  }
  const vDamping = Math.exp(-Math.max(0, vDragRate) * dt);
  vy *= vDamping;

  // Deadband quando parado: anula velocidade residual para pairar imóvel sem deriva fantasma
  if (!isSteering && Math.hypot(vx, vz) < 0.18) {
    vx = 0;
    vz = 0;
  }
  if (!isLifting && Math.abs(vy) < 0.12) {
    vy = 0;
  }

  const finalSpeed = Math.hypot(vx, vy, vz);
  if (finalSpeed > maxSpd) {
    const scale = maxSpd / finalSpeed;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }

  return { vx, vy, vz, yaw, pitch, roll, yawVelocity };
}
