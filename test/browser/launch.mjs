// Starts headless Chrome for the browser tests.
// On a laptop: `npm i -D puppeteer` (downloads Chrome). In sandboxes without Chrome downloads,
// `@sparticuz/chromium` + `puppeteer-core` also works (ships Chrome inside the npm package).
export async function launch() {
  try {
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer.launch({ headless: true });
  } catch {
    const { default: chromium } = await import('@sparticuz/chromium');
    const { default: puppeteer } = await import('puppeteer-core');
    return puppeteer.launch({
      executablePath: await chromium.executablePath(), headless: true,
      // separate browser profiles need multi-process mode
      args: chromium.args.filter(a => !a.startsWith('--single-process') && !a.startsWith('--no-zygote')),
    });
  }
}
