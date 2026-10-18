/**
 * Motor leve de colisão 3D com Grade Espacial (Spatial Hash Grid) 2D (XZ).
 * Suporta caixas orientadas (yaw), cilindros verticais, esferas e função de relevo.
 * Módulo 100% puro (sem Three.js/DOM), testável em Node.
 */

export type SurfaceTag = 'concrete' | 'metal' | 'wood' | 'rock' | 'foliage' | 'glass' | 'ice' | 'terrain';

export interface BoxCollider {
  kind: 'box';
  id: number;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  tag: SurfaceTag;
  destructibleId?: number;
}

export interface CylinderCollider {
  kind: 'cylinder';
  id: number;
  cx: number;
  cz: number;
  radius: number;
  y0: number;
  y1: number;
  tag: SurfaceTag;
  destructibleId?: number;
}

export interface SphereCollider {
  kind: 'sphere';
  id: number;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  tag: SurfaceTag;
  destructibleId?: number;
}

export type Collider = BoxCollider | CylinderCollider | SphereCollider;

export interface Contact {
  nx: number;
  ny: number;
  nz: number;
  depth: number;
  tag: SurfaceTag;
  colliderId: number;
  destructibleId?: number;
}

export interface RaycastHit {
  t: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  tag: SurfaceTag;
  colliderId: number;
  destructibleId?: number;
}

export type TerrainHeightFn = (x: number, z: number) => number;

export class CollisionWorld {
  private readonly cellSize: number;
  private readonly cells = new Map<string, Collider[]>();
  private readonly byId = new Map<number, Collider>();
  private readonly candidateSet = new Set<Collider>();
  private nextId = 1;
  private terrainHeight: TerrainHeightFn = () => 0;
  private waterLevel = -1.5;

  constructor(cellSize = 18) {
    this.cellSize = Math.max(4, cellSize);
  }

  clear(): void {
    this.cells.clear();
    this.byId.clear();
    this.nextId = 1;
    this.terrainHeight = () => 0;
    this.waterLevel = -1.5;
  }

  setTerrain(fn: TerrainHeightFn, waterLevel = -1.5): void {
    this.terrainHeight = fn;
    this.waterLevel = waterLevel;
  }

  getTerrainHeight(x: number, z: number): number {
    return this.terrainHeight(x, z);
  }

  getWaterLevel(): number {
    return this.waterLevel;
  }

  addBox(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    yaw = 0,
    tag: SurfaceTag = 'concrete',
    destructibleId?: number,
  ): number {
    const id = this.nextId++;
    const collider: BoxCollider = { kind: 'box', id, cx, cy, cz, hx, hy, hz, yaw, tag, destructibleId };
    this.insertCollider(collider);
    return id;
  }

  addCylinder(
    cx: number,
    cz: number,
    radius: number,
    y0: number,
    y1: number,
    tag: SurfaceTag = 'wood',
    destructibleId?: number,
  ): number {
    const id = this.nextId++;
    const collider: CylinderCollider = { kind: 'cylinder', id, cx, cz, radius, y0, y1, tag, destructibleId };
    this.insertCollider(collider);
    return id;
  }

  addSphere(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    tag: SurfaceTag = 'rock',
    destructibleId?: number,
  ): number {
    const id = this.nextId++;
    const collider: SphereCollider = { kind: 'sphere', id, cx, cy, cz, radius, tag, destructibleId };
    this.insertCollider(collider);
    return id;
  }

