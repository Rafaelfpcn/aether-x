import type { ExtendedObjectiveKind, ObjectiveSpec } from './objectives';
import type { VisualStyle } from './style-profile';

export type FuturisticCampaignMissionId =
  | 'training'
  | 'intercept'
  | 'sentinel'
  | 'harbor'
  | 'skyline'
  | 'canyon'
  | 'blackout'
  | 'dam';

export type RealisticCampaignMissionId =
  | 'r-highlands'
  | 'r-coast'
  | 'r-harbor'
  | 'r-metro'
  | 'r-wildfire'
  | 'r-desert'
  | 'r-canyon'
  | 'r-refinery'
  | 'r-arctic'
  | 'r-dam';

export type CampaignMissionId = FuturisticCampaignMissionId | RealisticCampaignMissionId;
export type ScenarioId = CampaignMissionId | 'river' | 'openworld' | 'openworld-realistic';
export type ScenarioEnvironment =
  | 'city'
  | 'harbor'
  | 'skyline'
  | 'dam'
  | 'river'
  | 'openworld'
  | 'highlands'
  | 'wildfire'
  | 'desert'
  | 'coast'
  | 'arctic'
  | 'refinery'
  | 'metro'
  | 'metro-open';

export type RiverStyle = VisualStyle;
export type ObjectiveKind = ExtendedObjectiveKind;
export type EnemyArchetype =
  | 'scout'
  | 'gunner'
  | 'bulwark'
  | 'sniper'
  | 'swarmer'
  | 'fpv'
  | 'fixedwing'
  | 'aaturret'
  | 'heavyhex'
  | 'gunboat';
export type BossKind = 'core' | 'attackheli';
export type BossAttackPattern = 'volley' | 'fan' | 'charge' | 'sniper' | 'burst';
export type FuturisticOpenWorldTaskId = 'ow-express' | 'ow-patrol' | 'ow-relay' | 'ow-convoy' | 'ow-overlord';
export type RealisticOpenWorldTaskId =
  | 'row-cargo'
  | 'row-bridge'
  | 'row-thief'
  | 'row-fire'
  | 'row-ambulance'
  | 'row-fpv'
  | 'row-stadium'
  | 'row-heli';
export type OpenWorldTaskId = FuturisticOpenWorldTaskId | RealisticOpenWorldTaskId;

export interface MissionDefinition {
  id: ScenarioId;
  index: number;
  code: string;
  name: string;
  sector: string;
  environment: ScenarioEnvironment;
  style?: VisualStyle;
  summary: string;
  objective: string;
  objectiveKind: ObjectiveKind;
  objectiveTarget: number;
  hudTarget: string;
  threat: string;
  medalTargets: {
    goldScore: number;
    silverScore: number;
    goldTime: number;
  };
  palette: {
    background: number;
    fog: number;
    gridCenter: number;
    gridLines: number;
  };
  gatePath?: readonly (readonly [number, number, number])[];
  enemyWave?: readonly EnemyArchetype[];
  bossHealth?: number;
  bossKind?: BossKind;
  bossPatterns?: readonly [BossAttackPattern, BossAttackPattern, BossAttackPattern];
  objectiveSpec?: ObjectiveSpec;
  weather?: 'clear' | 'rain' | 'snow' | 'sand' | 'ash' | 'fog';
}

export interface OpenWorldTaskDefinition {
  id: OpenWorldTaskId;
  code: string;
  name: string;
  district: string;
  kind: Exclude<ObjectiveKind, 'openworld'>;
  summary: string;
  objective: string;
  target: number;
  rewardPoints: number;
  beaconPosition: readonly [number, number, number];
  color: number;
  gatePath?: readonly (readonly [number, number, number])[];
  enemyWave?: readonly EnemyArchetype[];
  bossHealth?: number;
  bossKind?: BossKind;
  bossPatterns?: readonly [BossAttackPattern, BossAttackPattern, BossAttackPattern];
  objectiveSpec?: ObjectiveSpec;
}

export const RIVER_STYLE_CONFIGS: Record<
  RiverStyle,
  {
    id: RiverStyle;
    label: string;
    badge: string;
    subtitle: string;
    summary: string;
    droneDesc: string;
    enemyDesc: string;
    palette: MissionDefinition['palette'];
  }
> = {
  realistic: {
    id: 'realistic',
    label: 'Modo Realista',
    badge: 'BIOMA NATURAL · DJI SPEC',
    subtitle: 'Armamento balístico, HUD OSD óptico e alvos táticos em cenários naturais.',
    summary:
      'Condições atmosféricas naturais, colisão 3D, destroços com gravidade e alvos táticos. Voo arcade padrão; simulador opcional nas configurações.',
    droneDesc: 'Chassi em fibra de carbono fosca, hélices com pontas laranja de segurança e câmera óptica OSD.',
    enemyDesc: 'Frota militar realista: FPV kamikaze, VANT de asa fixa, torretas AA, lanchas e helicóptero de ataque.',
    palette: { background: 0x8ea9ad, fog: 0x9ab3b3, gridCenter: 0x4b7473, gridLines: 0x355354 },
  },
  futuristic: {
    id: 'futuristic',
    label: 'Modo Futurista',
    badge: 'INCURSÃO CYBERPUNK · NEON',
    subtitle: 'Canhões de plasma, HUD holográfico neon e esquadrões biomecânicos.',
    summary:
      'Combates de alta voltagem em cenários iluminados por neon, com física de impacto e destroços energizados.',
    droneDesc: 'Interceptador AETHER-X com anéis de plasma, conduítes luminescentes e propulsão sobrecarga.',
    enemyDesc: 'Unidades biomecânicas com núcleos octaedrais pulsantes, escudos pavês e trilhos railgun neon.',
    palette: { background: 0x071320, fog: 0x0d2236, gridCenter: 0x39e5ef, gridLines: 0x1a4b66 },
  },
};

