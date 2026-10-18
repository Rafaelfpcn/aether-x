import type { VisualStyle } from './style-profile';

export type RealisticDroneId = 'dji-mavic' | 'fpv-racer' | 'heavy-hex' | 'predator-uav';
export type FuturisticDroneId = 'aether-x' | 'specter-neon' | 'valkyrie-gunship' | 'omega-core';
export type DroneId = RealisticDroneId | FuturisticDroneId;

export type UpgradeCategory = 'propulsion' | 'chassis' | 'weapons' | 'battery' | 'avionics';
export type UpgradeCategoryId = UpgradeCategory;
export type DroneChassisShape = 'quad' | 'racer' | 'hex' | 'wing';

export const UPGRADE_CATEGORIES: readonly UpgradeCategory[] = [
  'propulsion',
  'chassis',
  'weapons',
  'battery',
  'avionics',
] as const;

export const UPGRADE_CATEGORY_LABELS: Readonly<Record<UpgradeCategory, string>> = {
  propulsion: 'Propulsão & Motores',
  chassis: 'Chassi & Blindagem',
  weapons: 'Armamento Coaxial',
  battery: 'Bateria & Turbo',
  avionics: 'Aviônica & Pente',
};

export const MAX_UPGRADE_LEVEL = 5;

export interface DroneUpgradeTrackSpec {
  category: UpgradeCategory;
  name: string;
  description: string;
  costs: readonly [number, number, number, number, number];
}

export interface DroneBaseStats {
  speed: number; // 0..100 escala visual/base
  armor: number; // 0..100
  firepower: number; // 0..100
  boost: number; // 0..100
  handling: number; // 0..100
}

export interface DroneDefinition {
  id: DroneId;
  name: string;
  shortName: string;
  manufacturer: string;
  style: VisualStyle;
  tier: 1 | 2 | 3 | 4;
  price: number;
  chassisShape: DroneChassisShape;
  rotorCount: 4 | 6;
  summary: string;
  colors: {
    hull: number;
    armor: number;
    accent: number;
    propTip: number;
  };
  baseStats: DroneBaseStats;
  /** Ganho por nível (5 níveis) em cada atributo visual/efetivo */
  statGainPerLevel: DroneBaseStats;
  upgrades: Readonly<Record<UpgradeCategory, DroneUpgradeTrackSpec>>;
  role?: string;
  subtitle?: string;
  weaponLabel?: string;
  description?: string;
  accentColor?: number;
  hullColor?: number;
  propColor?: number;
  chassisKind?: DroneChassisShape;
}

export type DroneUpgradeLevels = Record<UpgradeCategory, number>;

export interface EffectiveDroneStats {
  droneId: DroneId;
  style: VisualStyle;
  chassisShape: DroneChassisShape;
  rotorCount: 4 | 6;
  totalUpgradeLevels: number;
  totalUpgradeLevel: number;
  maxUpgradeLevels: number;
  /** Rating geral (100 a 355) — garante que Tier N no Nv.5 supera Tier N+1 no Nv.0 */
  overallRating: number;
  stockRating: number;
  maxPotentialRating: number;
  /** Barras 0..150 para UI */
  bars: {
    speed: number;
    armor: number;
    firepower: number;
    boost: number;
    handling: number;
  };
  speed: number;
  armor: number;
  firepower: number;
  boost: number;
  handling: number;
  agility: number;
  shield: number;
  turbo: number;
  /** Multiplicadores aplicados diretamente na física e combate do Game */
  speedMultiplier: number;
  thrustMultiplier: number;
  maxShield: number;
  collisionResistMultiplier: number;
  collisionDamageMultiplier: number;
  weaponDamageMultiplier: number;
  fireRateMultiplier: number;
  fireIntervalMultiplier: number;
  boostDrainMultiplier: number;
  boostRechargeMultiplier: number;
  windResistanceMultiplier: number;
  angularResponseMultiplier: number;
  turnMultiplier: number;
  aimAssistBonus: number;
  aimConeBonus: number;
  magazineSize: number;
  magazineMultiplier: number;
  reloadTimeMultiplier: number;
  reloadMultiplier: number;
}

