import { GAMES as RULES, OPTIONS, defaultOptions } from '../../shared/games.js';

export const GAMES = {
  wordchain: { ...RULES.wordchain, kind: 'Word', time: '5–10 min', tagline: 'Each word starts with the last letter of the one before. Real words only, no repeats.' },
  xo: { ...RULES.xo, kind: 'Classic', time: '2 min', tagline: 'Noughts and crosses on a 3×3 or 5×5 board. Play a single game or a best of 3 or 5.' },
  patches: { ...RULES.patches, kind: 'Puzzle race', time: '2–5 min', tagline: 'Cover the grid with patches. Each holds one clue: its size and its shape. First to solve wins.' },
  cards: { ...RULES.cards, kind: 'Cards', time: '15–30 min', tagline: 'Least Count. Drop pairs and runs, keep your points low, and Show when you’re sure you’re lowest.' },
};
export { OPTIONS, defaultOptions };

// Muted, readable avatar tones (dark text sits on all of them).
const TONES = ['#A7D3C0', '#F0CF8E', '#B7C8F0', '#F2B8B0', '#CDBDEB', '#F5C29B', '#A9DCE8', '#D6DE9C', '#E9B6D2', '#BFD8A6'];
export function colorFor(id = '') {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
export const PATCH_COLORS = ['#9CC9B4', '#E9C77B', '#A9BDE8', '#E8A6A1', '#C7B3E6', '#F1B98E', '#9FD3DF', '#CFD58F', '#E3AECB', '#B5D49C'];

export function describeOptions(game, size, options = {}) {
  const bits = [`${size} players`];
  if (game === 'cards') bits.push(`${options.decks || 1} ${options.decks > 1 ? 'decks' : 'deck'}`, `Exit at ${options.exitAt || 200}`);
  if (game === 'xo') bits.push(`${options.board || 3}×${options.board || 3}`, (options.bestOf || 1) > 1 ? `Best of ${options.bestOf}` : 'Single game');
  return bits;
}