export const MISSIONS: readonly MissionDefinition[] = [
  {
    id: 'training',
    index: 1,
    code: 'MISSÃO 01 · CALIBRAÇÃO DE VOO',
    name: 'Circuito de Calibração',
    sector: 'Setor 01 · Anel de Treinamento',
    environment: 'city',
    style: 'futuristic',
    summary: 'Sincronize propulsores, leitura de altitude e vetor de mira cruzando seis balizas de energia.',
    objective: 'Atravesse 6 balizas de calibração sem perder o controle do perímetro.',
    objectiveKind: 'gates',
    objectiveTarget: 6,
    hudTarget: 'ATRAVESSAR 06 BALIZAS DE ENERGIA',
    threat: 'Baixa · Voo de precisão',
    medalTargets: { goldScore: 950, silverScore: 700, goldTime: 55 },
    palette: { background: 0x071019, fog: 0x0d1b2a, gridCenter: 0x266e81, gridLines: 0x163041 },
  },
  {
    id: 'intercept',
    index: 2,
    code: 'MISSÃO 02 · INTERCEPTAÇÃO TÁTICA',
    name: 'Interceptação de Batedores',
    sector: 'Setor 02 · Corredor Industrial',
    environment: 'city',
    style: 'futuristic',
    summary: 'Drones batedores, enxames EMP e artilheiros invadiram o espaço aéreo. Elimine todos antes que triangulem a base.',
    objective: 'Destrua 6 drones hostis combinando batedores Viper, enxames Wasp, artilheiros e encouraçados.',
    objectiveKind: 'kills',
    objectiveTarget: 6,
    hudTarget: 'ELIMINAR 06 DRONES HOSTIS',
    threat: 'Média · Combate móvel em esquadrão',
    medalTargets: { goldScore: 1750, silverScore: 1300, goldTime: 78 },
    palette: { background: 0x090b16, fog: 0x14172b, gridCenter: 0x385e96, gridLines: 0x1b2b46 },
    enemyWave: ['scout', 'swarmer', 'scout', 'gunner', 'swarmer', 'bulwark'],
  },
  {
    id: 'sentinel',
    index: 3,
    code: 'MISSÃO 03 · NÚCLEO SENTINELA',
    name: 'Protocolo Titã',
    sector: 'Setor 03 · Plataforma Orbital Baixa',
    environment: 'city',
    style: 'futuristic',
    summary: 'O Núcleo Sentinela bloqueia a saída do distrito. Ataque quando as pétalas blindadas abrirem e sobreviva às três fases.',
    objective: 'Destrua o chefe Núcleo Sentinela aproveitando as janelas de núcleo exposto.',
    objectiveKind: 'boss',
    objectiveTarget: 1,
    hudTarget: 'DESTRUIR O NÚCLEO SENTINELA',
    threat: 'Alta · Chefe em 3 fases',
    medalTargets: { goldScore: 2200, silverScore: 1650, goldTime: 95 },
    palette: { background: 0x120812, fog: 0x221024, gridCenter: 0x893259, gridLines: 0x351829 },
    bossHealth: 1800,
    bossKind: 'core',
    bossPatterns: ['volley', 'fan', 'charge'],
  },
  {
    id: 'harbor',
    index: 4,
    code: 'MISSÃO 04 · PORTO INDUSTRIAL',
    name: 'Patrulha do Porto',
    sector: 'Setor 04 · Docas Automatizadas sob Chuva',
    environment: 'harbor',
    style: 'futuristic',
    summary: 'Voe entre guindastes e contêineres sobre o canal chuvoso para eliminar batedores, enxames e franco-atiradores railgun.',
    objective: 'Neutralize 8 drones hostis sobre o canal portuário sem perder o controle entre os píeres.',
    objectiveKind: 'kills',
    objectiveTarget: 8,
    hudTarget: 'NEUTRALIZAR 08 INVASORES NO PORTO',
    threat: 'Alta · Visibilidade reduzida e fogo de Sniper',
    medalTargets: { goldScore: 2350, silverScore: 1750, goldTime: 92 },
    palette: { background: 0x06131a, fog: 0x102631, gridCenter: 0x2b7e89, gridLines: 0x163842 },
    enemyWave: ['scout', 'gunner', 'swarmer', 'bulwark', 'sniper', 'scout', 'gunner', 'bulwark'],
    weather: 'rain',
  },
  {
    id: 'skyline',
    index: 5,
    code: 'MISSÃO 05 · CORREDOR DAS TORRES',
    name: 'Horizonte de Vento',
    sector: 'Setor 05 · Torres Solares de Alta Altitude',
    environment: 'skyline',
    style: 'futuristic',
    summary: 'Suba acima da camada de nuvens e cruze seis balizas instaladas entre passarelas suspensas e torres solares.',
    objective: 'Complete o percurso aéreo de 6 balizas mantendo velocidade nas curvas em altitude.',
    objectiveKind: 'gates',
    objectiveTarget: 6,
    hudTarget: 'CRUZAR 06 BALIZAS NAS TORRES',
    threat: 'Média · Trajeto técnico em altitude',
    medalTargets: { goldScore: 1150, silverScore: 840, goldTime: 52 },
    palette: { background: 0x111827, fog: 0x24324c, gridCenter: 0x5aa7cf, gridLines: 0x27445d },
    gatePath: [
      [0, 13, -44],
      [38, 19, -24],
      [48, 25, 22],
      [4, 29, 54],
      [-44, 22, 26],
      [-36, 15, -28],
    ],
  },
  {
    id: 'canyon',
    index: 6,
    code: 'MISSÃO 06 · DESFILADEIRO DAS CATARATAS',
    name: 'Garganta de Basalto',
    sector: 'Setor 06 · Cânion Hidroelétrico',
    environment: 'river',
    style: 'futuristic',
    summary: 'Uma força-tarefa hostil infiltrou o cânion das cataratas para drenar a bacia. Intercepte os esquadrões ao longo da correnteza.',
    objective: 'Elimine 8 drones invasores (incluindo Railgunners Specter e enxames Wasp) diante da cachoeira.',
    objectiveKind: 'kills',
    objectiveTarget: 8,
    hudTarget: 'EXPULSAR 08 INVASORES DO CÂNION',
    threat: 'Alta · Combate em vale estreito com Snipers',
    medalTargets: { goldScore: 2450, silverScore: 1850, goldTime: 94 },
    palette: { background: 0x081724, fog: 0x0e283b, gridCenter: 0x39e5ef, gridLines: 0x1b4c63 },
    enemyWave: ['scout', 'swarmer', 'gunner', 'sniper', 'scout', 'swarmer', 'bulwark', 'sniper'],
  },
  {
    id: 'blackout',
    index: 7,
    code: 'MISSÃO 07 · ZONA DE SOMBRA',
    name: 'Contra-Ataque Noturno',
    sector: 'Setor 07 · Estratosfera Ciber-Urbana',
    environment: 'skyline',
    style: 'futuristic',
    summary: 'A guarda de elite inimiga montou um bloqueio com Encouraçados Bastion e Franco-Atiradores Specter nas torres superiores.',
    objective: 'Destrua 9 unidades de elite para abrir caminho até a Represa Hidroelétrica.',
    objectiveKind: 'kills',
    objectiveTarget: 9,
    hudTarget: 'DESTRUIR 09 UNIDADES DE ELITE',
    threat: 'Muito Alta · Esquadrão pesado e fogo cruzado',
    medalTargets: { goldScore: 2750, silverScore: 2050, goldTime: 102 },
    palette: { background: 0x0c091c, fog: 0x191233, gridCenter: 0x9b5de5, gridLines: 0x36205c },
    enemyWave: ['swarmer', 'sniper', 'gunner', 'bulwark', 'swarmer', 'sniper', 'scout', 'bulwark', 'sniper'],
  },
  {
    id: 'dam',
    index: 8,
    code: 'MISSÃO 08 · REPRESA HIDROELÉTRICA',
    name: 'Tempestade na Represa',
    sector: 'Setor 08 · Megaconstrução da Garganta Norte',
    environment: 'dam',
    style: 'futuristic',
    summary: 'O Leviatã Hidrelétrico drena a rede de contenção da represa. Desvie das descargas de plasma e destrua seu reator central.',
    objective: 'Derrote o chefe Leviatã Hidrelétrico antes que a sobrecarga rompa o paredão.',
    objectiveKind: 'boss',
    objectiveTarget: 1,
    hudTarget: 'DESTRUIR O LEVIATÃ HIDRELÉTRICO',
    threat: 'Crítica · Chefe final de campanha',
    medalTargets: { goldScore: 2800, silverScore: 2100, goldTime: 108 },
    palette: { background: 0x07161e, fog: 0x112b38, gridCenter: 0x45b8ac, gridLines: 0x1f4d53 },
    bossHealth: 3200,
    bossKind: 'core',
    bossPatterns: ['fan', 'charge', 'volley'],
  },
];

