// XP, levels and daily streaks. Shared by the server (which awards XP) and the app (which shows it).

export const XP = { play: 20, win: 30, perMinute: 2, maxMinutes: 10, daily: 50 };

// XP for one finished online game: taking part, winning, and a little for time played.
export const xpForGame = ({ won, ms = 0 }) =>
  XP.play + (won ? XP.win : 0) + Math.min(XP.maxMinutes, Math.floor(ms / 60000)) * XP.perMinute;

// Total XP needed to reach a level: L2 = 100, L3 = 300, L4 = 600, L5 = 1000, ...
export const xpToReach = level => 50 * (level - 1) * level;
export function levelInfo(xp = 0) {
  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  const from = xpToReach(level), to = xpToReach(level + 1);
  return { level, xp, from, to, into: xp - from, need: to - from, pct: (xp - from) / (to - from) };
}
const TITLES = [[1, 'Rookie'], [3, 'Regular'], [5, 'Challenger'], [8, 'Pro'], [12, 'Elite'], [16, 'Legend']];
export const levelTitle = level => TITLES.filter(([l]) => level >= l).pop()[1];

// Days are counted in India time, so a streak day runs midnight to midnight IST.
export const dayKey = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
export const prevDay = day => new Date(Date.parse(day + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);

// Streak after playing on `today`, given the stored streak and the last day played.
export function nextStreak({ streak = 0, best = 0, day = null }, today = dayKey()) {
  if (day === today) return { streak, best: Math.max(best, streak), day };
  const s = day === prevDay(today) ? streak + 1 : 1;
  return { streak: s, best: Math.max(best, s), day: today };
}
// The streak as of today: still alive if you played today or yesterday, otherwise 0.
export const liveStreak = ({ streak = 0, day = null }, today = dayKey()) => (day === today || day === prevDay(today) ? streak : 0);

// Small seeded random generator, so everyone gets the same daily puzzle.
export function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
