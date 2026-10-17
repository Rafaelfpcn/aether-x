import './style.css';
import { AudioEngine } from './audio';
import { Game, type GameEvent } from './game';
import { MISSIONS, missionById, missionIdAt, type MissionDefinition, type MissionId } from './missions';
import { loadSave, saveData, type MissionRecord, type ThemeId } from './storage';
import { canTransition, type GameState } from './state';

const state = {
  game: 'menu' as GameState,
  selectedMission: 'training' as MissionId,
  activeMission: null as MissionDefinition | null,
  save: loadSave(),
  elapsed: 0,
  remaining: 0,
  objectiveProgress: 0,
  score: 0,
  lastFrame: performance.now(),
  toastTimer: 0,
  warningTimer: 0,
  damageTimer: 0,
};

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento de interface não encontrado: ${selector}`);
  return element;
};

const screens = ['menu-screen', 'briefing-screen', 'pause-screen', 'result-screen', 'settings-screen']
  .map((id) => document.getElementById(id) as HTMLElement);
const hud = $('#hud');
const audioHint = $('#audio-hint');
const rootStyle = document.documentElement.style;
const audio = new AudioEngine(() => audioHint.classList.add('is-hidden'));
let game: Game;

function transition(next: GameState): void {
  if (!canTransition(state.game, next)) {
    throw new Error(`Transição de jogo inválida: ${state.game} → ${next}`);
  }
  state.game = next;
}

function showScreen(id: string | null): void {
  for (const screen of screens) screen.classList.toggle('is-hidden', screen.id !== id);
}

function showMenu(): void {
  if (state.game !== 'menu') transition('menu');
  game.setActive(false);
  $('#pause-button').setAttribute('aria-pressed', 'false');
  state.activeMission = null;
  hud.classList.add('is-hidden');
  showScreen('menu-screen');
  audioHint.classList.add('is-hidden');
  renderMenu();
}

function renderMenu(): void {
  const list = $('#mission-list');
  list.replaceChildren();
  for (const mission of MISSIONS) {
    const unlocked = mission.index <= state.save.unlocked;
    const record = state.save.records[mission.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `mission-card${unlocked ? '' : ' locked'}${mission.id === state.selectedMission ? ' selected' : ''}`;
    card.disabled = !unlocked;
    card.dataset.mission = mission.id;
    const number = document.createElement('span');
    number.className = 'mission-number';
    number.textContent = unlocked ? `0${mission.index}` : '⌑';
    const copy = document.createElement('span');
    copy.className = 'mission-card-copy';
    const title = document.createElement('strong');
    title.textContent = mission.name;
    const description = document.createElement('small');
    description.textContent = mission.cardCopy;
    copy.append(title, description);
    const meta = document.createElement('span');
    meta.className = 'mission-card-meta';
    meta.innerHTML = unlocked ? (record ? 'REJOGAR' : 'DISPONÍVEL') : 'BLOQUEADA';
    if (record?.medal) {
      const stars = document.createElement('span');
      stars.className = 'stars';
      stars.textContent = '★'.repeat(record.medal) + '☆'.repeat(3 - record.medal);
      meta.append(stars);
    }
    card.append(number, copy, meta);
    list.append(card);
  }
  $('#campaign-status').textContent = `${String(state.save.unlocked).padStart(2, '0')} / 03 MISSÕES LIBERADAS`;
  $('#campaign-fill').style.width = `${Math.max(12, (state.save.unlocked / MISSIONS.length) * 100)}%`;
  const records = Object.values(state.save.records);
  const best = records.reduce((highest, record) => Math.max(highest, record?.score ?? 0), 0);
  $('#best-result').textContent = best ? best.toLocaleString('pt-BR') : '—';
  const medals = records.reduce((total, record) => total + (record?.medal ?? 0), 0);
  $('#campaign-medal').textContent = medals ? `${medals}/09` : '✦';
  $('#campaign-medal').classList.toggle('med-none', !medals);
  $('#continue-button').querySelector('span')!.textContent = state.save.unlocked > 1 ? 'CONTINUAR CAMPANHA' : 'INICIAR CAMPANHA';
  const next = findNextMission();
  $('#continue-button').setAttribute('aria-label', `Abrir missão ${missionById(next).name}`);
}

function findNextMission(): MissionId {
  const unlocked = MISSIONS.filter((mission) => mission.index <= state.save.unlocked);
  const unplayed = unlocked.find((mission) => !state.save.records[mission.id]);
  return unplayed?.id ?? unlocked[unlocked.length - 1]?.id ?? 'training';
}

function openBriefing(id: MissionId): void {
  if (missionById(id).index > state.save.unlocked) return;
  if (state.game === 'menu' || state.game === 'victory' || state.game === 'defeat' || state.game === 'paused') transition('briefing');
  state.selectedMission = id;
  const mission = missionById(id);
  $('#briefing-kicker').textContent = `MISSÃO 0${mission.index} // ${mission.codename}`;
  $('#briefing-title').textContent = mission.name;
  $('#briefing-copy').textContent = mission.briefing;
  $('#briefing-objective').textContent = mission.objective;
  $('#briefing-controls').innerHTML = '<span>CONTROLES</span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>ESPAÇO</kbd><kbd>C</kbd><kbd>SHIFT</kbd><kbd>CLIQUE / F</kbd>';
  $('#launch-button').querySelector('span')!.textContent = id === 'training' && !state.save.records.training ? 'INICIAR TREINAMENTO' : 'INICIAR MISSÃO';
  hud.classList.add('is-hidden');
  showScreen('briefing-screen');
}