/**
 * CAMPANHA REALISTA — 10 Operações Táticas Exclusivas (7 novos biomas + Porto, Cânion e Represa realistas)
 */
export const REALISTIC_MISSIONS: readonly MissionDefinition[] = [
  {
    id: 'r-highlands',
    index: 1,
    code: 'OPERAÇÃO 01 · SERRA DA NEBLINA',
    name: 'Busca na Serra',
    sector: 'Setor 01 · Vale dos Pinheiros',
    environment: 'highlands',
    style: 'realistic',
    summary: 'Três montanhistas ativaram sinalizadores de emergência entre os vales nebulosos da serra. Localize-os e paire sobre cada ponto.',
    objective: 'Localize os 3 sinais de emergência e mantenha voo pairado por 3.5s sobre cada sobrevivente enquanto repele drones FPV.',
    objectiveKind: 'rescue',
    objectiveTarget: 3,
    hudTarget: 'RESGATAR 03 SOBREVIVENTES NA SERRA',
    threat: 'Baixa · Vento de vale e drones FPV isolados',
    medalTargets: { goldScore: 1200, silverScore: 850, goldTime: 75 },
    palette: { background: 0x99aeb5, fog: 0xa6babf, gridCenter: 0x4e6e58, gridLines: 0x354d3c },
    enemyWave: ['fpv', 'scout', 'fpv'],
    weather: 'fog',
    objectiveSpec: {
      kind: 'rescue',
      points: [
        [-32, 7.5, -28],
        [36, 9.0, -18],
        [4, 8.5, 42],
      ],
      holdSeconds: 3.5,
      radius: 9.5,
      maxHoverSpeed: 9.5,
    },
  },
  {
    id: 'r-coast',
    index: 2,
    code: 'OPERAÇÃO 02 · FALÉSIAS DO POENTE',
    name: 'Sombra no Litoral',
    sector: 'Setor 02 · Costa Atlântica e Cargueiro',
    environment: 'coast',
    style: 'realistic',
    summary: 'Um cargueiro clandestino e lanchas armadas ancoraram junto às falésias ao pôr do sol. Fotografe os 4 alvos mantendo-os na mira óptica.',
    objective: 'Enquadre e fotografe 4 alvos navais/costeiros a menos de 75m sob patrulha de VANTs de asa fixa e lanchas.',
    objectiveKind: 'recon',
    objectiveTarget: 4,
    hudTarget: 'FOTOGRAFAR 04 ALVOS COSTEIROS',
    threat: 'Média · Lanchas armadas e VANTs de asa fixa',
    medalTargets: { goldScore: 1450, silverScore: 1050, goldTime: 82 },
    palette: { background: 0xd98a6c, fog: 0xc9826b, gridCenter: 0x4d6b7d, gridLines: 0x2f4654 },
    enemyWave: ['gunboat', 'fixedwing', 'gunboat', 'scout'],
    weather: 'clear',
    objectiveSpec: {
      kind: 'recon',
      targets: [
        [0, 9, -46],
        [-38, 6, -16],
        [36, 6, 18],
        [-22, 13, 38],
      ],
      scanSeconds: 2.2,
      maxRange: 78,
      minAlignmentCos: 0.9,
    },
  },
  {
    id: 'r-harbor',
    index: 3,
    code: 'OPERAÇÃO 03 · PORTO SOB CHUVA',
    name: 'Bloqueio Marítimo',
    sector: 'Setor 03 · Terminal de Contêineres',
    environment: 'harbor',
    style: 'realistic',
    summary: 'Sob tempestade costeira, lanchas artilhadas, drones FPV kamikaze e hexacópteros tomaram o terminal portuário.',
    objective: 'Elimine 8 unidades hostis usando os guindastes e pilhas de contêineres como cobertura.',
    objectiveKind: 'kills',
    objectiveTarget: 8,
    hudTarget: 'ELIMINAR 08 HOSTIS NO PORTO',
    threat: 'Alta · Chuva forte, lanchas e FPVs',
    medalTargets: { goldScore: 2250, silverScore: 1650, goldTime: 92 },
    palette: { background: 0x5c707a, fog: 0x677b85, gridCenter: 0x3b5866, gridLines: 0x263b45 },
    enemyWave: ['gunboat', 'fpv', 'scout', 'heavyhex', 'gunboat', 'fpv', 'fixedwing', 'heavyhex'],
    weather: 'rain',
  },
  {
    id: 'r-metro',
    index: 4,
    code: 'OPERAÇÃO 04 · CENTRO METROPOLITANO',
    name: 'Entrega Urgente',
    sector: 'Setor 04 · Distrito Financeiro Diurno',
    environment: 'metro',
    style: 'realistic',
    summary: 'Transporte 3 cargas médicas urgentes entre helipontos e praças do centro urbano desviando de drones interceptadores e rajadas entre prédios.',
    objective: 'Colete e entregue 3 pacotes pesados (a massa reduz a agilidade do drone; evite colisões fortes para não derrubar a carga).',
    objectiveKind: 'cargo',
    objectiveTarget: 3,
    hudTarget: 'CONCLUIR 03 ENTREGAS DE CARGA',
    threat: 'Média · Turbulência urbana e peso de carga',
    medalTargets: { goldScore: 1650, silverScore: 1200, goldTime: 95 },
    palette: { background: 0x87b2d4, fog: 0x9bc0dc, gridCenter: 0x4b6a82, gridLines: 0x344b5c },
    enemyWave: ['fpv', 'scout', 'heavyhex', 'fpv'],
    weather: 'clear',
    objectiveSpec: {
      kind: 'cargo',
      radius: 8.5,
      deliveries: [
        { pickup: [-36, 8, 28], dropoff: [38, 14, -32], mass: 0.32 },
        { pickup: [34, 8, 30], dropoff: [-38, 15, -30], mass: 0.38 },
        { pickup: [0, 8, 42], dropoff: [0, 16, -48], mass: 0.42 },
      ],
    },
  },
  {
    id: 'r-wildfire',
    index: 5,
    code: 'OPERAÇÃO 05 · FLORESTA EM CHAMAS',
    name: 'Linha de Fogo',
    sector: 'Setor 05 · Reserva Florestal Incendiada',
    environment: 'wildfire',
    style: 'realistic',
    summary: 'Focos de incêndio ameaçam a reserva enquanto drones incendiários FPV rondam na fumaça. Sobrevoe os 5 focos para lançar retardante térmico.',
    objective: 'Debele 5 focos de incêndio sobrevoando cada foco (segure E para dispersão máxima) e cuidado com árvores que tombam.',
    objectiveKind: 'firefight',
    objectiveTarget: 5,
    hudTarget: 'EXTINGUIR 05 FOCOS DE INCÊNDIO',
    threat: 'Alta · Fumaça densa, árvores caindo e FPVs',
    medalTargets: { goldScore: 1850, silverScore: 1350, goldTime: 98 },
    palette: { background: 0x6e422c, fog: 0x7a4930, gridCenter: 0xb85d2e, gridLines: 0x5c2e16 },
    enemyWave: ['fpv', 'fpv', 'scout', 'fpv', 'heavyhex'],
    weather: 'ash',
    objectiveSpec: {
      kind: 'firefight',
      fires: [
        [-34, 4, -26],
        [28, 4, -30],
        [0, 4, 4],
        [-30, 4, 32],
        [34, 4, 26],
      ],
      dropRadius: 12,
      extinguishSeconds: 2.6,
    },
  },
  {
    id: 'r-desert',
    index: 6,
    code: 'OPERAÇÃO 06 · DESERTO DE ARENITO',
    name: 'Comboio do Deserto',
    sector: 'Setor 06 · Cânion Árido sob Tempestade',
    environment: 'desert',
    style: 'realistic',
    summary: 'Proteja o comboio terrestre que atravessa o cânion árido sob tempestade de areia contra torretas antiaéreas, VANTs de asa fixa e FPVs.',
    objective: 'Escolte o veículo blindado por 4 checkpoints sem deixar sua integridade zerar.',
    objectiveKind: 'escort',
    objectiveTarget: 4,
    hudTarget: 'ESCOLTAR COMBOIO PELO DESERTO',
    threat: 'Alta · Torretas AA, VANTs e tempestade de areia',
    medalTargets: { goldScore: 2100, silverScore: 1550, goldTime: 96 },
    palette: { background: 0xc99d6e, fog: 0xd1a779, gridCenter: 0x8c6239, gridLines: 0x593e24 },
    enemyWave: ['aaturret', 'fixedwing', 'fpv', 'aaturret', 'heavyhex', 'fpv'],
    weather: 'sand',
    objectiveSpec: {
      kind: 'escort',
      speed: 5.2,
      maxHp: 100,
      waypoints: [
        [-52, 2.2, 42],
        [-18, 2.2, 16],
        [16, 2.2, -10],
        [42, 2.2, -34],
        [56, 2.2, -52],
      ],
    },
  },
  {
    id: 'r-canyon',
    index: 7,
    code: 'OPERAÇÃO 07 · VALE DAS CATARATAS',
    name: 'Desfiladeiro Esmeralda',
    sector: 'Setor 07 · Garganta do Rio sob Luz Diurna',
    environment: 'river',
    style: 'realistic',
    summary: 'Uma força de reconhecimento hostil ocupou o cânion da cachoeira. Use as paredes de rocha como cobertura contra franco-atiradores e VANTs.',
    objective: 'Elimine 9 drones militares hostis ao longo do rio e da cachoeira.',
    objectiveKind: 'kills',
    objectiveTarget: 9,
    hudTarget: 'ELIMINAR 09 HOSTIS NO CÂNION',
    threat: 'Alta · Franco-atiradores e FPVs na garganta',
    medalTargets: { goldScore: 2550, silverScore: 1900, goldTime: 98 },
    palette: { background: 0x8ea9ad, fog: 0x9ab3b3, gridCenter: 0x4b7473, gridLines: 0x355354 },
    enemyWave: ['fpv', 'fixedwing', 'sniper', 'heavyhex', 'fpv', 'sniper', 'gunboat', 'fixedwing', 'heavyhex'],
    weather: 'clear',
  },
  {
    id: 'r-refinery',
    index: 8,
    code: 'OPERAÇÃO 08 · REFINARIA NOTURNA',
    name: 'Refinaria em Alerta',
    sector: 'Setor 08 · Complexo Petroquímico',
    environment: 'refinery',
    style: 'realistic',
    summary: 'Defenda o complexo petroquímico à noite iluminado por chamas de chaminés. Barris explosivos no pátio podem detonar os invasores.',
    objective: 'Sobreviva e mantenha o perímetro por 65 segundos contra ondas contínuas de hexacópteros, torretas e FPVs.',
    objectiveKind: 'survival',
    objectiveTarget: 65,
    hudTarget: 'RESISTIR POR 65 SEGUNDOS NA REFINARIA',
    threat: 'Muito Alta · Combate noturno e explosões em cadeia',
    medalTargets: { goldScore: 2400, silverScore: 1800, goldTime: 70 },
    palette: { background: 0x17120e, fog: 0x261c14, gridCenter: 0xd9722b, gridLines: 0x592e12 },
    enemyWave: ['fpv', 'heavyhex', 'aaturret', 'fpv', 'gunner', 'heavyhex', 'fpv', 'sniper'],
    weather: 'ash',
    objectiveSpec: {
      kind: 'survival',
      durationSeconds: 65,
    },
  },
  {
    id: 'r-arctic',
    index: 9,
    code: 'OPERAÇÃO 09 · BASE ÁRTICA',
    name: 'Estação Polar',
    sector: 'Setor 09 · Cordilheira Glacial',
    environment: 'arctic',
    style: 'realistic',
    summary: 'Sob nevasca severa e ventos glaciais, inspecione 4 domos de radar na base ártica protegidos por hexacópteros blindados e VANTs.',
    objective: 'Fotografe 4 domos de comunicação na nevasca mantendo o controle contra rajadas polares.',
    objectiveKind: 'recon',
    objectiveTarget: 4,
    hudTarget: 'INSPECIONAR 04 DOMOS POLARES',
    threat: 'Muito Alta · Nevasca forte, gelo e artilharia pesada',
    medalTargets: { goldScore: 2300, silverScore: 1700, goldTime: 88 },
    palette: { background: 0xc8d9e6, fog: 0xd2e1ec, gridCenter: 0x5c85a6, gridLines: 0x3b5973 },
    enemyWave: ['fixedwing', 'heavyhex', 'sniper', 'fpv', 'heavyhex', 'fixedwing'],
    weather: 'snow',
    objectiveSpec: {
      kind: 'recon',
      targets: [
        [-36, 9, -30],
        [36, 10, -28],
        [-32, 9, 32],
        [34, 11, 34],
      ],
      scanSeconds: 2.3,
      maxRange: 78,
      minAlignmentCos: 0.9,
    },
  },
  {
    id: 'r-dam',
    index: 10,
    code: 'OPERAÇÃO 10 · REPRESA HIDROELÉTRICA',
    name: 'Confronto com o Gunship',
    sector: 'Setor 10 · Paredão da Represa Norte',
    environment: 'dam',
    style: 'realistic',
    summary: 'Um Helicóptero de Ataque blindado lidera a ofensiva final sobre a represa. Use as torres de concreto para despistar mísseis e atingir o rotor/turbina.',
    objective: 'Derrote o Helicóptero de Ataque (chefe realista em 3 fases) atingindo-o nas janelas de vulnerabilidade.',
    objectiveKind: 'boss',
    objectiveTarget: 1,
    hudTarget: 'ABATER O HELICÓPTERO DE ATAQUE',
    threat: 'Crítica · Chefe Final Gunship + Escolta',
    medalTargets: { goldScore: 3000, silverScore: 2250, goldTime: 112 },
    palette: { background: 0x6f8791, fog: 0x7c949e, gridCenter: 0x456973, gridLines: 0x2c454d },
    bossHealth: 920,
    bossKind: 'attackheli',
    bossPatterns: ['fan', 'sniper', 'burst'],
    weather: 'rain',
  },
];

