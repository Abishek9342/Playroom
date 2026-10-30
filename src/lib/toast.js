const listeners = new Set();
export const toast = message => listeners.forEach(fn => fn({ message, id: Date.now() + Math.random() }));
export const onToast = fn => { listeners.add(fn); return () => listeners.delete(fn); };