function launchMission(id: MissionId): void {
  if (state.game === 'victory' || state.game === 'defeat') transition('briefing');
  state.selectedMission = id;
  state.activeMission = missionById(id);
  state.elapsed = 0;
  state.remaining = state.activeMission.durationSeconds;
  state.objectiveProgress = 0;
  state.score = 0;
  transition('playing');
  showScreen(null);
  hud.classList.remove('is-hidden');
  updateMissionHud(state.activeMission);
  updateTimer();
  updateObjective(0);
  $('#boss-panel').classList.toggle('is-hidden', id !== 'sentinel');
  $('#boss-panel').classList.remove('exposed');
  game.startMission(state.activeMission);
  game.setActive(true);
  $('#shield-fill').style.width = '100%';
  $('#shield-value').textContent = '100%';
  $('#damage-flash').classList.remove('active');
  $('#reticle').classList.remove('locked');
  $('#lock-label').classList.remove('active');
  $('#pause-button').setAttribute('aria-pressed', 'false');
  audio.unlock();
}

function updateMissionHud(mission: MissionDefinition): void {
  $('#mission-index').textContent = `${String(mission.index).padStart(2, '0')} / 03`;
  $('#mission-name').textContent = mission.name;
  $('#objective-text').textContent = mission.objective;
}

function updateObjective(progress: number): void {
  if (!state.activeMission) return;
  state.objectiveProgress = Math.min(state.activeMission.objectiveTarget, progress);
  $('#objective-fill').style.width = `${(state.objectiveProgress / state.activeMission.objectiveTarget) * 100}%`;
  if (state.activeMission.objectiveKind === 'gates') {
    $('#objective-text').textContent = `Atravesse os portais · ${state.objectiveProgress} / ${state.activeMission.objectiveTarget}`;
  } else if (state.activeMission.objectiveKind === 'kills') {
    $('#objective-text').textContent = `Drones abatidos · ${state.objectiveProgress} / ${state.activeMission.objectiveTarget}`;
  } else {
    $('#objective-text').textContent = 'Derrube o Sentinela Alfa · 3 fases';
  }
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function updateTimer(): void {
  $('#timer').textContent = formatTime(state.remaining);
  $('#timer').classList.toggle('critical', state.remaining <= 20);
}

function handleGameEvent(event: GameEvent): void {
  if (event.type === 'telemetry') {
    $('#speed').textContent = String(event.speed).padStart(3, '0');
    $('#altitude').textContent = String(event.altitude).padStart(3, '0');
  } else if (event.type === 'gate') {
    if (state.activeMission?.objectiveKind === 'gates') {
      updateObjective(event.count);
      if (event.count >= state.activeMission.objectiveTarget) finishMission(true);
    }
  } else if (event.type === 'enemyDestroyed') {
    if (state.activeMission?.objectiveKind === 'kills') {
      updateObjective(event.count);
      if (event.count >= state.activeMission.objectiveTarget) finishMission(true);
    }
  } else if (event.type === 'boss') {
    $('#boss-fill').style.width = `${Math.max(0, event.hp) * 100}%`;
    $('#boss-phase').textContent = `FASE 0${event.phase}`;
    $('#boss-state').textContent = event.exposed ? 'NÚCLEO EXPOSTO · DISPARAR AGORA' : 'ESCUDO ATIVO · AGUARDE A ABERTURA';
    $('#boss-panel').classList.toggle('exposed', event.exposed);
  } else if (event.type === 'bossDestroyed') {
    if (state.activeMission?.id === 'sentinel') finishMission(true);
  } else if (event.type === 'damage') {
    $('#shield-fill').style.width = `${event.shield}%`;
    $('#shield-value').textContent = `${Math.round(event.shield)}%`;
    $('#shield-fill').style.background = event.shield < 35 ? 'linear-gradient(90deg, #b9224a, #ff7990)' : '';
    $('#damage-flash').classList.add('active');
    window.clearTimeout(state.damageTimer);
    state.damageTimer = window.setTimeout(() => $('#damage-flash').classList.remove('active'), 190);
    if (event.shield <= 0) finishMission(false, 'O escudo do AETHER-X foi esgotado.');
  } else if (event.type === 'warning') {
    $('#warning').textContent = state.activeMission?.id === 'sentinel' ? 'ATAQUE DO ALFA · DESVIE' : 'AMEAÇA DETECTADA · MANOBRE';
    $('#warning').classList.add('active');
    window.clearTimeout(state.warningTimer);
    state.warningTimer = window.setTimeout(() => $('#warning').classList.remove('active'), 950);
  } else if (event.type === 'lock') {
    $('#reticle').classList.toggle('locked', event.locked);
    $('#lock-label').classList.toggle('active', event.locked);
  } else if (event.type === 'toast') {
    showToast(event.text);
  }
}

function showToast(text: string): void {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('active');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('active'), 1200);
}

