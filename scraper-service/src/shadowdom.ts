import { runShadowDomSmokeTest } from './scraper/shadowNav.js';

runShadowDomSmokeTest().then((ok) => {
  if (!ok) process.exit(1);
});
