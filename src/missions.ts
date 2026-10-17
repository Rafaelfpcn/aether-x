export type CampaignMissionId = 'training' | 'intercept' | 'sentinel' | 'harbor' | 'skyline' | 'dam';
export type ScenarioId = CampaignMissionId | 'river';
export type MissionId = CampaignMissionId;
export type ObjectiveKind = 'gates' | 'kills' | 'boss';
export type EnemyArchetype = 'scout' | 'gunner' | 'bulwark';
export type BossAttackPattern = 'volley' | 'fan' | 'charge';
export type ScenarioEnvironment = 'city' | 'harbor' | 'skyline' | 'dam' | 'river';

export interface MissionPalette {
  background: number;
  fog: number;
  gridCenter: number;
  gridLines: number;
}

export interface MissionDefinition {
  id: ScenarioId;
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
  environment: ScenarioEnvironment;
  enemyWave?: readonly EnemyArchetype[];
  bossPatterns?: readonly BossAttackPattern[];
  bossName?: string;
  bossHealth?: number;
  gatePath?: readonly (readonly [number, number, number])[];
}

export type CampaignMissionDefinition = MissionDefinition & { id: CampaignMissionId };

export const MISSIONS: CampaignMissionDefinition[] = [
  {
    id: 'training', index: 1, name: 'Treinamento de voo', codename: 'PRIMEIRO CONTATO',
    cardCopy: 'Atravesse as balizas e domine os controles.',
    briefing: 'O corredor de voo está limpo. Use as balizas para calibrar o AETHER-X e aprender aceleração, direção, altitude e turbo.',
    objective: 'Atravesse 6 portais de calibração', objectiveKind: 'gates', objectiveTarget: 6,
    durationSeconds: 180, silverSeconds: 115, goldSeconds: 80, environment: 'city',
    palette: { background: 0x0b1420, fog: 0x14243a, gridCenter: 0x2d9eb7, gridLines: 0x24445d },
  },
  {
    id: 'intercept', index: 2, name: 'Interceptação', codename: 'CÉU HOSTIL',
    cardCopy: 'Elimine cinco drones e proteja o perímetro.',
    briefing: 'Unidades hostis cercam os relés da cidade. Trave a mira, use o turbo para evitar os disparos e elimine cinco drones antes que o tempo acabe.',
    objective: 'Abata 5 drones hostis', objectiveKind: 'kills', objectiveTarget: 5,
    durationSeconds: 180, silverSeconds: 115, goldSeconds: 85, environment: 'city',
    palette: { background: 0x100e1d, fog: 0x201b34, gridCenter: 0x9662c0, gridLines: 0x493760 },
    enemyWave: ['scout', 'scout', 'gunner', 'gunner', 'bulwark'],
  },
  {
    id: 'sentinel', index: 3, name: 'Sentinela Alfa', codename: 'PROTOCOLO FINAL',
    cardCopy: 'Enfrente o núcleo que comanda a invasão.',
    briefing: 'O comando inimigo emergiu sobre a cidade. A blindagem do Alfa oscila: aguarde a abertura, desvie do ataque anunciado e acerte o núcleo exposto.',
    objective: 'Destrua o Sentinela Alfa em 3 fases', objectiveKind: 'boss', objectiveTarget: 1,
    durationSeconds: 240, silverSeconds: 170, goldSeconds: 125, environment: 'city', bossName: 'SENTINELA ALFA', bossHealth: 720,
    palette: { background: 0x160d13, fog: 0x291724, gridCenter: 0xc2556f, gridLines: 0x563044 },
    bossPatterns: ['volley', 'fan', 'charge'],
  },
  {
    id: 'harbor', index: 4, name: 'Porto sob Chuva', codename: 'MARÉ DE PLASMA',
    cardCopy: 'Cace uma nova leva entre guindastes e contêineres.',
    briefing: 'Uma frente de tempestade cobre o porto. Os Sentinelas usam os guindastes como cobertura: vença sete unidades antes que a defesa costeira caia.',
    objective: 'Abata 7 drones no porto', objectiveKind: 'kills', objectiveTarget: 7,
    durationSeconds: 210, silverSeconds: 145, goldSeconds: 105, environment: 'harbor',
    palette: { background: 0x07131a, fog: 0x16313b, gridCenter: 0x47bac2, gridLines: 0x28505c },
    enemyWave: ['scout', 'gunner', 'scout', 'bulwark', 'gunner', 'scout', 'bulwark'],
  },
  {
    id: 'skyline', index: 5, name: 'Corredor das Torres', codename: 'LINHA DE FUGA',
    cardCopy: 'Siga a rota de balizas pelo cânion urbano.',
    briefing: 'O tráfego aéreo está bloqueado por torres e interferência. Pilote pelo cânion em uma rota marcada por seis balizas, sem perder velocidade nem altitude.',
    objective: 'Atravesse 6 balizas no corredor', objectiveKind: 'gates', objectiveTarget: 6,
    durationSeconds: 165, silverSeconds: 112, goldSeconds: 82, environment: 'skyline',
    palette: { background: 0x0a1018, fog: 0x172635, gridCenter: 0x62d9e1, gridLines: 0x314558 },
    gatePath: [[0, 12, -14], [10, 14, -28], [-10, 16, -42], [-11, 12, -56], [10, 15, -70], [0, 13, -83]],
  },
  {
    id: 'dam', index: 6, name: 'Última Comporta', codename: 'ÁGUAS DE RUPTURA',
    cardCopy: 'Derrube o guardião antes que a represa ceda.',
    briefing: 'A Sentinela ocupou a barragem e armou as comportas. Enfrente três ciclos de ataques, aproveite as aberturas do núcleo e impeça a inundação do vale.',
    objective: 'Derrote o Guardião da Represa em 3 fases', objectiveKind: 'boss', objectiveTarget: 1,
    durationSeconds: 270, silverSeconds: 190, goldSeconds: 145, environment: 'dam',
    bossName: 'GUARDIÃO DA REPRESA', bossHealth: 960,
    palette: { background: 0x111b20, fog: 0x22353b, gridCenter: 0x86c9bd, gridLines: 0x435b59 },
    bossPatterns: ['fan', 'charge', 'volley'],
  },
];

