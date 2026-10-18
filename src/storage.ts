import type {
  CampaignMissionId,
  FuturisticCampaignMissionId,
  OpenWorldTaskId,
  RealisticCampaignMissionId,
  RiverStyle,
} from './missions';
import {
  defaultUpgradesForAllDrones,
  droneById,
  DRONE_IDS,
  getNextUpgradeCost,
  normalizeDroneUpgrades,
  type DroneId,
  type DroneUpgradeLevels,
  type UpgradeCategoryId,
} from './hangar';
import { normalizeQualityLevel, type QualityLevel } from './quality';
import { normalizeFlightModel, normalizeVisualStyle, type FlightModel, type VisualStyle } from './style-profile';

export type ThemeId = 'cyan' | 'crimson' | 'gold';

export interface MissionRecord {
  medal: 0 | 1 | 2 | 3;
  score: number;
  time: number;
  shield: number;
}

export interface SaveData {
  version: 2;
  unlocked: number;
  records: Partial<Record<CampaignMissionId, MissionRecord>>;
  volume: number;
  muted: boolean;
  theme: ThemeId;
  flightModel: FlightModel;
}

export interface RealisticCampaignSave {
  unlocked: number;
  records: Partial<Record<RealisticCampaignMissionId, MissionRecord>>;
}

export interface OpenWorldProgress {
  completedTasks: OpenWorldTaskId[];
  bestScore: number;
  riverStyle: RiverStyle;
  visualStyle?: VisualStyle;
  quality?: QualityLevel;
  flightModel?: FlightModel;
}

export interface HangarSaveData {
  credits: number;
  totalCreditsEarned: number;
  ownedDrones: DroneId[];
  selectedDroneByStyle: {
    realistic: DroneId;
    futuristic: DroneId;
  };
  upgradesByDrone: Record<DroneId, DroneUpgradeLevels>;
}

const SAVE_KEY = 'aether-x-save-v2';
const LEGACY_SAVE_KEY = 'aether-x-save-v1';
const EXTRAS_KEY = 'aether-x-extras-v1';
const REALISTIC_SAVE_KEY = 'aether-x-realistic-v1';
const HANGAR_SAVE_KEY = 'aether-x-hangar-v1';

const CAMPAIGN_IDS: readonly FuturisticCampaignMissionId[] = [
  'training',
  'intercept',
  'sentinel',
  'harbor',
  'skyline',
  'canyon',
  'blackout',
  'dam',
] as const;

const REALISTIC_CAMPAIGN_IDS: readonly RealisticCampaignMissionId[] = [
  'r-highlands',
  'r-coast',
  'r-harbor',
  'r-metro',
  'r-wildfire',
  'r-desert',
  'r-canyon',
  'r-refinery',
  'r-arctic',
  'r-dam',
] as const;

const VALID_TASKS: readonly OpenWorldTaskId[] = [
  'ow-express',
  'ow-patrol',
  'ow-relay',
  'ow-convoy',
  'ow-overlord',
  'row-cargo',
  'row-bridge',
  'row-thief',
  'row-fire',
  'row-ambulance',
  'row-fpv',
  'row-stadium',
  'row-heli',
] as const;

export function defaultSave(): SaveData {
  return { version: 2, unlocked: 1, records: {}, volume: 0.7, muted: false, theme: 'cyan', flightModel: 'arcade' };
}

export function loadSave(): SaveData {
  try {
    const current = localStorage.getItem(SAVE_KEY);
    const raw = current ?? localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return defaultSave();
    const value = JSON.parse(raw) as Partial<SaveData>;
    const safeTheme: ThemeId = value.theme === 'crimson' || value.theme === 'gold' ? value.theme : 'cyan';
    const rawRecords =
      value.records && typeof value.records === 'object' ? (value.records as Record<string, unknown>) : {};
    const records: SaveData['records'] = {};
    for (const id of CAMPAIGN_IDS) {
      const candidate = rawRecords[id];
      if (!candidate || typeof candidate !== 'object') continue;
      const record = candidate as Partial<MissionRecord>;
      const score = Number(record.score);
      const time = Number(record.time);
      const shield = Number(record.shield);
      const medal = Number(record.medal);
      if (![score, time, shield, medal].every(Number.isFinite)) continue;
      records[id] = {
        score: Math.max(0, score),
        time: Math.max(0, time),
        shield: Math.max(0, Math.min(100, shield)),
        medal: Math.max(0, Math.min(3, Math.floor(medal))) as MissionRecord['medal'],
      };
    }
    const volume = Number(value.volume ?? 0.7);
    const flightModel: FlightModel = normalizeFlightModel(value.flightModel, 'arcade');
    const normalized: SaveData = {
      version: 2,
      unlocked: Math.max(
        1,
        Math.min(
          CAMPAIGN_IDS.length,
          Math.max(
            Math.floor(Number(value.unlocked) || 1),
            records.dam ? CAMPAIGN_IDS.length : records.sentinel ? 4 : 1,
          ),
        ),
      ),
      records,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.7,
      muted: value.muted === true,
      theme: safeTheme,
      flightModel,
    };
    if (!current) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(normalized));
      } catch {
        /* A migração pode esperar até o próximo salvamento. */
      }
    }
    return normalized;
  } catch {
    return defaultSave();
  }
}

