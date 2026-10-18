/**
 * Controlador puro e testável dos 6 novos objetivos táticos realistas:
 * - rescue (Resgate: pairar próximo aos sobreviventes)
 * - escort (Escolta: proteger comboio terrestre/ambulância ao longo de waypoints)
 * - recon (Reconhecimento: fotografar alvos mantendo na mira)
 * - cargo (Entrega de carga: coletar pacote com peso físico e entregar no destino)
 * - firefight (Combate a incêndio: lançar água/retardante sobre focos de calor)
 * - survival (Sobrevivência: resistir por tempo determinado)
 */

export type ExtendedObjectiveKind =
  | 'gates'
  | 'kills'
  | 'boss'
  | 'openworld'
  | 'rescue'
  | 'escort'
  | 'recon'
  | 'cargo'
  | 'firefight'
  | 'survival';

export type Vec3Tuple = readonly [number, number, number];

export interface RescueObjectiveSpec {
  kind: 'rescue';
  points: readonly Vec3Tuple[];
  holdSeconds: number;
  radius: number;
  maxHoverSpeed: number;
}

export interface EscortObjectiveSpec {
  kind: 'escort';
  waypoints: readonly Vec3Tuple[];
  speed: number;
  maxHp: number;
}

export interface ReconObjectiveSpec {
  kind: 'recon';
  targets: readonly Vec3Tuple[];
  scanSeconds: number;
  maxRange: number;
  minAlignmentCos: number;
}

export interface CargoDeliveryPair {
  pickup: Vec3Tuple;
  dropoff: Vec3Tuple;
  mass: number;
}

export interface CargoObjectiveSpec {
  kind: 'cargo';
  deliveries: readonly CargoDeliveryPair[];
  radius: number;
}

export interface FirefightObjectiveSpec {
  kind: 'firefight';
  fires: readonly Vec3Tuple[];
  dropRadius: number;
  extinguishSeconds: number;
}

export interface SurvivalObjectiveSpec {
  kind: 'survival';
  durationSeconds: number;
}

export type ObjectiveSpec =
  | RescueObjectiveSpec
  | EscortObjectiveSpec
  | ReconObjectiveSpec
  | CargoObjectiveSpec
  | FirefightObjectiveSpec
  | SurvivalObjectiveSpec;

export interface ObjectiveStepInput {
  px: number;
  py: number;
  pz: number;
  speed: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  droppingAction: boolean; // Tecla E ou proximidade para soltar água/entregar
  hardImpactSpeed: number; // Se > 13 m/s com carga, derruba a carga
  escortDamageTaken: number; // Dano sofrido pelo veículo escoltado neste frame
}

export interface ObjectiveStepResult {
  completedCount: number;
  targetCount: number;
  fraction: number; // 0..1 progresso geral
  subProgress: number; // 0..1 progresso do item atual (hover, scan, foco de chama, etc.)
  status: 'running' | 'completed' | 'failed';
  hudText: string;
  toastText: string | null;
  activeMarkerIndex: number;
  carryingCargoMass: number;
  escortPosition: [number, number, number] | null;
  escortYaw: number;
  escortHpRatio: number;
}

export class ObjectiveTracker {
  readonly spec: ObjectiveSpec;
  private completedFlags: boolean[] = [];
  private holdTimers: number[] = [];
  private currentDeliveryIdx = 0;
  private carryingCargo = false;
  private escortWaypointIdx = 0;
  private escortPos: [number, number, number] = [0, 0, 0];
  private escortYaw = 0;
  private escortHp = 100;
  private survivalElapsed = 0;
  private statusValue: 'running' | 'completed' | 'failed' = 'running';

  constructor(spec: ObjectiveSpec) {
    this.spec = spec;
    this.reset();
  }

  reset(): void {
    this.statusValue = 'running';
    this.currentDeliveryIdx = 0;
    this.carryingCargo = false;
    this.escortWaypointIdx = 0;
    this.survivalElapsed = 0;
    if (this.spec.kind === 'rescue') {
      this.completedFlags = this.spec.points.map(() => false);
      this.holdTimers = this.spec.points.map(() => 0);
    } else if (this.spec.kind === 'recon') {
      this.completedFlags = this.spec.targets.map(() => false);
      this.holdTimers = this.spec.targets.map(() => 0);
    } else if (this.spec.kind === 'firefight') {
      this.completedFlags = this.spec.fires.map(() => false);
      this.holdTimers = this.spec.fires.map(() => 0);
    } else if (this.spec.kind === 'cargo') {
      this.completedFlags = this.spec.deliveries.map(() => false);
      this.holdTimers = this.spec.deliveries.map(() => 0);
    } else if (this.spec.kind === 'escort') {
      const start = this.spec.waypoints[0] ?? [0, 0, 0];
      this.escortPos = [start[0], start[1], start[2]];
      this.escortHp = this.spec.maxHp;
      this.escortWaypointIdx = 1;
    }
  }