export const RIVER_MODE: MissionDefinition = {
  id: 'river',
  index: 0,
  code: 'MODO ESPECIAL · RIO E CACHOEIRA',
  name: 'Vale da Cachoeira',
  sector: 'Setor Livre · Garganta do Rio Esmeralda',
  environment: 'river',
  summary:
    'Voe sobre as águas do cânion, contorne rochas e árvores e atravesse a névoa da grande cachoeira enquanto elimina 10 drones hostis.',
  objective: 'Elimine 10 drones hostis ao longo do rio até a queda-d’água.',
  objectiveKind: 'kills',
  objectiveTarget: 10,
  hudTarget: 'ELIMINAR 10 DRONES NO RIO',
  threat: 'Variável · Voo rasante no cânion da cachoeira',
  medalTargets: { goldScore: 2650, silverScore: 1950, goldTime: 108 },
  palette: RIVER_STYLE_CONFIGS.realistic.palette,
  enemyWave: ['scout', 'swarmer', 'gunner', 'sniper', 'bulwark', 'scout', 'swarmer', 'gunner', 'sniper', 'bulwark'],
};

export const OPEN_WORLD_MODE: MissionDefinition = {
  id: 'openworld',
  index: 0,
  code: 'MUNDO ABERTO · MEGACIDADE NEO-AETHER',
  name: 'Patrulha Livre: Neo-Aether',
  sector: 'Metrópole Central · 4 Distritos Conectados',
  environment: 'openworld',
  style: 'futuristic',
  summary:
    'Explore livremente os 4 distritos da megacidade Neo-Aether. Voe até os sinalizadores holográficos ou selecione uma Task no painel tático do HUD a qualquer momento.',
  objective: 'Voe até qualquer sinalizador luminoso na cidade (ou clique no painel lateral) para iniciar 5 Tasks dinâmicas.',
  objectiveKind: 'openworld',
  objectiveTarget: 5,
  hudTarget: 'EXPLORAR A CIDADE OU INICIAR UMA TASK',
  threat: 'Dinâmica · Voo Livre + 5 Contratos Urbanos',
  medalTargets: { goldScore: 3200, silverScore: 2000, goldTime: 180 },
  palette: { background: 0x070d18, fog: 0x0e192d, gridCenter: 0x39e5ef, gridLines: 0x183652 },
};