  remove(id: number): void {
    const existing = this.byId.get(id);
    if (!existing) return;
    this.byId.delete(id);
    const bounds = this.colliderBoundsXZ(existing);
    const minCx = Math.floor(bounds.minX / this.cellSize);
    const maxCx = Math.floor(bounds.maxX / this.cellSize);
    const minCz = Math.floor(bounds.minZ / this.cellSize);
    const maxCz = Math.floor(bounds.maxZ / this.cellSize);
    for (let ix = minCx; ix <= maxCx; ix++) {
      for (let iz = minCz; iz <= maxCz; iz++) {
        const key = `${ix},${iz}`;
        const list = this.cells.get(key);
        if (!list) continue;
        const idx = list.indexOf(existing);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
  }

  private colliderBoundsXZ(c: Collider): { minX: number; maxX: number; minZ: number; maxZ: number } {
    if (c.kind === 'box') {
      const cos = Math.abs(Math.cos(c.yaw));
      const sin = Math.abs(Math.sin(c.yaw));
      const ex = cos * c.hx + sin * c.hz;
      const ez = sin * c.hx + cos * c.hz;
      return { minX: c.cx - ex, maxX: c.cx + ex, minZ: c.cz - ez, maxZ: c.cz + ez };
    }
    return { minX: c.cx - c.radius, maxX: c.cx + c.radius, minZ: c.cz - c.radius, maxZ: c.cz + c.radius };
  }

  private insertCollider(c: Collider): void {
    this.byId.set(c.id, c);
    const bounds = this.colliderBoundsXZ(c);
    const minCx = Math.floor(bounds.minX / this.cellSize);
    const maxCx = Math.floor(bounds.maxX / this.cellSize);
    const minCz = Math.floor(bounds.minZ / this.cellSize);
    const maxCz = Math.floor(bounds.maxZ / this.cellSize);
    for (let ix = minCx; ix <= maxCx; ix++) {
      for (let iz = minCz; iz <= maxCz; iz++) {
        const key = `${ix},${iz}`;
        let list = this.cells.get(key);
        if (!list) {
          list = [];
          this.cells.set(key, list);
        }
        list.push(c);
      }
    }
  }

  private queryCandidateColliders(minX: number, maxX: number, minZ: number, maxZ: number): Set<Collider> {
    const out = this.candidateSet;
    out.clear();
    const minCx = Math.floor(minX / this.cellSize);
    const maxCx = Math.floor(maxX / this.cellSize);
    const minCz = Math.floor(minZ / this.cellSize);
    const maxCz = Math.floor(maxZ / this.cellSize);
    for (let ix = minCx; ix <= maxCx; ix++) {
      for (let iz = minCz; iz <= maxCz; iz++) {
        const list = this.cells.get(`${ix},${iz}`);
        if (!list) continue;
        for (const c of list) out.add(c);
      }
    }
    return out;
  }

  /**
   * Detecta contatos de uma esfera (x,y,z,r) contra todos os colisores e o terreno.
   */
  sphereContacts(x: number, y: number, z: number, r: number): Contact[] {
    const contacts: Contact[] = [];
    const groundY = this.terrainHeight(x, z);
    if (y - r < groundY) {
      const eps = 0.6;
      const hx = (this.terrainHeight(x + eps, z) - this.terrainHeight(x - eps, z)) / (2 * eps);
      const hz = (this.terrainHeight(x, z + eps) - this.terrainHeight(x, z - eps)) / (2 * eps);
      const len = Math.hypot(-hx, 1, -hz) || 1;
      contacts.push({
        nx: -hx / len,
        ny: 1 / len,
        nz: -hz / len,
        depth: groundY - (y - r),
        tag: 'terrain',
        colliderId: 0,
      });
    }

    const candidates = this.queryCandidateColliders(x - r, x + r, z - r, z + r);
    for (const c of candidates) {
      const contact = this.testSphereCollider(x, y, z, r, c);
      if (contact) contacts.push(contact);
    }
    return contacts;
  }

  private testSphereCollider(x: number, y: number, z: number, r: number, c: Collider): Contact | null {
    if (c.kind === 'sphere') {
      const dx = x - c.cx;
      const dy = y - c.cy;
      const dz = z - c.cz;
      const dist = Math.hypot(dx, dy, dz);
      const minDist = r + c.radius;
      if (dist >= minDist) return null;
      const inv = dist > 1e-6 ? 1 / dist : 0;
      return {
        nx: dist > 1e-6 ? dx * inv : 0,
        ny: dist > 1e-6 ? dy * inv : 1,
        nz: dist > 1e-6 ? dz * inv : 0,
        depth: minDist - dist,
        tag: c.tag,
        colliderId: c.id,
        destructibleId: c.destructibleId,
      };
    }

    if (c.kind === 'cylinder') {
      if (y + r < c.y0 || y - r > c.y1) return null;
      const dx = x - c.cx;
      const dz = z - c.cz;
      const distXZ = Math.hypot(dx, dz);
      const minDist = r + c.radius;
      if (distXZ >= minDist) return null;
      // Verifica se está batendo no topo do cilindro ou na lateral
      const topPen = c.y1 + r - y;
      const sidePen = minDist - distXZ;
      if (y > c.y1 && topPen < sidePen) {
        return {
          nx: 0,
          ny: 1,
          nz: 0,
          depth: topPen,
          tag: c.tag,
          colliderId: c.id,
          destructibleId: c.destructibleId,
        };
      }
      const inv = distXZ > 1e-6 ? 1 / distXZ : 0;
      return {
        nx: distXZ > 1e-6 ? dx * inv : 1,
        ny: 0,
        nz: distXZ > 1e-6 ? dz * inv : 0,
        depth: sidePen,
        tag: c.tag,
        colliderId: c.id,
        destructibleId: c.destructibleId,
      };
    }

    // Box orientada por yaw
    const cos = Math.cos(-c.yaw);
    const sin = Math.sin(-c.yaw);
    const relX = x - c.cx;
    const relY = y - c.cy;
    const relZ = z - c.cz;
    const lx = relX * cos - relZ * sin;
    const lz = relX * sin + relZ * cos;
    const ly = relY;

    const qx = Math.max(-c.hx, Math.min(c.hx, lx));
    const qy = Math.max(-c.hy, Math.min(c.hy, ly));
    const qz = Math.max(-c.hz, Math.min(c.hz, lz));

    const dlx = lx - qx;
    const dly = ly - qy;
    const dlz = lz - qz;
    const distSq = dlx * dlx + dly * dly + dlz * dlz;
    if (distSq >= r * r) return null;

    let nlx = 0;
    let nly = 0;
    let nlz = 0;
    let depth = 0;

    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      nlx = dlx / dist;
      nly = dly / dist;
      nlz = dlz / dist;
      depth = r - dist;
    } else {
      // Centro da esfera está dentro da caixa: empurra pelo eixo mais próximo
      const px = c.hx - Math.abs(lx);
      const py = c.hy - Math.abs(ly);
      const pz = c.hz - Math.abs(lz);
      if (py <= px && py <= pz) {
        nly = ly >= 0 ? 1 : -1;
        depth = py + r;
      } else if (px <= pz) {
        nlx = lx >= 0 ? 1 : -1;
        depth = px + r;
      } else {
        nlz = lz >= 0 ? 1 : -1;
        depth = pz + r;
      }
    }

    const wCos = Math.cos(c.yaw);
    const wSin = Math.sin(c.yaw);
    const nx = nlx * wCos - nlz * wSin;
    const nz = nlx * wSin + nlz * wCos;
    return {
      nx,
      ny: nly,
      nz,
      depth,
      tag: c.tag,
      colliderId: c.id,
      destructibleId: c.destructibleId,
    };
  }

  /**
   * Interseção de segmento (A -> B) contra todos os colisores e terreno.
   * Usado tanto para projéteis quanto para teste de linha de visada (LOS).
   */
  segmentCast(ax: number, ay: number, az: number, bx: number, by: number, bz: number): RaycastHit | null {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz);
    const maxZ = Math.max(az, bz);
    const candidates = this.queryCandidateColliders(minX, maxX, minZ, maxZ);

    let bestHit: RaycastHit | null = null;

    for (const c of candidates) {
      const hit = this.raycastCollider(ax, ay, az, bx, by, bz, c);
      if (hit && (!bestHit || hit.t < bestHit.t)) {
        bestHit = hit;
      }
    }

    // Amostragem rápida de impacto no terreno
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (bestHit && t >= bestHit.t) break;
      const sx = ax + (bx - ax) * t;
      const sy = ay + (by - ay) * t;
      const sz = az + (bz - az) * t;
      const gy = this.terrainHeight(sx, sz);
      if (sy <= gy) {
        bestHit = {
          t,
          x: sx,
          y: gy,
          z: sz,
          nx: 0,
          ny: 1,
          nz: 0,
          tag: 'terrain',
          colliderId: 0,
        };
        break;
      }
    }