export const DRONE_CATALOG: readonly DroneDefinition[] = [
  // ==================== 4 DRONES REALISTAS ====================
  {
    id: 'dji-mavic',
    name: 'DJI Mavic Tático Spec',
    shortName: 'Mavic Spec',
    manufacturer: 'SZ DJI TACTICAL',
    style: 'realistic',
    tier: 1,
    price: 0,
    chassisShape: 'quad',
    rotorCount: 4,
    summary:
      'Quadricóptero tático de fibra de carbono fosca com gimbal óptico estabilizado e hélices de baixo ruído com faixa laranja.',
    colors: {
      hull: 0xd8dee6,
      armor: 0x2c333b,
      accent: 0xff6b2b,
      propTip: 0xff7b29,
    },
    // Rating Nv 0 = 100 | Rating Nv 5 = 170 (supera FPV Racer Nv 0 = 132!)
    baseStats: { speed: 40, armor: 40, firepower: 40, boost: 40, handling: 40 },
    statGainPerLevel: { speed: 5.6, armor: 5.6, firepower: 5.6, boost: 5.6, handling: 5.6 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Motores Brushless FOC 2306',
        description: '+7% velocidade máxima e empuxo de subida por nível exclusivo no Mavic Spec.',
        costs: [180, 280, 420, 600, 820],
      },
      chassis: {
        category: 'chassis',
        name: 'Braços de Carbono Trançado 3K',
        description: '+14 pontos de integridade estrutural e -8% dano de impacto por nível.',
        costs: [160, 260, 390, 560, 780],
      },
      weapons: {
        category: 'weapons',
        name: 'Carabina Leve 5.56mm Coaxial',
        description: '+11% dano balístico e +7% cadência de tiro por nível.',
        costs: [200, 320, 460, 650, 880],
      },
      battery: {
        category: 'battery',
        name: 'Célula LiPo 6S High-Discharge',
        description: '-9% consumo de turbo e +11% recarga da bateria por nível.',
        costs: [150, 240, 360, 520, 720],
      },
      avionics: {
        category: 'avionics',
        name: 'Gimbal RTK & Carregador Estendido',
        description: '+12 munições no pente, recarga mais rápida e compensação de vento por nível.',
        costs: [170, 270, 400, 580, 800],
      },
    },
  },
  {
    id: 'fpv-racer',
    name: 'Apex FPV Carbon 7"',
    shortName: 'Apex FPV 7"',
    manufacturer: 'APEX ROTORWORKS',
    style: 'realistic',
    tier: 2,
    price: 1400,
    chassisShape: 'racer',
    rotorCount: 4,
    summary:
      'Quadricóptero interceptador de corrida 7 polegadas com chassi rebaixado em X, câmera inclinada de alta velocidade e resposta acrobática extrema.',
    colors: {
      hull: 0x1f262e,
      armor: 0x3b444f,
      accent: 0xff3b30,
      propTip: 0xff3b30,
    },
    // Rating Nv 0 = 132 | Rating Nv 5 = 218 (supera Goliath Hex Nv 0 = 178!)
    baseStats: { speed: 62, armor: 42, firepower: 50, boost: 56, handling: 54 },
    statGainPerLevel: { speed: 7.2, armor: 6.4, firepower: 7.0, boost: 6.8, handling: 7.0 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Motores Racing 2807 KV1950',
        description: 'Aceleração explosiva e velocidade de mergulho superior exclusiva do chassi Apex FPV.',
        costs: [260, 400, 580, 820, 1100],
      },
      chassis: {
        category: 'chassis',
        name: 'Gaiola de Titânio & Carbono 6mm',
        description: 'Reforça os braços em X para suportar colisões em alta velocidade e aumenta a blindagem.',
        costs: [240, 380, 540, 760, 1040],
      },
      weapons: {
        category: 'weapons',
        name: 'Metralhadora Dupla 7.62mm Compacta',
        description: 'Eleva drasticamente a cadência de tiro e poder de parada em dogfights.',
        costs: [290, 440, 640, 890, 1200],
      },
      battery: {
        category: 'battery',
        name: 'Pack LiHV Grafeno 120C',
        description: 'Sustenta o propulsor turbo por muito mais tempo com recarga ultra-rápida.',
        costs: [230, 360, 520, 740, 980],
      },
      avionics: {
        category: 'avionics',
        name: 'Controladora F7 Dual-Gyro & Tambor',
        description: 'Resposta angular instantânea contra rajadas e +15 projéteis por nível.',
        costs: [250, 390, 560, 790, 1060],
      },
    },
  },
  {
    id: 'heavy-hex',
    name: 'Goliath Hexacóptero Industrial',
    shortName: 'Goliath Hex',
    manufacturer: 'ATLAS AEROSPACE',
    style: 'realistic',
    tier: 3,
    price: 3200,
    chassisShape: 'hex',
    rotorCount: 6,
    summary:
      'Plataforma pesada de 6 rotores com chassi blindado, alta capacidade de carga na tipoia, estabilidade superior no vento e metralhadora pesada.',
    colors: {
      hull: 0x4b5842,
      armor: 0x2c3527,
      accent: 0xf4a261,
      propTip: 0xf4a261,
    },
    // Rating Nv 0 = 178 | Rating Nv 5 = 278 (supera Falcão VANT Nv 0 = 228!)
    baseStats: { speed: 64, armor: 82, firepower: 76, boost: 68, handling: 66 },
    statGainPerLevel: { speed: 7.8, armor: 8.6, firepower: 8.4, boost: 7.6, handling: 7.6 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Seis Rotores Coaxiais de Passo Variável',
        description: 'Aumenta o empuxo dos 6 motores para voar rápido mesmo carregando carga pesada.',
        costs: [380, 560, 800, 1100, 1450],
      },
      chassis: {
        category: 'chassis',
        name: 'Placas Balísticas de Kevlar & Cerâmica',
        description: 'Transforma o Goliath em uma fortaleza voadora com altíssima integridade.',
        costs: [360, 540, 760, 1050, 1380],
      },
      weapons: {
        category: 'weapons',
        name: 'Metralhadora Rotativa .50 BMG',
        description: 'Projéteis pesados de alto impacto contra lanchas, blindados e helicópteros.',
        costs: [420, 620, 880, 1200, 1580],
      },
      battery: {
        category: 'battery',
        name: 'Gerador Híbrido Duplo LiPo-Turbina',
        description: 'Reserva energética massiva para uso contínuo do turbo em subidas íngremes.',
        costs: [340, 510, 730, 1000, 1320],
      },
      avionics: {
        category: 'avionics',
        name: 'Radar Barométrico & Cofre de Munição',
        description: 'Anula quase toda a turbulência de vento e adiciona +18 tiros por nível.',
        costs: [360, 540, 770, 1060, 1400],
      },
    },
  },
  {
    id: 'predator-uav',
    name: 'Falcão VANT Militar Stealth',
    shortName: 'Falcão VANT',
    manufacturer: ' EMBRAER / AERO-DEFENSE',
    style: 'realistic',
    tier: 4,
    price: 5800,
    chassisShape: 'wing',
    rotorCount: 4,
    summary:
      'Aeronave tática VTOL de asa enflechada furtiva com 4 rotores de sustentação + turbina traseira, blindagem composta e canhão automático de 20mm.',
    colors: {
      hull: 0x36414d,
      armor: 0x1e262e,
      accent: 0x38b000,
      propTip: 0xff9f1c,
    },
    // Rating Nv 0 = 228 | Rating Nv 5 = 355 (ápice absoluto do modo Realista)
    baseStats: { speed: 92, armor: 90, firepower: 96, boost: 90, handling: 88 },
    statGainPerLevel: { speed: 10.0, armor: 10.2, firepower: 10.6, boost: 10.0, handling: 10.0 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Turbina Traseira Ducted-Fan Pós-Combustão',
        description: 'Velocidade de cruzeiro e empuxo máximo dignos de caça tático.',
        costs: [520, 760, 1080, 1460, 1920],
      },
      chassis: {
        category: 'chassis',
        name: 'Fuselagem Composta Radar-Absorvente',
        description: 'Integridade estrutural máxima e absorção superior contra fogo antiaéreo.',
        costs: [500, 730, 1040, 1400, 1850],
      },
      weapons: {
        category: 'weapons',
        name: 'Canhão Automático Vulcan 20mm AP',
        description: 'Poder de fogo devastador que destrói blindagens e chefes em segundos.',
        costs: [580, 840, 1180, 1600, 2100],
      },
      battery: {
        category: 'battery',
        name: 'Célula de Combustível de Hidrogênio Líquido',
        description: 'Propulsão turbo quase inesgotável com regeneração acelerada.',
        costs: [480, 700, 990, 1350, 1780],
      },
      avionics: {
        category: 'avionics',
        name: 'Computador de Tiro FLIR & Fita Dupla',
        description: 'Estabilidade cirúrgica sob qualquer tempestade e até 180 projéteis no pente.',
        costs: [510, 740, 1050, 1420, 1880],
      },
    },
  },

  // ==================== 4 DRONES CYBERPUNK / FUTURISTAS ====================
  {
    id: 'aether-x',
    name: 'AETHER-X Mk.I Interceptor',
    shortName: 'AETHER-X Mk.I',
    manufacturer: 'AETHER ORBITAL LABS',
    style: 'futuristic',
    tier: 1,
    price: 0,
    chassisShape: 'quad',
    rotorCount: 4,
    summary:
      'Interceptador orbital padrão com anéis neon reativos, núcleo energético central e canhões gêmeos de pulso de plasma.',
    colors: {
      hull: 0x152638,
      armor: 0x2e4c69,
      accent: 0x39e5ef,
      propTip: 0x39e5ef,
    },
    // Rating Nv 0 = 100 | Rating Nv 5 = 170 (supera Specter Nv 0 = 132!)
    baseStats: { speed: 40, armor: 40, firepower: 40, boost: 40, handling: 40 },
    statGainPerLevel: { speed: 5.6, armor: 5.6, firepower: 5.6, boost: 5.6, handling: 5.6 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Propulsores Iônicos Mk.II',
        description: '+7% velocidade orbital e aceleração imediata exclusiva do AETHER-X Mk.I.',
        costs: [180, 280, 420, 600, 820],
      },
      chassis: {
        category: 'chassis',
        name: 'Malha de Grafeno Magnetizada',
        description: '+14 pontos de escudo defletor e redução de dano por colisão.',
        costs: [160, 260, 390, 560, 780],
      },
      weapons: {
        category: 'weapons',
        name: 'Injetores de Plasma Sobrecarregados',
        description: '+11% dano dos feixes de plasma e +7% cadência de disparo por nível.',
        costs: [200, 320, 460, 650, 880],
      },
      battery: {
        category: 'battery',
        name: 'Capacitor de Dobra Turbo',
        description: '-9% drenagem de energia turbo e +11% taxa de recarga por nível.',
        costs: [150, 240, 360, 520, 720],
      },
      avionics: {
        category: 'avionics',
        name: 'Giroscópio Neural Quântico',
        description: 'Aumenta a precisão de curva em alta velocidade e a assistência de mira.',
        costs: [170, 270, 400, 580, 800],
      },
    },
  },
  {
    id: 'specter-neon',
    name: 'Specter V-Wing Stealth',
    shortName: 'Specter V-Wing',
    manufacturer: 'KUROSAWA CYBERNETICS',
    style: 'futuristic',
    tier: 2,
    price: 1400,
    chassisShape: 'racer',
    rotorCount: 4,
    summary:
      'Caça furtivo synthwave com geometria agressiva em X rebaixado, conduítes carmim de alta frequência e cadência de plasma acelerada.',
    colors: {
      hull: 0x181326,
      armor: 0x31244f,
      accent: 0xff2a85,
      propTip: 0xff2a85,
    },
    // Rating Nv 0 = 132 | Rating Nv 5 = 218 (supera Valkyrie Nv 0 = 178!)
    baseStats: { speed: 64, armor: 42, firepower: 52, boost: 56, handling: 50 },
    statGainPerLevel: { speed: 7.2, armor: 6.4, firepower: 7.0, boost: 6.8, handling: 7.0 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Turbinas Vetoriais Magneto-Hidrodinâmicas',
        description: 'Velocidade de ponta extrema para cortar a megacidade Neo-Aether.',
        costs: [260, 400, 580, 820, 1100],
      },
      chassis: {
        category: 'chassis',
        name: 'Carenagem de Metamaterial Faseado',
        description: 'Amplia o escudo energético mantendo a leveza do chassi furtivo.',
        costs: [240, 380, 540, 760, 1040],
      },
      weapons: {
        category: 'weapons',
        name: 'Disparadores de Pulso Hiper-Rápido',
        description: 'Rajadas de plasma de altíssima frequência que derretem enxames.',
        costs: [290, 440, 640, 890, 1200],
      },
      battery: {
        category: 'battery',
        name: 'Bateria de Fusão Fria Compacta',
        description: 'Permite manobras evasivas constantes com turbo prolongado.',
        costs: [230, 360, 520, 740, 980],
      },
      avionics: {
        category: 'avionics',
        name: 'Co-Processador Sináptico de Reflexo',
        description: 'Curvas fechadas instantâneas entre arranha-céus e pontes.',
        costs: [250, 390, 560, 790, 1060],
      },
    },
  },
  {
    id: 'valkyrie-gunship',
    name: 'Valkyrie Hex-Core Gunship',
    shortName: 'Valkyrie Hex',
    manufacturer: 'VALKYRIE HEAVY INDUSTRIES',
    style: 'futuristic',
    tier: 3,
    price: 3200,
    chassisShape: 'hex',
    rotorCount: 6,
    summary:
      'Gunship pesado de 6 rotores gravitacionais dourados, escudo defletor de múltiplas camadas e canhões de plasma pesado.',
    colors: {
      hull: 0x262015,
      armor: 0x4a3d28,
      accent: 0xffca68,
      propTip: 0xffca68,
    },
    // Rating Nv 0 = 178 | Rating Nv 5 = 278 (supera Omega Core Nv 0 = 228!)
    baseStats: { speed: 64, armor: 84, firepower: 78, boost: 66, handling: 64 },
    statGainPerLevel: { speed: 7.8, armor: 8.6, firepower: 8.4, boost: 7.6, handling: 7.6 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Seis Rotores Gravitacionais Sincronizados',
        description: 'Empuxo massivo de 6 núcleos com aceleração contínua sem perda em subida.',
        costs: [380, 560, 800, 1100, 1450],
      },
      chassis: {
        category: 'chassis',
        name: 'Escudo Defletor de Fase Dupla',
        description: 'Eleva a capacidade de escudo a níveis de cruzador pesado.',
        costs: [360, 540, 760, 1050, 1380],
      },
      weapons: {
        category: 'weapons',
        name: 'Canhões de Plasma Solar Triplo',
        description: 'Disparos de alta densidade que perfuram a blindagem de Bulwarks e Chefes.',
        costs: [420, 620, 880, 1200, 1580],
      },
      battery: {
        category: 'battery',
        name: 'Reator Toroidal de Impulso',
        description: 'Alimenta os 6 rotores no modo turbo com mínima perda de carga.',
        costs: [340, 510, 730, 1000, 1320],
      },
      avionics: {
        category: 'avionics',
        name: 'Matriz de Estabilização Giroscópica',
        description: 'Controle absoluto de voo e travamento de mira expandido.',
        costs: [360, 540, 770, 1060, 1400],
      },
    },
  },
  {
    id: 'omega-core',
    name: 'Omega Singularity Apex',
    shortName: 'Omega Apex',
    manufacturer: 'AETHER SINGULARITY DIVISION',
    style: 'futuristic',
    tier: 4,
    price: 5800,
    chassisShape: 'wing',
    rotorCount: 4,
    summary:
      'Protótipo supremo com asas em flecha dupla, anel de contenção quântica sobre o chassi e lanças fotônicas de hipervelocidade.',
    colors: {
      hull: 0x0d1b2a,
      armor: 0x1b3b5c,
      accent: 0x70f0c2,
      propTip: 0x39e5ef,
    },
    // Rating Nv 0 = 228 | Rating Nv 5 = 355 (ápice absoluto do modo Cyberpunk)
    baseStats: { speed: 92, armor: 90, firepower: 96, boost: 90, handling: 88 },
    statGainPerLevel: { speed: 10.0, armor: 10.2, firepower: 10.6, boost: 10.0, handling: 10.0 },
    upgrades: {
      propulsion: {
        category: 'propulsion',
        name: 'Motor de Dobra Subespacial',
        description: 'Velocidade máxima e resposta de empuxo sem rivais no espaço aéreo.',
        costs: [520, 760, 1080, 1460, 1920],
      },
      chassis: {
        category: 'chassis',
        name: 'Couraça Quântica Auto-Selante',
        description: 'Escudo máximo de 240% equivalentes e altíssima resistência a impacto.',
        costs: [500, 730, 1040, 1400, 1850],
      },
      weapons: {
        category: 'weapons',
        name: 'Lanças Fotônicas de Ponto Zero',
        description: 'Dano máximo e cadência devastadora contra o Núcleo Sentinela e Soberano.',
        costs: [580, 840, 1180, 1600, 2100],
      },
      battery: {
        category: 'battery',
        name: 'Núcleo de Singularidade Contínua',
        description: 'Sustenta o turbo por longos períodos com recarga quase imediata.',
        costs: [480, 700, 990, 1350, 1780],
      },
      avionics: {
        category: 'avionics',
        name: 'Supercomputador Tático Horizonte',
        description: 'Manobrabilidade perfeita e precisão absoluta em qualquer velocidade.',
        costs: [510, 740, 1050, 1420, 1880],
      },
    },
  },
];