export const REALISTIC_OPEN_WORLD_MODE: MissionDefinition = {
  id: 'openworld-realistic',
  index: 0,
  code: 'MUNDO ABERTO REALISTA · VALE ATLÂNTICO',
  name: 'Metrópole Vale Atlântico',
  sector: 'Cidade Costeira Diurna · Rio, Ponte Estaiada, Parque e Estádio',
  environment: 'metro-open',
  style: 'realistic',
  summary:
    'Voe livremente sobre uma metrópole realista diurna com rio, pontes estaiadas, avenida expressa com tráfego de veículos, parque central, estádio e porto. Aceite 8 operações reais.',
  objective: 'Aproxime-se dos sinalizadores táticos ou acione qualquer uma das 8 Operações Urbanas Realistas pelo painel.',
  objectiveKind: 'openworld',
  objectiveTarget: 8,
  hudTarget: 'EXPLORAR VALE ATLÂNTICO · 08 OPERAÇÕES DISPONÍVEIS',
  threat: 'Dinâmica · Tráfego Urbano + 8 Operações Táticas',
  medalTargets: { goldScore: 4200, silverScore: 2600, goldTime: 220 },
  palette: { background: 0x87b4d6, fog: 0x9ec3de, gridCenter: 0x466985, gridLines: 0x2e485c },
};