  isMarkerCompleted(index: number): boolean {
    return Boolean(this.completedFlags[index]);
  }

  isCarryingCargo(): boolean {
    return this.carryingCargo;
  }

  getActiveCargoTarget(): Vec3Tuple | null {
    if (this.spec.kind !== 'cargo') return null;
    const item = this.spec.deliveries[this.currentDeliveryIdx];
    if (!item) return null;
    return this.carryingCargo ? item.dropoff : item.pickup;
  }

  getEscortPosition(): [number, number, number] | null {
    return this.spec.kind === 'escort' ? this.escortPos : null;
  }

  step(dtSeconds: number, input: ObjectiveStepInput): ObjectiveStepResult {
    const dt = Math.max(0, dtSeconds);
    let toastText: string | null = null;

    if (this.spec.kind === 'rescue') {
      const total = this.spec.points.length;
      let activeIdx = -1;
      let sub = 0;
      for (let i = 0; i < total; i++) {
        if (this.completedFlags[i]) continue;
        if (activeIdx === -1) activeIdx = i;
        const [tx, ty, tz] = this.spec.points[i];
        const dist = Math.hypot(input.px - tx, input.py - ty, input.pz - tz);
        if (dist <= this.spec.radius && input.speed <= this.spec.maxHoverSpeed) {
          this.holdTimers[i] = Math.min(this.spec.holdSeconds, this.holdTimers[i] + dt);
          activeIdx = i;
          sub = this.holdTimers[i] / Math.max(0.1, this.spec.holdSeconds);
          if (this.holdTimers[i] >= this.spec.holdSeconds) {
            this.completedFlags[i] = true;
            const doneCount = this.completedFlags.filter(Boolean).length;
            toastText = `RESGATE CONCLUÍDO · ${doneCount}/${total}`;
          }
          break;
        } else {
          this.holdTimers[i] = Math.max(0, this.holdTimers[i] - dt * 0.4);
          if (activeIdx === i) sub = this.holdTimers[i] / Math.max(0.1, this.spec.holdSeconds);
        }
      }
      const done = this.completedFlags.filter(Boolean).length;
      if (done >= total) this.statusValue = 'completed';
      return {
        completedCount: done,
        targetCount: total,
        fraction: Math.min(1, (done + sub) / Math.max(1, total)),
        subProgress: sub,
        status: this.statusValue,
        hudText:
          sub > 0.02
            ? `EXTRAINDO SOBREVIVENTE · ${Math.round(sub * 100)}% (${done}/${total})`
            : `LOCALIZAR E PAIRAR SOBRE SINAL DE RESGATE · ${done}/${total}`,
        toastText,
        activeMarkerIndex: activeIdx,
        carryingCargoMass: 0,
        escortPosition: null,
        escortYaw: 0,
        escortHpRatio: 1,
      };
    }

    if (this.spec.kind === 'recon') {
      const total = this.spec.targets.length;
      let activeIdx = -1;
      let sub = 0;
      for (let i = 0; i < total; i++) {
        if (this.completedFlags[i]) continue;
        if (activeIdx === -1) activeIdx = i;
        const [tx, ty, tz] = this.spec.targets[i];
        const dx = tx - input.px;
        const dy = ty - input.py;
        const dz = tz - input.pz;
        const dist = Math.hypot(dx, dy, dz);
        if (dist <= this.spec.maxRange && dist > 1e-3) {
          const cos = (dx * input.fwdX + dy * input.fwdY + dz * input.fwdZ) / dist;
          if (cos >= this.spec.minAlignmentCos) {
            this.holdTimers[i] = Math.min(this.spec.scanSeconds, this.holdTimers[i] + dt);
            activeIdx = i;
            sub = this.holdTimers[i] / Math.max(0.1, this.spec.scanSeconds);
            if (this.holdTimers[i] >= this.spec.scanSeconds) {
              this.completedFlags[i] = true;
              const doneCount = this.completedFlags.filter(Boolean).length;
              toastText = `ALVO FOTOGRAFADO [TELEMETRIA OK] · ${doneCount}/${total}`;
            }
            break;
          }
        }
        this.holdTimers[i] = Math.max(0, this.holdTimers[i] - dt * 0.35);
        if (activeIdx === i) sub = this.holdTimers[i] / Math.max(0.1, this.spec.scanSeconds);
      }
      const done = this.completedFlags.filter(Boolean).length;
      if (done >= total) this.statusValue = 'completed';
      return {
        completedCount: done,
        targetCount: total,
        fraction: Math.min(1, (done + sub) / Math.max(1, total)),
        subProgress: sub,
        status: this.statusValue,
        hudText:
          sub > 0.02
            ? `CAPTURANDO IMAGEM ÓPTICA · ${Math.round(sub * 100)}% (${done}/${total})`
            : `ENQUADRAR ALVOS DE RECONHECIMENTO · ${done}/${total}`,
        toastText,
        activeMarkerIndex: activeIdx,
        carryingCargoMass: 0,
        escortPosition: null,
        escortYaw: 0,
        escortHpRatio: 1,
      };
    }

    if (this.spec.kind === 'firefight') {
      const total = this.spec.fires.length;
      let activeIdx = -1;
      let sub = 0;
      for (let i = 0; i < total; i++) {
        if (this.completedFlags[i]) continue;
        if (activeIdx === -1) activeIdx = i;
        const [fx, fy, fz] = this.spec.fires[i];
        const horizontalDist = Math.hypot(input.px - fx, input.pz - fz);
        const heightDiff = input.py - fy;
        // Drone sobrevoando foco de incêndio (ou apertando E/soltando retardante)
        const inDropZone = horizontalDist <= this.spec.dropRadius && heightDiff >= -2 && heightDiff <= 22;
        if (inDropZone) {
          const rate = input.droppingAction ? 1.55 : 0.95;
          this.holdTimers[i] = Math.min(this.spec.extinguishSeconds, this.holdTimers[i] + dt * rate);
          activeIdx = i;
          sub = this.holdTimers[i] / Math.max(0.1, this.spec.extinguishSeconds);
          if (this.holdTimers[i] >= this.spec.extinguishSeconds) {
            this.completedFlags[i] = true;
            const doneCount = this.completedFlags.filter(Boolean).length;
            toastText = `FOCO DE INCÊNDIO DEBELADO · ${doneCount}/${total}`;
          }
          break;
        } else {
          // O fogo se regenera lentamente se abandonado no meio
          this.holdTimers[i] = Math.max(0, this.holdTimers[i] - dt * 0.12);
          if (activeIdx === i) sub = this.holdTimers[i] / Math.max(0.1, this.spec.extinguishSeconds);
        }
      }
      const done = this.completedFlags.filter(Boolean).length;
      if (done >= total) this.statusValue = 'completed';
      return {
        completedCount: done,
        targetCount: total,
        fraction: Math.min(1, (done + sub) / Math.max(1, total)),
        subProgress: sub,
        status: this.statusValue,
        hudText:
          sub > 0.02
            ? `LANÇANDO RETARDANTE TÉRMICO · ${Math.round(sub * 100)}% (${done}/${total})`
            : `SOBREVOAR FOCOS DE INCÊNDIO [E / DISPERSÃO] · ${done}/${total}`,
        toastText,
        activeMarkerIndex: activeIdx,
        carryingCargoMass: 0,
        escortPosition: null,
        escortYaw: 0,
        escortHpRatio: 1,
      };
    }

    if (this.spec.kind === 'cargo') {
      const total = this.spec.deliveries.length;
      const current = this.spec.deliveries[this.currentDeliveryIdx];
      if (!current) {
        this.statusValue = 'completed';
        return {
          completedCount: total,
          targetCount: total,
          fraction: 1,
          subProgress: 1,
          status: 'completed',
          hudText: `ENTREGAS DE CARGA CONCLUÍDAS · ${total}/${total}`,
          toastText: null,
          activeMarkerIndex: -1,
          carryingCargoMass: 0,
          escortPosition: null,
          escortYaw: 0,
          escortHpRatio: 1,
        };
      }
      if (this.carryingCargo && input.hardImpactSpeed > 13.5) {
        this.carryingCargo = false;
        toastText = 'IMPACTO FORTE! CARGA DESPRENDIDA — RETORNE AO PONTO DE COLETA';
      }
      const targetPos = this.carryingCargo ? current.dropoff : current.pickup;
      const dist = Math.hypot(input.px - targetPos[0], input.py - targetPos[1], input.pz - targetPos[2]);
      if (dist <= this.spec.radius) {
        if (!this.carryingCargo) {
          this.carryingCargo = true;
          toastText = `CARGA ACOPLADA (+${Math.round(current.mass * 100)}% MASSA) · LEVE AO DESTINO`;
        } else {
          this.carryingCargo = false;
          this.completedFlags[this.currentDeliveryIdx] = true;
          this.currentDeliveryIdx++;
          if (this.currentDeliveryIdx >= total) {
            this.statusValue = 'completed';
            toastText = `TODAS AS CARGAS ENTREGUES · ${total}/${total}`;
          } else {
            toastText = `CARGA ENTREGUE · ${this.currentDeliveryIdx}/${total}`;
          }
        }
      }
      const done = this.currentDeliveryIdx;
      const sub = this.carryingCargo ? 0.5 : 0;
      return {
        completedCount: done,
        targetCount: total,
        fraction: Math.min(1, (done + sub) / Math.max(1, total)),
        subProgress: sub,
        status: this.statusValue,
        hudText: this.carryingCargo
          ? `TRANSPORTANDO CARGA PESADA ATÉ A ZONA DE ENTREGA · ${done + 1}/${total}`
          : `COLETAR CARGA NO SINALIZADOR · ${done}/${total}`,
        toastText,
        activeMarkerIndex: this.currentDeliveryIdx,
        carryingCargoMass: this.carryingCargo ? current.mass : 0,
        escortPosition: null,
        escortYaw: 0,
        escortHpRatio: 1,
      };
    }

    if (this.spec.kind === 'escort') {
      const wps = this.spec.waypoints;
      if (input.escortDamageTaken > 0) {
        this.escortHp = Math.max(0, this.escortHp - input.escortDamageTaken);
      }
      if (this.escortHp <= 0) {
        this.statusValue = 'failed';
      }
      const targetWp = wps[this.escortWaypointIdx];
      if (targetWp && this.statusValue === 'running') {
        const dx = targetWp[0] - this.escortPos[0];
        const dy = targetWp[1] - this.escortPos[1];
        const dz = targetWp[2] - this.escortPos[2];
        const dist = Math.hypot(dx, dy, dz);
        const stepDist = this.spec.speed * dt;
        if (dist > 1e-3) {
          this.escortYaw = Math.atan2(-dx, -dz);
        }
        if (dist <= stepDist) {
          this.escortPos = [targetWp[0], targetWp[1], targetWp[2]];
          this.escortWaypointIdx++;
          if (this.escortWaypointIdx >= wps.length) {
            this.statusValue = 'completed';
            toastText = 'COMBOIO ESCOLTADO COM SUCESSO ATÉ O DESTINO';
          } else {
            toastText = `CHECKPOINT DO COMBOIO ${this.escortWaypointIdx}/${wps.length - 1}`;
          }
        } else {
          this.escortPos = [
            this.escortPos[0] + (dx / dist) * stepDist,
            this.escortPos[1] + (dy / dist) * stepDist,
            this.escortPos[2] + (dz / dist) * stepDist,
          ];
        }
      }
      const totalSegments = Math.max(1, wps.length - 1);
      const completedSegs = Math.max(0, this.escortWaypointIdx - 1);
      const hpRatio = Math.max(0, this.escortHp / Math.max(1, this.spec.maxHp));
      return {
        completedCount: completedSegs,
        targetCount: totalSegments,
        fraction: Math.min(1, completedSegs / totalSegments),
        subProgress: hpRatio,
        status: this.statusValue,
        hudText: `PROTEGER COMBOIO (INTEGRIDADE ${Math.round(hpRatio * 100)}%) · ETAPA ${completedSegs}/${totalSegments}`,
        toastText,
        activeMarkerIndex: this.escortWaypointIdx,
        carryingCargoMass: 0,
        escortPosition: [...this.escortPos],
        escortYaw: this.escortYaw,
        escortHpRatio: hpRatio,
      };
    }

    // survival
    this.survivalElapsed = Math.min(this.spec.durationSeconds, this.survivalElapsed + dt);
    if (this.survivalElapsed >= this.spec.durationSeconds) {
      this.statusValue = 'completed';
    }
    const frac = this.survivalElapsed / Math.max(1, this.spec.durationSeconds);
    const remaining = Math.max(0, Math.ceil(this.spec.durationSeconds - this.survivalElapsed));
    return {
      completedCount: Math.floor(this.survivalElapsed),
      targetCount: this.spec.durationSeconds,
      fraction: Math.min(1, frac),
      subProgress: frac,
      status: this.statusValue,
      hudText: `SOBREVIVER AO CERCO HOSTIL · RESTAM ${remaining}S`,
      toastText,
      activeMarkerIndex: 0,
      carryingCargoMass: 0,
      escortPosition: null,
      escortYaw: 0,
      escortHpRatio: 1,
    };
  }
}
