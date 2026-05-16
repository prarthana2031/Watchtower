import { chromium } from 'playwright';
import { log, logError } from './utils/logger.js';

async function testShadowDOM() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate to a page with a well-known Shadow DOM element
    await page.goto('https://mdn.github.io/web-components-examples/popup-info-box-web-component/');
    
    // Locate an element inside the shadow root by evaluating the element's shadowRoot
    // The <popup-info> component contains a <span> inside its shadow root.
    await page.waitForSelector('popup-info', { timeout: 10000 });
    const text = await page.locator('popup-info').evaluate((element) => {
      const shadowRoot = element.shadowRoot;
      return shadowRoot?.querySelector('span')?.textContent ?? null;
    });
    log(`Text inside shadow DOM: "${text?.trim()}"`);
    
    // Also try clicking a button inside shadow DOM if exists
    // This specific page doesn't have a button, but we can just verify presence.
    
    if (text && text.length > 0) {
      log('Shadow DOM piercing works!');
    } else {
      logError('Shadow DOM test failed. Could not read content inside shadow DOM.');
    }
  } catch (error) {
    logError('Shadow DOM test failed', error);
  } finally {
    await browser.close();
    log('Browser closed.');
  }
}

testShadowDOM();