export const OPEN_WORLD_TASKS: readonly OpenWorldTaskDefinition[] = [
  {
    id: 'ow-express',
    code: 'TASK 01 · CORRIDA EXPRESSA',
    name: 'Rota Expressa Neon',
    district: 'Avenida Central & Pontes',
    kind: 'gates',
    summary: 'Cruze 8 anéis de sincronização em alta velocidade costurando as pontes suspensas e avenidas da metrópole.',
    objective: 'Atravesse as 8 balizas da Rota Expressa Neon.',
    target: 8,
    rewardPoints: 800,
    beaconPosition: [0, 12, -55],
    color: 0x39e5ef,
    gatePath: [
      [0, 12, -70],
      [48, 16, -62],
      [82, 20, -18],
      [66, 15, 42],
      [12, 18, 76],
      [-48, 14, 58],
      [-78, 22, 4],
      [-42, 15, -48],
    ],
  },
  {
    id: 'ow-patrol',
    code: 'TASK 02 · VARREDURA DE ENXAME',
    name: 'Supressão de Enxame',
    district: 'Distrito Comercial Leste',
    kind: 'kills',
    summary: 'Um enxame de micro-drones Wasp e batedores Viper invadiu o corredor comercial. Elimine todas as unidades.',
    objective: 'Destrua 6 drones hostis no Distrito Leste.',
    target: 6,
    rewardPoints: 950,
    beaconPosition: [72, 14, -12],
    color: 0x70f0c2,
    enemyWave: ['swarmer', 'scout', 'swarmer', 'gunner', 'swarmer', 'scout'],
  },
  {
    id: 'ow-relay',
    code: 'TASK 03 · REDE DE HELIPONTOS',
    name: 'Sincronização de Antenas',
    district: 'Topo dos Arranha-Céus',
    kind: 'gates',
    summary: 'Suba até o topo dos edifícios corporativos para recalibrar 6 terminais de transmissão em grande altitude.',
    objective: 'Sincronize 6 balizas instaladas nos helipontos elevados.',
    target: 6,
    rewardPoints: 900,
    beaconPosition: [-68, 20, -24],
    color: 0xffca68,
    gatePath: [
      [-65, 30, -35],
      [-25, 34, -65],
      [35, 32, -55],
      [65, 35, 15],
      [25, 31, 65],
      [-45, 33, 45],
    ],
  },
  {
    id: 'ow-convoy',
    code: 'TASK 04 · DEFESA DE CONVOI',
    name: 'Caçada aos Franco-Atiradores',
    district: 'Setor Financeiro Sul',
    kind: 'kills',
    summary: 'Franco-atiradores Specter e Encouraçados Bastion montaram emboscada nos terraços do sul. Neutralize-os.',
    objective: 'Elimine 7 unidades de elite (Snipers e Bulwarks).',
    target: 7,
    rewardPoints: 1200,
    beaconPosition: [14, 15, 74],
    color: 0xb56cff,
    enemyWave: ['sniper', 'bulwark', 'gunner', 'sniper', 'swarmer', 'bulwark', 'sniper'],
  },
  {
    id: 'ow-overlord',
    code: 'TASK 05 · ALERTA TITÃ URBANO',
    name: 'Protocolo Overlord',
    district: 'Praça Central da Metrópole',
    kind: 'boss',
    summary: 'Uma fortaleza aérea Overlord desceu sobre o núcleo da cidade. Destrua seu reator quando as pétalas blindadas abrirem.',
    objective: 'Derrote o chefe urbano Overlord em 3 fases.',
    target: 1,
    rewardPoints: 1600,
    beaconPosition: [-18, 18, 18],
    color: 0xff476b,
    bossHealth: 780,
    bossKind: 'core',
    bossPatterns: ['fan', 'sniper', 'burst'],
  },
];

