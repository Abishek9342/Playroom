// Starts headless Chrome for the browser tests.
// On a laptop: `npm i -D puppeteer` (downloads Chrome). In sandboxes without Chrome downloads,
// `@sparticuz/chromium` + `puppeteer-core` also works (ships Chrome inside the npm package).
export async function launch() {
  try {
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer.launch({ headless: true });
  } catch {}
  // Windows laptop: puppeteer-core (`npm i --no-save puppeteer-core`) + the installed Edge.
  const edge = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  try {
    const { existsSync } = await import('node:fs');
    if (existsSync(edge)) {
      const { default: puppeteer } = await import('puppeteer-core');
      return puppeteer.launch({ executablePath: edge, headless: true });
    }
  } catch {}
  {
    const { default: chromium } = await import('@sparticuz/chromium');
    const { default: puppeteer } = await import('puppeteer-core');
    return puppeteer.launch({
      executablePath: await chromium.executablePath(), headless: true,
      // separate browser profiles need multi-process mode
      args: chromium.args.filter(a => !a.startsWith('--single-process') && !a.startsWith('--no-zygote')),
    });
  }
}
