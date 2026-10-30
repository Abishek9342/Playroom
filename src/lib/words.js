// The dictionary (~275k words). Practice-mode bots use it to answer and to
// check your words; in multiplayer the server checks words itself.
let cache = null;
export async function loadWords() {
  if (cache) return cache;
  let text;
  // the preview build inlines the list; the real app fetches /words.txt (cached for offline)
  if (import.meta.env.VITE_DEMO) text = (await import('../../public/words.txt?raw')).default;
  else text = await (await fetch('/words.txt')).text();
  cache = text.split('\n');
  return cache;
}

// Everyday words for practice bots (~17k, 3–7 letters).
let common = null;
export async function loadCommonWords() {
  if (common) return common;
  let text;
  if (import.meta.env.VITE_DEMO) text = (await import('../../public/common-words.txt?raw')).default;
  else text = await (await fetch('/common-words.txt')).text();
  common = text.split('\n');
  return common;
}
