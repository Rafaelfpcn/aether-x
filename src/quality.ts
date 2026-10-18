/**
 * Gerenciador de Qualidade Gráfica e Ajuste Automático de FPS.
 * Módulo puro testável em Node.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'auto';
export type ResolvedQuality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  id: ResolvedQuality;
  label: string;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  vegetationScale: number;
  particleCap: number;
  debrisCap: number;
  bloomEnabled: boolean;
  weatherCount: number;
}

export const QUALITY_PRESETS: Readonly<Record<ResolvedQuality, QualityPreset>> = {
  low: {
    id: 'low',
    label: 'Baixa',
    pixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 512,
    vegetationScale: 0.45,
    particleCap: 90,
    debrisCap: 16,
    bloomEnabled: false,
    weatherCount: 120,
  },
  medium: {
    id: 'medium',
    label: 'Média',
    pixelRatio: 1.15,
    shadows: true,
    shadowMapSize: 1024,
    vegetationScale: 0.75,
    particleCap: 180,
    debrisCap: 32,
    bloomEnabled: true,
    weatherCount: 240,
  },
  high: {
    id: 'high',
    label: 'Alta',
    pixelRatio: 1.35,
    shadows: true,
    shadowMapSize: 1536,
    vegetationScale: 1.0,
    particleCap: 320,
    debrisCap: 56,
    bloomEnabled: true,
    weatherCount: 400,
  },
};

export function normalizeQualityLevel(value: unknown, fallback: QualityLevel = 'auto'): QualityLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'auto' ? value : fallback;
}

/**
 * Controlador com histerese para o modo 'auto'.
 * - Se o frame médio passar de 23 ms (~43 FPS) por 2.5s acumulados, desce um nível.
 * - Se o frame médio ficar abaixo de 13 ms (~77 FPS) por 7.0s acumulados, sobe um nível.
 */
export class AutoQualityController {
  private current: ResolvedQuality;
  private slowAccum = 0;
  private fastAccum = 0;
  private cooldown = 0;

  constructor(initial: ResolvedQuality = 'medium') {
    this.current = initial;
  }

  getResolved(): ResolvedQuality {
    return this.current;
  }

  reset(level: ResolvedQuality = 'medium'): void {
    this.current = level;
    this.slowAccum = 0;
    this.fastAccum = 0;
    this.cooldown = 0;
  }

  sample(dtSeconds: number): ResolvedQuality | null {
    const dt = Math.max(0.001, Math.min(0.25, dtSeconds));
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      return null;
    }
    const frameMs = dt * 1000;
    if (frameMs > 23) {
      this.slowAccum += dt;
      this.fastAccum = Math.max(0, this.fastAccum - dt * 0.5);
      if (this.slowAccum >= 2.5) {
        this.slowAccum = 0;
        if (this.current === 'high') {
          this.current = 'medium';
          this.cooldown = 3.0;
          return this.current;
        }
        if (this.current === 'medium') {
          this.current = 'low';
          this.cooldown = 3.0;
          return this.current;
        }
      }
    } else if (frameMs < 13.5) {
      this.fastAccum += dt;
      this.slowAccum = Math.max(0, this.slowAccum - dt * 0.5);
      if (this.fastAccum >= 7.0) {
        this.fastAccum = 0;
        if (this.current === 'low') {
          this.current = 'medium';
          this.cooldown = 4.0;
          return this.current;
        }
        if (this.current === 'medium') {
          this.current = 'high';
          this.cooldown = 4.0;
          return this.current;
        }
      }
    } else {
      this.slowAccum = Math.max(0, this.slowAccum - dt * 0.25);
      this.fastAccum = Math.max(0, this.fastAccum - dt * 0.25);
    }
    return null;
  }
}