function pauseMission(): void {
  if (state.game !== 'playing') return;
  transition('paused');
  game.setActive(false);
  $('#pause-button').setAttribute('aria-pressed', 'true');
  showScreen('pause-screen');
}

function resumeMission(): void {
  if (state.game !== 'paused') return;
  transition('playing');
  showScreen(null);
  game.setActive(true);
  $('#pause-button').setAttribute('aria-pressed', 'false');
}

function finishMission(success: boolean, reason?: string): void {
  if (state.game !== 'playing' || !state.activeMission) return;
  const mission = state.activeMission;
  game.setActive(false);
  const remaining = Math.max(0, state.remaining);
  const shield = game.getPlayerShield();
  const medal = success ? awardMedal(mission, state.elapsed, shield) : 0;
  const score = success ? Math.round(game.getScore() + remaining * 12 + shield * 30 + medal * 600) : Math.round(game.getScore() + shield * 10);
  state.score = score;
  if (success) {
    transition('victory');
    audio.play('win');
    state.save.unlocked = Math.max(state.save.unlocked, Math.min(3, mission.index + 1));
    const old = state.save.records[mission.id];
    const record: MissionRecord = { medal, score, time: state.elapsed, shield };
    if (!old || score >= old.score) state.save.records[mission.id] = record;
  } else {
    transition('defeat');
    audio.play('fail');
  }
  saveData(state.save);
  showResult(success, mission, medal, score, reason);
}

function awardMedal(mission: MissionDefinition, elapsed: number, shield: number): 1 | 2 | 3 {
  if (elapsed <= mission.goldSeconds && shield >= 65) return 3;
  if (elapsed <= mission.silverSeconds && shield >= 35) return 2;
  return 1;
}

function showResult(success: boolean, mission: MissionDefinition, medal: number, score: number, reason?: string): void {
  showScreen('result-screen');
  $('#result-kicker').textContent = success ? 'MISSÃO CONCLUÍDA' : 'MISSÃO INTERROMPIDA';
  $('#result-title').textContent = success ? (mission.id === 'sentinel' ? 'A cidade voltou a respirar.' : 'Espaço aéreo recuperado.') : 'A missão ainda não terminou.';
  $('#result-copy').textContent = success ? (mission.id === 'sentinel' ? 'O núcleo caiu. A rede de defesa da cidade está novamente sob controle.' : 'Bom trabalho, piloto. Os sistemas da cidade voltaram a ficar online.') : reason ?? (state.remaining <= 0 ? 'O tempo acabou antes de concluir o objetivo.' : 'Recalibre sua rota e tente novamente.');
  $('#result-medal').textContent = '★'.repeat(medal) + '☆'.repeat(3 - medal);
  $('#result-medal').classList.toggle('med-none', !medal);
  $('#result-time').textContent = formatTime(state.elapsed);
  $('#result-shield').textContent = `${Math.round(game.getPlayerShield())}%`;
  $('#result-score').textContent = score.toLocaleString('pt-BR').padStart(4, '0');
  const next = missionIdAt(mission.index);
  const primary = $('#result-primary') as HTMLButtonElement;
  primary.disabled = success && !next;
  primary.classList.toggle('is-hidden', success && !next);
  $('#result-retry').querySelector('span')?.remove();
  $('#result-retry').textContent = success ? 'REJOGAR MISSÃO' : 'TENTAR NOVAMENTE';
  primary.querySelector('span')!.textContent = success ? 'PRÓXIMA MISSÃO' : 'TENTAR NOVAMENTE';
  if (!success) primary.classList.add('is-hidden');
  renderMenu();
}