/**
 * 8 TASKS EXCLUSIVAS DO MUNDO ABERTO REALISTA (Metrópole Vale Atlântico)
 */
export const REALISTIC_OPEN_WORLD_TASKS: readonly OpenWorldTaskDefinition[] = [
  {
    id: 'row-cargo',
    code: 'OP 01 · ENTREGA EXPRESSA',
    name: 'Suprimento Hospitalar',
    district: 'Centro Financeiro -> Hospital Sul',
    kind: 'cargo',
    summary: 'Colete 2 lotes de plasma sanguíneo nos helipontos centrais e entregue com urgência sob vento cruzado.',
    objective: 'Conclua 2 entregas de carga médica sem bater o drone.',
    target: 2,
    rewardPoints: 950,
    beaconPosition: [-46, 12, -42],
    color: 0x3ba8ff,
    objectiveSpec: {
      kind: 'cargo',
      radius: 9,
      deliveries: [
        { pickup: [-46, 10, -42], dropoff: [54, 14, 38], mass: 0.34 },
        { pickup: [54, 14, 38], dropoff: [-58, 12, 48], mass: 0.38 },
      ],
    },
  },
  {
    id: 'row-bridge',
    code: 'OP 02 · INSPEÇÃO ESTRUTURAL',
    name: 'Vistoria da Ponte Estaiada',
    district: 'Canal do Rio Atlântico',
    kind: 'recon',
    summary: 'Enquadre e fotografe 4 pilares e cabos de aço da Ponte Estaiada e do viaduto fluvial.',
    objective: 'Fotografe 4 pontos estruturais da ponte mantendo o alvo no centro do OSD.',
    target: 4,
    rewardPoints: 900,
    beaconPosition: [0, 14, -18],
    color: 0x2ec4b6,
    objectiveSpec: {
      kind: 'recon',
      targets: [
        [-28, 18, -10],
        [28, 18, -10],
        [0, 22, 26],
        [0, 14, -56],
      ],
      scanSeconds: 2.0,
      maxRange: 80,
      minAlignmentCos: 0.9,
    },
  },
  {
    id: 'row-thief',
    code: 'OP 03 · INTERCEPTAÇÃO POLICIAL',
    name: 'Caçada ao Drone Contrabandista',
    district: 'Zona Portuária Leste',
    kind: 'kills',
    summary: 'Drones velozes de contrabando e VANTs de escolta decolaram das docas. Abata todo o grupo antes que escapem.',
    objective: 'Abata 6 drones hostis (FPV, VANTs de asa fixa e Hexacópteros).',
    target: 6,
    rewardPoints: 1050,
    beaconPosition: [86, 12, -32],
    color: 0xff9f1c,
    enemyWave: ['fpv', 'fixedwing', 'scout', 'fpv', 'heavyhex', 'fixedwing'],
  },
  {
    id: 'row-fire',
    code: 'OP 04 · BOMBEIRO AÉREO',
    name: 'Incêndio no Parque e Telhados',
    district: 'Parque Municipal & Torres',
    kind: 'firefight',
    summary: 'Um curto-circuito iniciou 4 focos de incêndio próximos ao parque e terraços. Lance água/retardante sobre as chamas.',
    objective: 'Extinga 4 focos de incêndio urbano sobrevoando cada foco.',
    target: 4,
    rewardPoints: 1100,
    beaconPosition: [-76, 11, 22],
    color: 0xff595e,
    objectiveSpec: {
      kind: 'firefight',
      fires: [
        [-76, 5, 22],
        [-52, 16, -8],
        [-88, 6, -24],
        [-42, 5, 52],
      ],
      dropRadius: 12,
      extinguishSeconds: 2.4,
    },
  },
  {
    id: 'row-ambulance',
    code: 'OP 05 · ESCOLTA MÉDICA',
    name: 'Corredor da Ambulância',
    district: 'Avenida Expressa Norte-Sul',
    kind: 'escort',
    summary: 'Escolte a unidade móvel de emergência ao longo da avenida principal contra drones FPV hostis.',
    objective: 'Proteja o veículo de resgate por 4 trechos da avenida.',
    target: 4,
    rewardPoints: 1150,
    beaconPosition: [36, 10, -78],
    color: 0x52b788,
    enemyWave: ['fpv', 'scout', 'fpv', 'heavyhex'],
    objectiveSpec: {
      kind: 'escort',
      speed: 5.8,
      maxHp: 100,
      waypoints: [
        [36, 1.8, -78],
        [36, 1.8, -26],
        [36, 1.8, 28],
        [36, 1.8, 78],
        [10, 1.8, 92],
      ],
    },
  },
  {
    id: 'row-fpv',
    code: 'OP 06 · RESGATE NO TELHADO',
    name: 'Extração em Cobertura',
    district: 'Bairro Residencial & Torres',
    kind: 'rescue',
    summary: 'Três equipes de manutenção ficaram isoladas nos terraços após uma pane. Paire sobre cada terraço para resgate.',
    objective: 'Localize e paire sobre 3 pontos de extração em telhados.',
    target: 3,
    rewardPoints: 1000,
    beaconPosition: [-22, 14, 82],
    color: 0xffca3a,
    enemyWave: ['fpv', 'fpv'],
    objectiveSpec: {
      kind: 'rescue',
      points: [
        [-22, 18, 82],
        [24, 22, 68],
        [-64, 16, 64],
      ],
      holdSeconds: 3.2,
      radius: 9.5,
      maxHoverSpeed: 9.5,
    },
  },
  {
    id: 'row-stadium',
    code: 'OP 07 · DEFESA DE PERÍMETRO',
    name: 'Cerco ao Estádio Olímpico',
    district: 'Complexo Esportivo',
    kind: 'survival',
    summary: 'Um enxame coordenado de drones FPV e hexacópteros tenta invadir a arena. Mantenha a defesa aérea ativa.',
    objective: 'Sobreviva e proteja o espaço aéreo do estádio por 50 segundos.',
    target: 50,
    rewardPoints: 1250,
    beaconPosition: [78, 14, 62],
    color: 0x8ac926,
    enemyWave: ['fpv', 'heavyhex', 'fixedwing', 'fpv', 'sniper', 'heavyhex'],
    objectiveSpec: {
      kind: 'survival',
      durationSeconds: 50,
    },
  },
  {
    id: 'row-heli',
    code: 'OP 08 · ALERTA GUNSHIP',
    name: 'Caça ao Helicóptero Renegado',
    district: 'Espaço Aéreo Central',
    kind: 'boss',
    summary: 'Um Helicóptero de Ataque renegado sobrevoa o canal central da metrópole. Neutralize-o usando os prédios como cobertura.',
    objective: 'Derrote o Helicóptero de Ataque em 3 fases.',
    target: 1,
    rewardPoints: 1800,
    beaconPosition: [18, 18, 18],
    color: 0xe63946,
    bossHealth: 840,
    bossKind: 'attackheli',
    bossPatterns: ['fan', 'sniper', 'burst'],
  },
];