export function saveData(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // O jogo continua funcionando mesmo se o armazenamento local estiver indisponível.
  }
}

export function loadRealisticCampaign(): RealisticCampaignSave {
  try {
    const raw = localStorage.getItem(REALISTIC_SAVE_KEY);
    if (!raw) return { unlocked: 1, records: {} };
    const parsed = JSON.parse(raw) as Partial<RealisticCampaignSave>;
    const rawRecords =
      parsed.records && typeof parsed.records === 'object' ? (parsed.records as Record<string, unknown>) : {};
    const records: RealisticCampaignSave['records'] = {};
    for (const id of REALISTIC_CAMPAIGN_IDS) {
      const candidate = rawRecords[id];
      if (!candidate || typeof candidate !== 'object') continue;
      const record = candidate as Partial<MissionRecord>;
      const score = Number(record.score);
      const time = Number(record.time);
      const shield = Number(record.shield);
      const medal = Number(record.medal);
      if (![score, time, shield, medal].every(Number.isFinite)) continue;
      records[id] = {
        score: Math.max(0, score),
        time: Math.max(0, time),
        shield: Math.max(0, Math.min(100, shield)),
        medal: Math.max(0, Math.min(3, Math.floor(medal))) as MissionRecord['medal'],
      };
    }
    const unlocked = Math.max(
      1,
      Math.min(REALISTIC_CAMPAIGN_IDS.length, Math.floor(Number(parsed.unlocked) || 1)),
    );
    return { unlocked, records };
  } catch {
    return { unlocked: 1, records: {} };
  }
}

export function saveRealisticCampaign(data: RealisticCampaignSave): void {
  try {
    localStorage.setItem(REALISTIC_SAVE_KEY, JSON.stringify(data));
  } catch {
    // Ignorar falhas de quota.
  }
}

export function loadExtras(): OpenWorldProgress {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY);
    if (!raw) {
      return {
        completedTasks: [],
        bestScore: 0,
        riverStyle: 'realistic',
        visualStyle: 'realistic',
        quality: 'auto',
      };
    }
    const parsed = JSON.parse(raw) as Partial<OpenWorldProgress>;
    const completedTasks = Array.isArray(parsed.completedTasks)
      ? parsed.completedTasks.filter((id): id is OpenWorldTaskId => VALID_TASKS.includes(id as OpenWorldTaskId))
      : [];
    const bestScore = Number.isFinite(Number(parsed.bestScore))
      ? Math.max(0, Math.floor(Number(parsed.bestScore)))
      : 0;
    const riverStyle: RiverStyle = parsed.riverStyle === 'futuristic' ? 'futuristic' : 'realistic';
    const visualStyle: VisualStyle = normalizeVisualStyle(parsed.visualStyle ?? riverStyle, riverStyle);
    const quality: QualityLevel = normalizeQualityLevel(parsed.quality, 'auto');
    const flightModel: FlightModel = normalizeFlightModel(parsed.flightModel, 'arcade');
    return {
      completedTasks: [...new Set(completedTasks)],
      bestScore,
      riverStyle,
      visualStyle,
      quality,
      flightModel,
    };
  } catch {
    return {
      completedTasks: [],
      bestScore: 0,
      riverStyle: 'realistic',
      visualStyle: 'realistic',
      quality: 'auto',
      flightModel: 'arcade',
    };
  }
}

export function saveExtras(progress: OpenWorldProgress): void {
  try {
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(progress));
  } catch {
    // Ignorar falhas de quota.
  }
}

export function defaultHangarSave(): HangarSaveData {
  return {
    credits: 800,
    totalCreditsEarned: 800,
    ownedDrones: ['dji-mavic', 'aether-x'],
    selectedDroneByStyle: {
      realistic: 'dji-mavic',
      futuristic: 'aether-x',
    },
    upgradesByDrone: defaultUpgradesForAllDrones(),
  };
}