DRONE_CATALOG.forEach((def) => {
  def.role = def.tier === 1 ? 'Reconhecimento' : def.tier === 2 ? 'Interceptador' : def.tier === 3 ? 'Ataque Pesado' : 'Apex de Elite';
  def.subtitle = def.manufacturer;
  def.weaponLabel = def.upgrades.weapons.name;
  def.description = def.summary;
  def.accentColor = def.colors.accent;
  def.hullColor = def.colors.hull;
  def.propColor = def.colors.propTip;
  def.chassisKind = def.chassisShape;
});

export const DRONE_IDS: readonly DroneId[] = DRONE_CATALOG.map((item) => item.id);

export function droneById(id: DroneId): DroneDefinition {
  const found = DRONE_CATALOG.find((item) => item.id === id);
  if (!found) throw new Error(`Drone desconhecido: ${id}`);
  return found;
}

export function dronesForStyle(style: VisualStyle): readonly DroneDefinition[] {
  return DRONE_CATALOG.filter((item) => item.style === style);
}

export function defaultDroneForStyle(style: VisualStyle): DroneId {
  return style === 'realistic' ? 'dji-mavic' : 'aether-x';
}

export function createZeroUpgradeLevels(): DroneUpgradeLevels {
  return {
    propulsion: 0,
    chassis: 0,
    weapons: 0,
    battery: 0,
    avionics: 0,
  };
}

