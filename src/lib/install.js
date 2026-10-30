import { useEffect, useState } from 'react';

// "Install app": Chrome/Edge/Android fire beforeinstallprompt; iOS Safari
// needs Share > Add to Home Screen, so we show instructions there.
let deferred = null;
const subs = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; subs.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach(f => f()); });
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(n => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    installed: standalone,
    canPrompt: !!deferred,
    ios: ios && !standalone,
    async prompt() {
      if (!deferred) return false;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; subs.forEach(f => f());
      return outcome === 'accepted';
    },
  };
}
