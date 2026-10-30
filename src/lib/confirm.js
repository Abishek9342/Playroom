// In-app confirm dialog. Browser confirm()/prompt() are blocked inside sandboxed
// frames (like the claude.ai preview) and look out of place in an installed app.
let listener = null;
export function ask({ title, body = '', confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    if (!listener) return resolve(false);
    listener({ title, body, confirm, cancel, danger, resolve });
  });
}
export const onAsk = fn => { listener = fn; return () => { if (listener === fn) listener = null; }; };
