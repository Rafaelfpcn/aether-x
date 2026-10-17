import type { MissionId } from './missions';

export type ThemeId = 'cyan' | 'crimson' | 'gold';

export interface MissionRecord {
  medal: 0 | 1 | 2 | 3;
  score: number;
  time: number;
  shield: number;
}

export interface SaveData {
  version: 1;
  unlocked: number;
  records: Partial<Record<MissionId, MissionRecord>>;
  volume: number;
  muted: boolean;
  theme: ThemeId;
}

const SAVE_KEY = 'aether-x-save-v1';

export function defaultSave(): SaveData {
  return { version: 1, unlocked: 1, records: {}, volume: 0.7, muted: false, theme: 'cyan' };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const value = JSON.parse(raw) as Partial<SaveData>;
    const safeTheme: ThemeId = value.theme === 'crimson' || value.theme === 'gold' ? value.theme : 'cyan';
    const rawRecords = value.records && typeof value.records === 'object' ? value.records as Record<string, unknown> : {};
    const records: SaveData['records'] = {};
    for (const id of ['training', 'intercept', 'sentinel'] as const) {
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
    return {
      version: 1,
      unlocked: Math.max(1, Math.min(3, Math.floor(Number(value.unlocked) || 1))),
      records,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.7,
      muted: value.muted === true,
      theme: safeTheme,
    };
  } catch {
    return defaultSave();
  }
}

export function saveData(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // The game remains playable if browser storage is disabled or full.
  }
}
