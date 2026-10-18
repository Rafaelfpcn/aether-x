/**
 * Perfis de estilo global do AETHER-X.
 *
 * O estilo visual (Realista / Futurista) também define o modelo de voo
 * (simulador vs. arcade) e o armamento (metralhadora traçante vs. laser).
 * Módulo puro: sem dependência de Three.js ou DOM, testável em Node.
 */
export type VisualStyle = 'realistic' | 'futuristic';

/**
 * Modelo de dinâmica de voo, desacoplado da escolha estética/visual:
 * - arcade: Resposta instantânea de guinada, auto-nivelamento rápido, arrasto linear agressivo e mira assistida ampla.
 * - sim: Inércia angular realista, empuxo acoplado à atitude de pitch/roll, sensibilidade ao vento e efeito solo.
 */
export type FlightModel = 'arcade' | 'sim';

export function normalizeFlightModel(value: unknown, fallback: FlightModel = 'arcade'): FlightModel {
  return value === 'sim' || value === 'arcade' ? value : fallback;
}

export interface FlightProfile {
  /** Arrasto linear (1/s). */
  linearDrag: number;
  /** Arrasto quadrático (1/m). */
  quadraticDrag: number;
  /** Inclinação máxima do chassi em radianos. */
  maxTiltRad: number;
  /** Rapidez com que a atitude (pitch/roll) segue o comando (1/s). Menor = mais inércia. */
  angularResponse: number;
  /** Velocidade máxima de guinada (rad/s). */
  yawRate: number;
  /** Aceleração angular de guinada (rad/s²). */
  yawAccel: number;
  /** Aceleração horizontal nominal (m/s²) com inclinação máxima. */
  thrust: number;
  /** Aceleração horizontal no turbo (m/s²). */
  boostThrust: number;
  /** Aceleração vertical comandada (m/s²). */
  liftAccel: number;
  /** Velocidade máxima nominal e no turbo (m/s). */
  maxSpeed: number;
  boostMaxSpeed: number;
  /** Escala do vento ambiente e da turbulência próxima a estruturas. */
  windScale: number;
  turbulenceScale: number;
  /** Coeficiente de restituição em colisões com o cenário. */
  collisionRestitution: number;
  /** Multiplicador do dano por impacto. */
  collisionDamageFactor: number;
  /** Cosseno do cone de mira assistida (maior = cone mais estreito). */
  aimAssistCone: number;
  /** Força da correção de mira para o alvo travado (0..1). */
  aimAssistStrength: number;
}

export const FLIGHT_PROFILES_BY_MODEL: Readonly<Record<FlightModel, FlightProfile>> = {
  sim: {
    linearDrag: 0.42,
    quadraticDrag: 0.0105,
    maxTiltRad: 0.52,
    angularResponse: 3.1,
    yawRate: 1.75,
    yawAccel: 5.2,
    thrust: 30,
    boostThrust: 44,
    liftAccel: 15,
    maxSpeed: 27,
    boostMaxSpeed: 39,
    windScale: 1,
    turbulenceScale: 1,
    collisionRestitution: 0.22,
    collisionDamageFactor: 1.35,
    aimAssistCone: 0.982,
    aimAssistStrength: 0.35,
  },
  arcade: {
    linearDrag: 1.05,
    quadraticDrag: 0.0035,
    maxTiltRad: 0.34,
    angularResponse: 7.5,
    yawRate: 2.35,
    yawAccel: 14,
    thrust: 30,
    boostThrust: 46,
    liftAccel: 17,
    maxSpeed: 28,
    boostMaxSpeed: 42,
    windScale: 0.22,
    turbulenceScale: 0.25,
    collisionRestitution: 0.36,
    collisionDamageFactor: 0.8,
    aimAssistCone: 0.91,
    aimAssistStrength: 1,
  },
};

/**
 * Mapeamento legado indexado por VisualStyle para retrocompatibilidade com testes e módulos existentes.
 */
export const FLIGHT_PROFILES: Readonly<Record<VisualStyle, FlightProfile>> = {
  realistic: FLIGHT_PROFILES_BY_MODEL.sim,
  futuristic: FLIGHT_PROFILES_BY_MODEL.arcade,
};

export function flightProfileFor(model: FlightModel): FlightProfile {
  return FLIGHT_PROFILES_BY_MODEL[model];
}

export interface WeaponProfile {
  kind: 'laser' | 'tracer';
  /** Velocidade inicial do projétil (m/s). */
  muzzleSpeed: number;
  /** Fração da gravidade aplicada ao projétil (queda balística). */
  gravityScale: number;
  /** Intervalo entre disparos (ms) — por cano. */
  fireIntervalMs: number;
  /** Capacidade do carregador; null = infinito. */
  magazine: number | null;
  reloadSeconds: number;
  /** Dano por projétil em inimigos comuns. */
  damage: number;
  /** Dano por projétil em chefes. */
  bossDamage: number;
  /** Dispersão angular (rad). */
  spread: number;
  /** Tempo de vida do projétil (s). */
  lifetime: number;
}

export const WEAPON_PROFILES: Readonly<Record<VisualStyle, WeaponProfile>> = {
  realistic: {
    kind: 'tracer',
    muzzleSpeed: 230,
    gravityScale: 0.35,
    fireIntervalMs: 85,
    magazine: 90,
    reloadSeconds: 1.8,
    damage: 9,
    bossDamage: 3.6,
    spread: 0.009,
    lifetime: 1.1,
  },
  futuristic: {
    kind: 'laser',
    muzzleSpeed: 142,
    gravityScale: 0,
    fireIntervalMs: 210,
    magazine: null,
    reloadSeconds: 0,
    damage: 20,
    bossDamage: 8,
    spread: 0,
    lifetime: 1.15,
  },
};

export function normalizeVisualStyle(value: unknown, fallback: VisualStyle = 'futuristic'): VisualStyle {
  return value === 'realistic' || value === 'futuristic' ? value : fallback;
}