export const RIVER_MODE: MissionDefinition = {
  id: 'river', index: 0, name: 'Resgate no Rio', codename: 'EXPEDIÇÃO RIBEIRINHA',
  cardCopy: 'Defenda a casa do pescador sobre um rio em cheia.',
  briefing: 'Uma patrulha de Sentinelas desceu pelo vale. Voe sobre o rio, use as margens como referência e proteja a casa do pescador abatendo oito drones.',
  objective: 'Abata 8 drones sobre o rio', objectiveKind: 'kills', objectiveTarget: 8,
  durationSeconds: 240, silverSeconds: 170, goldSeconds: 125, environment: 'river',
  palette: { background: 0x9bb9bc, fog: 0x78979a, gridCenter: 0x6fa9aa, gridLines: 0x456d71 },
  enemyWave: ['scout', 'gunner', 'scout', 'bulwark', 'gunner', 'scout', 'bulwark', 'gunner'],
};

export function missionById(id: MissionId): CampaignMissionDefinition {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission) throw new Error(`Missão desconhecida: ${id}`);
  return mission;
}

export function scenarioById(id: ScenarioId): MissionDefinition {
  return id === 'river' ? RIVER_MODE : missionById(id);
}

export function missionIdAt(index: number): MissionId | null {
  return MISSIONS[index]?.id ?? null;
}

export function bossPatternForPhase(patterns: readonly BossAttackPattern[] | undefined, phase: number): BossAttackPattern {
  const safePhase = Math.max(1, Math.floor(phase));
  return patterns?.[safePhase - 1] ?? patterns?.[patterns.length - 1] ?? 'volley';
}