export function defaultDroneUpgrades(): DroneUpgradeLevels {
  return createZeroUpgradeLevels();
}

export function clampUpgradeLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.round(value)));
}

export function normalizeDroneUpgrades(raw?: Partial<DroneUpgradeLevels>): DroneUpgradeLevels {
  return {
    propulsion: clampUpgradeLevel(raw?.propulsion),
    chassis: clampUpgradeLevel(raw?.chassis),
    weapons: clampUpgradeLevel(raw?.weapons),
    battery: clampUpgradeLevel(raw?.battery),
    avionics: clampUpgradeLevel(raw?.avionics),
  };
}

export function defaultUpgradesForAllDrones(): Record<DroneId, DroneUpgradeLevels> {
  return {
    'dji-mavic': createZeroUpgradeLevels(),
    'fpv-racer': createZeroUpgradeLevels(),
    'heavy-hex': createZeroUpgradeLevels(),
    'predator-uav': createZeroUpgradeLevels(),
    'aether-x': createZeroUpgradeLevels(),
    'specter-neon': createZeroUpgradeLevels(),
    'valkyrie-gunship': createZeroUpgradeLevels(),
    'omega-core': createZeroUpgradeLevels(),
  };
}

function computeRatingFromBars(bars: DroneBaseStats): number {
  return Math.round((bars.speed + bars.armor + bars.firepower + bars.boost + bars.handling) * 0.5);
}

