export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'victory' | 'defeat';

const transitions: Record<GameState, readonly GameState[]> = {
  menu: ['briefing'],
  briefing: ['menu', 'playing'],
  playing: ['paused', 'victory', 'defeat', 'menu'],
  paused: ['playing', 'briefing', 'menu'],
  victory: ['briefing', 'menu'],
  defeat: ['briefing', 'menu'],
};

export function canTransition(from: GameState, to: GameState): boolean {
  return from === to || transitions[from].includes(to);
}