export function loadHangarSave(): HangarSaveData {
  try {
    const raw = localStorage.getItem(HANGAR_SAVE_KEY);
    if (!raw) return defaultHangarSave();
    const parsed = JSON.parse(raw) as Partial<HangarSaveData>;
    const credits = Number.isFinite(Number(parsed.credits))
      ? Math.max(0, Math.floor(Number(parsed.credits)))
      : 800;
    const totalCreditsEarned = Number.isFinite(Number(parsed.totalCreditsEarned))
      ? Math.max(0, Math.floor(Number(parsed.totalCreditsEarned)))
      : credits;
    const rawOwned = Array.isArray(parsed.ownedDrones)
      ? parsed.ownedDrones.filter((id): id is DroneId => (DRONE_IDS as readonly string[]).includes(id as string))
      : [];
    const ownedSet = new Set<DroneId>(['dji-mavic', 'aether-x', ...rawOwned]);
    const ownedDrones = Array.from(ownedSet);

    const upgradesByDrone = defaultUpgradesForAllDrones();
    const rawUpgrades = parsed.upgradesByDrone && typeof parsed.upgradesByDrone === 'object'
      ? (parsed.upgradesByDrone as Partial<Record<DroneId, Partial<DroneUpgradeLevels>>>)
      : {};
    for (const id of DRONE_IDS) {
      const dronePart = rawUpgrades[id];
      if (dronePart) {
        upgradesByDrone[id] = normalizeDroneUpgrades(dronePart);
      }
    }

    const reqReal = parsed.selectedDroneByStyle?.realistic;
    const reqFut = parsed.selectedDroneByStyle?.futuristic;
    const realisticSelected: DroneId =
      reqReal && ownedSet.has(reqReal) && droneById(reqReal).style === 'realistic' ? reqReal : 'dji-mavic';
    const futuristicSelected: DroneId =
      reqFut && ownedSet.has(reqFut) && droneById(reqFut).style === 'futuristic' ? reqFut : 'aether-x';

    return {
      credits,
      totalCreditsEarned,
      ownedDrones,
      selectedDroneByStyle: {
        realistic: realisticSelected,
        futuristic: futuristicSelected,
      },
      upgradesByDrone,
    };
  } catch {
    return defaultHangarSave();
  }
}

export function saveHangarSave(data: HangarSaveData): void {
  try {
    localStorage.setItem(HANGAR_SAVE_KEY, JSON.stringify(data));
  } catch {
    // Ignorar falhas de quota.
  }
}

export function purchaseDroneInSave(
  hangar: HangarSaveData,
  droneId: DroneId,
): { ok: boolean; reason?: string } {
  const def = droneById(droneId);
  if (hangar.ownedDrones.includes(droneId)) {
    hangar.selectedDroneByStyle[def.style] = droneId;
    return { ok: true };
  }
  if (hangar.credits < def.price) {
    return { ok: false, reason: 'CRÉDITOS INSUFICIENTES' };
  }
  hangar.credits -= def.price;
  hangar.ownedDrones.push(droneId);
  hangar.selectedDroneByStyle[def.style] = droneId;
  return { ok: true };
}

export function purchaseUpgradeInSave(
  hangar: HangarSaveData,
  droneId: DroneId,
  category: UpgradeCategoryId,
): { ok: boolean; cost: number; newLevel: number; reason?: string } {
  if (!hangar.ownedDrones.includes(droneId)) {
    return { ok: false, cost: 0, newLevel: 0, reason: 'DRONE AINDA NÃO ADQUIRIDO' };
  }
  const levels = hangar.upgradesByDrone[droneId] ?? normalizeDroneUpgrades();
  hangar.upgradesByDrone[droneId] = levels;
  const currentLevel = (levels[category] ?? 0) as number;
  const cost = getNextUpgradeCost(droneId, category, currentLevel);
  if (cost === null || currentLevel >= 5) {
    return { ok: false, cost: 0, newLevel: currentLevel, reason: 'NÍVEL MÁXIMO ATINGIDO' };
  }
  if (hangar.credits < cost) {
    return { ok: false, cost, newLevel: currentLevel, reason: 'CRÉDITOS INSUFICIENTES' };
  }
  hangar.credits -= cost;
  const nextLevel = currentLevel + 1;
  levels[category] = nextLevel;
  return { ok: true, cost, newLevel: nextLevel };
}

