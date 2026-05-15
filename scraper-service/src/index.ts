import { takeScreenshot } from './scraper/index.js';
import { log, logError } from './utils/logger.js';
import { SiteConfig } from './types/index.js';
import sites from './config/sites.json' with { type: 'json' };

async function main(): Promise<void> {
  log('Watchtower Week 1 – Starting screenshot capture...');

  for (const site of sites as SiteConfig[]) {
    const safeName = site.name.replace(/\s+/g, '_').toLowerCase();
    const screenshotPath = `screenshots/${safeName}_${Date.now()}.png`;
    const success = await takeScreenshot(site.url, site.readySelector, screenshotPath);
    if (success) {
      log(` ${site.name} screenshot saved.`);
    } else {
      logError(`Failed to capture ${site.name}`);
    }
  }

  log('All done.');
}

main().catch((err) => {
  logError('Unhandled error in main', err);
  process.exit(1);
});