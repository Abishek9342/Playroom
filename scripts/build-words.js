// Builds the word lists in public/:
//  words.txt         ~275k English words (an-array-of-english-words, MIT): validates every move.
//  common-words.txt  ~17k everyday words, 3–7 letters (SCOWL sizes 10–35 via wordlist-english,
//                    MIT/SCOWL licence): what practice bots play, so they sound natural.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const all = JSON.parse(readFileSync(new URL('../node_modules/an-array-of-english-words/index.json', import.meta.url)));
const words = [...new Set(all.map(w => w.toLowerCase()).filter(w => /^[a-z]{2,30}$/.test(w)))].sort();
writeFileSync(new URL('../public/words.txt', import.meta.url), words.join('\n'));
console.log(`public/words.txt: ${words.length} words`);

const tiers = require('wordlist-english');
const dict = new Set(words);
const common = [...new Set([...tiers['english/10'], ...tiers['english/20'], ...tiers['english/35']]
  .filter(w => /^[a-z]{3,7}$/.test(w) && dict.has(w)))].sort();
writeFileSync(new URL('../public/common-words.txt', import.meta.url), common.join('\n'));
console.log(`public/common-words.txt: ${common.length} words`);