    return bestHit;
  }

  hasLineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return this.segmentCast(ax, ay, az, bx, by, bz) === null;
  }

  private raycastCollider(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    c: Collider,
  ): RaycastHit | null {
    if (c.kind === 'sphere') {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const fx = ax - c.cx;
      const fy = ay - c.cy;
      const fz = az - c.cz;
      const a = dx * dx + dy * dy + dz * dz;
      if (a < 1e-8) return null;
      const b = 2 * (fx * dx + fy * dy + fz * dz);
      const cc = fx * fx + fy * fy + fz * fz - c.radius * c.radius;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > 1) return null;
      const hx = ax + dx * t;
      const hy = ay + dy * t;
      const hz = az + dz * t;
      const invR = 1 / Math.max(1e-5, c.radius);
      return {
        t,
        x: hx,
        y: hy,
        z: hz,
        nx: (hx - c.cx) * invR,
        ny: (hy - c.cy) * invR,
        nz: (hz - c.cz) * invR,
        tag: c.tag,
        colliderId: c.id,
        destructibleId: c.destructibleId,
      };
    }

    if (c.kind === 'cylinder') {
      // Interseção aproximada 2D no plano XZ com verificação de faixa Y
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const fx = ax - c.cx;
      const fz = az - c.cz;
      const a = dx * dx + dz * dz;
      if (a < 1e-8) return null;
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - c.radius * c.radius;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > 1) return null;
      const hy = ay + dy * t;
      if (hy < c.y0 || hy > c.y1) return null;
      const hx = ax + dx * t;
      const hz = az + dz * t;
      const invR = 1 / Math.max(1e-5, c.radius);
      return {
        t,
        x: hx,
        y: hy,
        z: hz,
        nx: (hx - c.cx) * invR,
        ny: 0,
        nz: (hz - c.cz) * invR,
        tag: c.tag,
        colliderId: c.id,
        destructibleId: c.destructibleId,
      };
    }

    // Box orientada (slab method no espaço local da caixa)
    const cos = Math.cos(-c.yaw);
    const sin = Math.sin(-c.yaw);
    const rax = ax - c.cx;
    const ray = ay - c.cy;
    const raz = az - c.cz;
    const rbx = bx - c.cx;
    const rby = by - c.cy;
    const rbz = bz - c.cz;

    const lax = rax * cos - raz * sin;
    const laz = rax * sin + raz * cos;
    const lbx = rbx * cos - rbz * sin;
    const lbz = rbx * sin + rbz * cos;

    const d = [lbx - lax, rby - ray, lbz - laz];
    const o = [lax, ray, laz];
    const h = [c.hx, c.hy, c.hz];

    let tMin = 0;
    let tMax = 1;
    let hitAxis = 0;
    let hitSign = 1;

    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(d[axis]) < 1e-8) {
        if (o[axis] < -h[axis] || o[axis] > h[axis]) return null;
      } else {
        const invD = 1 / d[axis];
        let t1 = (-h[axis] - o[axis]) * invD;
        let t2 = (h[axis] - o[axis]) * invD;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sign = 1;
        }
        if (t1 > tMin) {
          tMin = t1;
          hitAxis = axis;
          hitSign = sign;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) return null;
      }
    }

    if (tMin < 0 || tMin > 1) return null;
    const hx = ax + (bx - ax) * tMin;
    const hy = ay + (by - ay) * tMin;
    const hz = az + (bz - az) * tMin;

    let nlx = hitAxis === 0 ? hitSign : 0;
    const nly = hitAxis === 1 ? hitSign : 0;
    let nlz = hitAxis === 2 ? hitSign : 0;
    const wCos = Math.cos(c.yaw);
    const wSin = Math.sin(c.yaw);
    const nx = nlx * wCos - nlz * wSin;
    const nz = nlx * wSin + nlz * wCos;

    return {
      t: tMin,
      x: hx,
      y: hy,
      z: hz,
      nx,
      ny: nly,
      nz,
      tag: c.tag,
      colliderId: c.id,
      destructibleId: c.destructibleId,
    };
  }

  /**
   * Retorna fator [0..1] de proximidade a estruturas para calcular turbulência de esteira.
   */
  proximity(x: number, y: number, z: number, probeRadius = 8): number {
    const contacts = this.sphereContacts(x, y, z, probeRadius);
    let maxFactor = 0;
    for (const c of contacts) {
      if (c.tag === 'terrain') continue;
      maxFactor = Math.max(maxFactor, Math.min(1, c.depth / probeRadius));
    }
    return maxFactor;
  }
}