/**
 * Calcula todos os atributos visuais e multiplicadores reais de física/combate
 * de um drone específico com base nos seus níveis de upgrade individuais.
 */
export function computeDroneEffectiveStats(
  droneId: DroneId,
  rawLevels?: Partial<DroneUpgradeLevels>,
): EffectiveDroneStats {
  const def = droneById(droneId);
  const propLv = clampUpgradeLevel(rawLevels?.propulsion);
  const chasLv = clampUpgradeLevel(rawLevels?.chassis);
  const weapLv = clampUpgradeLevel(rawLevels?.weapons);
  const battLv = clampUpgradeLevel(rawLevels?.battery);
  const avioLv = clampUpgradeLevel(rawLevels?.avionics);

  const bars = {
    speed: Math.round(def.baseStats.speed + propLv * def.statGainPerLevel.speed),
    armor: Math.round(def.baseStats.armor + chasLv * def.statGainPerLevel.armor),
    firepower: Math.round(def.baseStats.firepower + weapLv * def.statGainPerLevel.firepower),
    boost: Math.round(def.baseStats.boost + battLv * def.statGainPerLevel.boost),
    handling: Math.round(def.baseStats.handling + avioLv * def.statGainPerLevel.handling),
  };

  const maxBars = {
    speed: Math.round(def.baseStats.speed + MAX_UPGRADE_LEVEL * def.statGainPerLevel.speed),
    armor: Math.round(def.baseStats.armor + MAX_UPGRADE_LEVEL * def.statGainPerLevel.armor),
    firepower: Math.round(def.baseStats.firepower + MAX_UPGRADE_LEVEL * def.statGainPerLevel.firepower),
    boost: Math.round(def.baseStats.boost + MAX_UPGRADE_LEVEL * def.statGainPerLevel.boost),
    handling: Math.round(def.baseStats.handling + MAX_UPGRADE_LEVEL * def.statGainPerLevel.handling),
  };

  const stockRating = computeRatingFromBars(def.baseStats);
  const overallRating = computeRatingFromBars(bars);
  const maxPotentialRating = computeRatingFromBars(maxBars);
  const totalUpgradeLevels = propLv + chasLv + weapLv + battLv + avioLv;

  // Escalas físicas reais (40 na barra = 1.0x do drone inicial stock)
  const speedMultiplier = 0.82 + (bars.speed / 40) * 0.18;
  const thrustMultiplier = 0.8 + (bars.speed / 40) * 0.2;
  const maxShield = Math.round(60 + bars.armor * 1.0); // 100 no inicial Nv.0, até ~200+ nos tiers finais Nv.5
  const collisionResistMultiplier = Math.max(0.32, 1.15 - (bars.armor / 100) * 0.55);
  const weaponDamageMultiplier = 0.72 + (bars.firepower / 40) * 0.28;
  const fireRateMultiplier = 0.85 + (bars.firepower / 40) * 0.15;
  const boostDrainMultiplier = Math.max(0.42, 1.18 - (bars.boost / 100) * 0.45);
  const boostRechargeMultiplier = 0.82 + (bars.boost / 40) * 0.18;
  const windResistanceMultiplier = Math.max(0.28, 1.18 - (bars.handling / 100) * 0.55);
  const angularResponseMultiplier = 0.85 + (bars.handling / 40) * 0.15;
  const magazineSize = 90 + avioLv * 14 + (def.tier - 1) * 10;
  const reloadTimeMultiplier = Math.max(0.48, 1.0 - avioLv * 0.07 - (def.tier - 1) * 0.04);

  return {
    droneId,
    style: def.style,
    chassisShape: def.chassisShape,
    rotorCount: def.rotorCount,
    totalUpgradeLevels,
    totalUpgradeLevel: totalUpgradeLevels,
    maxUpgradeLevels: MAX_UPGRADE_LEVEL * UPGRADE_CATEGORIES.length,
    overallRating,
    stockRating,
    maxPotentialRating,
    bars,
    speed: bars.speed,
    armor: bars.armor,
    firepower: bars.firepower,
    boost: bars.boost,
    handling: bars.handling,
    agility: bars.handling,
    shield: bars.armor,
    turbo: bars.boost,
    speedMultiplier,
    thrustMultiplier,
    maxShield,
    collisionResistMultiplier,
    collisionDamageMultiplier: collisionResistMultiplier,
    weaponDamageMultiplier,
    fireRateMultiplier,
    fireIntervalMultiplier: 1 / Math.max(0.1, fireRateMultiplier),
    boostDrainMultiplier,
    boostRechargeMultiplier,
    windResistanceMultiplier,
    angularResponseMultiplier,
    turnMultiplier: angularResponseMultiplier,
    aimAssistBonus: (angularResponseMultiplier - 1) * 0.12,
    aimConeBonus: (angularResponseMultiplier - 1) * 0.03,
    magazineSize,
    magazineMultiplier: magazineSize / 90,
    reloadTimeMultiplier,
    reloadMultiplier: reloadTimeMultiplier,
  };
}

