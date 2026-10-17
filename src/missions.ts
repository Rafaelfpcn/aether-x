export type MissionId = 'training' | 'intercept' | 'sentinel';
export type ObjectiveKind = 'gates' | 'kills' | 'boss';
export type EnemyArchetype = 'scout' | 'gunner' | 'bulwark';
export type BossAttackPattern = 'volley' | 'fan' | 'charge';

export interface MissionPalette {
  background: number;
  fog: number;
  gridCenter: number;
  gridLines: number;
}

export interface MissionDefinition {
  id: MissionId;
  index: number;
  name: string;
  codename: string;
  cardCopy: string;
  briefing: string;
  objective: string;
  objectiveKind: ObjectiveKind;
  objectiveTarget: number;
  durationSeconds: number;
  silverSeconds: number;
  goldSeconds: number;
  palette: MissionPalette;
  enemyWave?: readonly EnemyArchetype[];
  bossPatterns?: readonly BossAttackPattern[];
}

export const MISSIONS: MissionDefinition[] = [
  {
    id: 'training',
    index: 1,
    name: 'Treinamento de voo',
    codename: 'PRIMEIRO CONTATO',
    cardCopy: 'Assuma os controles e atravesse os portais de calibração.',
    briefing: 'O corredor de voo está limpo. Use as balizas para calibrar o AETHER-X e aprender a controlar velocidade, direção e altitude.',
    objective: 'Atravesse 6 portais de calibração',
    objectiveKind: 'gates',
    objectiveTarget: 6,
    durationSeconds: 180,
    silverSeconds: 115,
    goldSeconds: 80,
    palette: { background: 0x070b12, fog: 0x08101a, gridCenter: 0x266e81, gridLines: 0x163041 },
  },
  {
    id: 'intercept',
    index: 2,
    name: 'Interceptação',
    codename: 'CÉU HOSTIL',
    cardCopy: 'Cinco Sentinelas cercam o perímetro. Abra caminho.',
    briefing: 'Unidades hostis cercam os relés da cidade. Trave a mira, use o turbo para evitar os disparos e elimine cinco drones antes que o tempo acabe.',
    objective: 'Abata 5 drones hostis',
    objectiveKind: 'kills',
    objectiveTarget: 5,
    durationSeconds: 180,
    silverSeconds: 115,
    goldSeconds: 85,
    palette: { background: 0x0a0813, fog: 0x130d20, gridCenter: 0x694189, gridLines: 0x2a1e3d },
    enemyWave: ['scout', 'scout', 'gunner', 'gunner', 'bulwark'],
  },
  {
    id: 'sentinel',
    index: 3,
    name: 'Sentinela Alfa',
    codename: 'PROTOCOLO FINAL',
    cardCopy: 'Enfrente o núcleo que comanda a invasão.',
    briefing: 'O comando inimigo emergiu sobre a cidade. A blindagem do Alfa oscila: aguarde a abertura, desvie do ataque anunciado e acerte o núcleo exposto.',
    objective: 'Destrua o Sentinela Alfa em 3 fases',
    objectiveKind: 'boss',
    objectiveTarget: 1,
    durationSeconds: 240,
    silverSeconds: 170,
    goldSeconds: 125,
    palette: { background: 0x10090d, fog: 0x1b0c12, gridCenter: 0x783347, gridLines: 0x3b1d2c },
    bossPatterns: ['volley', 'fan', 'charge'],
  },
];

export function missionById(id: MissionId): MissionDefinition {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission) throw new Error(`Missão desconhecida: ${id}`);
  return mission;
}

export function missionIdAt(index: number): MissionId | null {
  return MISSIONS[index]?.id ?? null;
}

export function bossPatternForPhase(patterns: readonly BossAttackPattern[] | undefined, phase: number): BossAttackPattern {
  const safePhase = Math.max(1, Math.floor(phase));
  return patterns?.[safePhase - 1] ?? patterns?.[patterns.length - 1] ?? 'volley';
}