export function campaignsForStyle(style: VisualStyle): readonly MissionDefinition[] {
  return style === 'realistic' ? REALISTIC_MISSIONS : MISSIONS;
}

export function openWorldModeForStyle(style: VisualStyle): MissionDefinition {
  return style === 'realistic' ? REALISTIC_OPEN_WORLD_MODE : OPEN_WORLD_MODE;
}

export function openWorldTasksForStyle(style: VisualStyle): readonly OpenWorldTaskDefinition[] {
  return style === 'realistic' ? REALISTIC_OPEN_WORLD_TASKS : OPEN_WORLD_TASKS;
}

export function missionById(id: ScenarioId): MissionDefinition {
  if (id === 'river') return RIVER_MODE;
  if (id === 'openworld') return OPEN_WORLD_MODE;
  if (id === 'openworld-realistic') return REALISTIC_OPEN_WORLD_MODE;
  const mission =
    MISSIONS.find((item) => item.id === id) ?? REALISTIC_MISSIONS.find((item) => item.id === id);
  if (!mission) throw new Error(`Missão desconhecida: ${id}`);
  return mission;
}

export function missionIdAt(index: number, style: VisualStyle = 'futuristic'): CampaignMissionId | null {
  const list = campaignsForStyle(style);
  return (list[index]?.id as CampaignMissionId | undefined) ?? null;
}

export function openWorldTaskById(id: OpenWorldTaskId): OpenWorldTaskDefinition {
  const task =
    OPEN_WORLD_TASKS.find((item) => item.id === id) ??
    REALISTIC_OPEN_WORLD_TASKS.find((item) => item.id === id);
  if (!task) throw new Error(`Task de mundo aberto desconhecida: ${id}`);
  return task;
}

export function bossPatternForPhase(
  patterns: readonly [BossAttackPattern, BossAttackPattern, BossAttackPattern] | undefined,
  phase: 1 | 2 | 3,
): BossAttackPattern {
  const fallback: readonly [BossAttackPattern, BossAttackPattern, BossAttackPattern] = ['volley', 'fan', 'charge'];
  return (patterns ?? fallback)[phase - 1] ?? 'volley';
}