export function getNextUpgradeCost(droneId: DroneId, category: UpgradeCategory, currentLevel: number): number | null {
  const lv = clampUpgradeLevel(currentLevel);
  if (lv >= MAX_UPGRADE_LEVEL) return null;
  const def = droneById(droneId);
  return def.upgrades[category].costs[lv] ?? null;
}

export interface MissionPayoutBreakdown {
  baseReward: number;
  baseCredits: number;
  medalBonus: number;
  firstClearBonus: number;
  combatBonus: number;
  scoreBonus: number;
  totalCredits: number;
}

export function calculateMissionPayout(
  victoryOrParams:
    | boolean
    | {
        missionIndex: number;
        victory: boolean;
        medal: 0 | 1 | 2 | 3;
        score: number;
        firstClear?: boolean;
      },
  missionIndex = 1,
  medal: 0 | 1 | 2 | 3 = 0,
  score = 0,
  firstClear = false,
): MissionPayoutBreakdown {
  let v = false;
  let idx = 1;
  let med: 0 | 1 | 2 | 3 = 0;
  let sc = 0;
  let fc = false;

  if (typeof victoryOrParams === 'boolean') {
    v = victoryOrParams;
    idx = missionIndex;
    med = medal;
    sc = score;
    fc = firstClear;
  } else {
    v = victoryOrParams.victory;
    idx = victoryOrParams.missionIndex;
    med = victoryOrParams.medal;
    sc = victoryOrParams.score;
    fc = victoryOrParams.firstClear ?? false;
  }

  const combatBonus = Math.max(25, Math.round(sc * 0.12));
  if (!v) {
    const consolation = Math.max(40, Math.min(220, Math.round(combatBonus * 0.45)));
    return {
      baseReward: 0,
      baseCredits: 0,
      medalBonus: 0,
      firstClearBonus: 0,
      combatBonus: consolation,
      scoreBonus: consolation,
      totalCredits: consolation,
    };
  }
  const baseReward = 220 + Math.max(1, idx) * 65;
  const medalBonus = med === 3 ? 420 : med === 2 ? 220 : med === 1 ? 100 : 0;
  const firstClearBonus = fc ? 300 : 0;
  const totalCredits = baseReward + medalBonus + firstClearBonus + combatBonus;
  return {
    baseReward,
    baseCredits: baseReward,
    medalBonus,
    firstClearBonus,
    combatBonus,
    scoreBonus: combatBonus,
    totalCredits,
  };
}
