export type MissionId = 'training' | 'intercept' | 'sentinel';
export type ObjectiveKind = 'gates' | 'kills' | 'boss';

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
