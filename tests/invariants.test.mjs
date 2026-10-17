import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule(entry) {
  const result = await build({
    entryPoints: [path.join(projectRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    minify: true,
  });
  const source = result.outputFiles[0]?.text;
  assert.ok(source, `bundle ausente para ${entry}`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

const [missions, physics, states, storage] = await Promise.all([
  loadModule('src/missions.ts'),
  loadModule('src/physics.ts'),
  loadModule('src/state.ts'),
  loadModule('src/storage.ts'),
]);

test('campanha contém três missões sequenciais com objetivos válidos', () => {
  assert.equal(missions.MISSIONS.length, 3);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.index), [1, 2, 3]);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.objectiveKind), ['gates', 'kills', 'boss']);
  assert.deepEqual(missions.MISSIONS.map((mission) => mission.objectiveTarget), [6, 5, 1]);
  assert.equal(missions.missionIdAt(3), null);
  assert.throws(() => missions.missionById('missing'));
  const intercept = missions.missionById('intercept');
  assert.equal(intercept.enemyWave.length, intercept.objectiveTarget);
  assert.deepEqual([...new Set(intercept.enemyWave)], ['scout', 'gunner', 'bulwark']);
  assert.deepEqual([1, 2, 3].map((phase) => missions.bossPatternForPhase(missions.missionById('sentinel').bossPatterns, phase)), ['volley', 'fan', 'charge']);
});

test('amortecimento produz o mesmo fator ao longo de um segundo em 30 e 120 FPS', () => {
  const dampedAt = (steps) => {
    const velocity = { x: 100, multiplyScalar(amount) { this.x *= amount; return this; } };
    for (let i = 0; i < steps; i++) physics.applyFrameIndependentDamping(velocity, 1.35, 1 / steps);
    return velocity.x;
  };
  const expected = 100 * Math.exp(-1.35);
  assert.ok(Math.abs(dampedAt(30) - expected) < 1e-9);
  assert.ok(Math.abs(dampedAt(120) - expected) < 1e-9);
});

test('colisão por segmento detecta projétil rápido e limita a projeção ao segmento', () => {
  const point = { x: 5, y: 0, z: 0 };
  assert.equal(physics.pointToSegmentDistanceSquared(point, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), 0);
  assert.equal(physics.pointToSegmentDistanceSquared({ x: 5, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), 4);
  assert.equal(physics.pointToSegmentDistanceSquared({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), 25);
  assert.equal(physics.pointToSegmentDistanceSquared({ x: -2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), 4);
  const relativeStart = { x: -5, y: 5, z: 0 };
  const relativeEnd = { x: 5, y: -5, z: 0 };
  assert.equal(physics.pointToSegmentDistanceSquared({ x: 0, y: 0, z: 0 }, relativeStart, relativeEnd), 0);
});

test('classificação de projétil distingue impacto, esquiva próxima e passagem segura', () => {
  const { classifyProjectilePass, pointToSegmentDistanceSquared } = physics;
  const start = { x: -80, y: 0, z: 0 };
  const end = { x: 80, y: 0, z: 0 };
  const direct = pointToSegmentDistanceSquared({ x: 0, y: 0, z: 0 }, start, end);
  const close = pointToSegmentDistanceSquared({ x: 0, y: 4, z: 0 }, start, end);
  const safe = pointToSegmentDistanceSquared({ x: 0, y: 8, z: 0 }, start, end);
  assert.equal(classifyProjectilePass(direct, 1.52, 5.4), 'hit');
  assert.equal(classifyProjectilePass(close, 1.52, 5.4), 'near-miss');
  assert.equal(classifyProjectilePass(safe, 1.52, 5.4), 'miss');
});

test('turbo drena e recarrega sem depender da taxa de quadros e exige reserva para reativar', () => {
  const runForSecond = (steps) => {
    let energy = 100;
    let active = false;
    for (let index = 0; index < steps; index++) {
      const next = physics.advanceBoostState(energy, true, active, 1 / steps);
      energy = next.energy;
      active = next.active;
    }
    return { energy, active };
  };
  const at30 = runForSecond(30);
  const at120 = runForSecond(120);
  assert.ok(Math.abs(at30.energy - at120.energy) < 1e-9);
  assert.ok(at30.active && at120.active);
  const recovering = physics.advanceBoostState(10, true, false, 1 / 60);
  assert.equal(recovering.active, false);
  assert.ok(recovering.energy > 10);
});

test('máquina de estados permite pausa e repetição e bloqueia saltos inválidos', () => {
  assert.equal(states.canTransition('menu', 'briefing'), true);
  assert.equal(states.canTransition('playing', 'paused'), true);
  assert.equal(states.canTransition('victory', 'briefing'), true);
  assert.equal(states.canTransition('menu', 'playing'), false);
  assert.equal(states.canTransition('defeat', 'victory'), false);
});

test('salvamento local tolera dados inválidos e limita configurações e recordes', () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
  assert.deepEqual(storage.loadSave(), { version: 1, unlocked: 1, records: {}, volume: 0.7, muted: false, theme: 'cyan' });
  data.set('aether-x-save-v1', JSON.stringify({
    unlocked: 99, volume: 'bad', muted: 'false', theme: 'hacked',
    records: { training: { medal: 99, score: -5, time: -10, shield: 140 }, intercept: { medal: 'x' } },
  }));
  const loaded = storage.loadSave();
  assert.equal(loaded.unlocked, 3);
  assert.equal(loaded.volume, 0.7);
  assert.equal(loaded.muted, false);
  assert.equal(loaded.theme, 'cyan');
  assert.deepEqual(loaded.records.training, { medal: 3, score: 0, time: 0, shield: 100 });
  assert.equal(loaded.records.intercept, undefined);
  storage.saveData(loaded);
  assert.ok(data.get('aether-x-save-v1'));
});