function gameLoop(now: number): void {
  const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
  state.lastFrame = now;
  if (state.game === 'playing' && state.activeMission) {
    state.elapsed += dt;
    state.remaining = Math.max(0, state.activeMission.durationSeconds - state.elapsed);
    updateTimer();
    if (state.remaining <= 0) finishMission(false, 'O cronômetro chegou a zero. Reorganize a rota e tente novamente.');
  }
  requestAnimationFrame(gameLoop);
}

function applyTheme(theme: ThemeId): void {
  state.save.theme = theme;
  const color: Record<ThemeId, string> = { cyan: '#39e5ef', crimson: '#ff476b', gold: '#ffca68' };
  const soft: Record<ThemeId, string> = { cyan: '#9bf8fb', crimson: '#ffb1c0', gold: '#ffe4a8' };
  rootStyle.setProperty('--cyan', color[theme]);
  rootStyle.setProperty('--cyan-soft', soft[theme]);
  game.setTheme(theme);
  document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach((button) => button.classList.toggle('active', button.dataset.theme === theme));
  saveData(state.save);
}

function openSettings(): void {
  showScreen('settings-screen');
  ($('#volume-slider') as HTMLInputElement).value = String(Math.round(state.save.volume * 100));
  $('#volume-output').textContent = `${Math.round(state.save.volume * 100)}%`;
}

function bindUi(): void {
  $('#mission-list').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mission]');
    if (!button || button.disabled) return;
    audio.unlock();
    openBriefing(button.dataset.mission as MissionId);
  });
  $('#continue-button').addEventListener('click', () => { audio.unlock(); openBriefing(findNextMission()); });
  $('#settings-button').addEventListener('click', openSettings);
  $('#launch-button').addEventListener('click', () => launchMission(state.selectedMission));
  $('#pause-button').addEventListener('click', pauseMission);
  $('#resume-button').addEventListener('click', resumeMission);
  $('#restart-button').addEventListener('click', () => launchMission(state.selectedMission));
  $('#result-retry').addEventListener('click', () => launchMission(state.selectedMission));
  $('#result-primary').addEventListener('click', () => {
    if (state.game === 'defeat') { launchMission(state.selectedMission); return; }
    const next = missionIdAt(missionById(state.selectedMission).index);
    if (next) openBriefing(next);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="menu"]').forEach((button) => button.addEventListener('click', showMenu));
  document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach((button) => button.addEventListener('click', () => {
    const theme = button.dataset.theme as ThemeId;
    applyTheme(theme);
  }));
  $('#volume-slider').addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    state.save.volume = value;
    $('#volume-output').textContent = `${Math.round(value * 100)}%`;
    audio.setVolume(value);
    saveData(state.save);
  });
  $('#mute-button').addEventListener('click', () => {
    state.save.muted = !state.save.muted;
    audio.setMuted(state.save.muted);
    $('#mute-button').textContent = state.save.muted ? 'ATIVAR ÁUDIO' : 'SILENCIAR ÁUDIO';
    saveData(state.save);
  });
}

function boot(): void {
  try {
    game = new Game($('#world'), $('#radar'), audio, { onEvent: handleGameEvent, onPause: pauseMission });
  } catch (error) {
    const fallback = document.createElement('main');
    fallback.style.cssText = 'display:grid;place-items:center;height:100vh;padding:24px;background:#070b12;color:#e8f5f8;font:16px system-ui;text-align:center';
    const panel = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = 'AETHER-X não pôde iniciar';
    const description = document.createElement('p');
    description.textContent = error instanceof Error ? error.message : 'WebGL não está disponível neste navegador.';
    const hint = document.createElement('p');
    hint.textContent = 'Abra o arquivo em um navegador desktop atualizado com aceleração gráfica ativada.';
    panel.append(title, description, hint);
    fallback.append(panel);
    document.body.replaceChildren(fallback);
    return;
  }
  audio.setVolume(state.save.volume);
  audio.setMuted(state.save.muted);
  $('#mute-button').textContent = state.save.muted ? 'ATIVAR ÁUDIO' : 'SILENCIAR ÁUDIO';
  bindUi();
  applyTheme(state.save.theme);
  showMenu();
  requestAnimationFrame(gameLoop);
}

boot();

