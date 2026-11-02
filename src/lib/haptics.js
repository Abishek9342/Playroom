// The only game feedback: a strong double vibration when it's your turn (navigator.vibrate, Android;
// iPhones ignore it). No sounds. One switch turns it off, remembered on this device.

const KEY = 'playroom-vibrate';
let enabled = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
const listeners = new Set();

export const vibrateOn = () => enabled;
export function setVibrate(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
  listeners.forEach(fn => fn(on));
  if (on) buzz([220, 90, 220]);
}
export const onVibrate = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function buzz(pattern) {
  if (!enabled) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch {}
}
