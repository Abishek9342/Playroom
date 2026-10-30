// The Word Chain dictionary (~275k words), bundled into the Worker
// (~730 KB compressed). The Set is built once per isolate, on first use.
import WORDS from '../public/words.txt?raw';

let dict = null;
export function getDictionary() {
  if (!dict) dict = new Set(WORDS.split('\n'));
  return dict;
}
