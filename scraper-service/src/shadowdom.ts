import { chromium } from 'playwright';
import { log, logError } from './utils/logger.js';

async function testShadowDOM() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate to a page with a well-known Shadow DOM element
    await page.goto('https://mdn.github.io/web-components-examples/popup-info-box-web-component/');
    
    // Try to locate an element inside the shadow root using Playwright's pierce selector
    // The <popup-info> contains a <span> inside its shadow root.
    const spanInsideShadow = page.locator('pierce=span');
    const text = await spanInsideShadow.textContent();
    log(`Text inside shadow DOM: "${text?.trim()}"`);
    
    // Also try clicking a button inside shadow DOM if exists
    // This specific page doesn't have a button, but we can just verify presence.
    
    if (text && text.length > 0) {
      log('✅ Shadow DOM piercing works!');
    } else {
      logError('❌ Could not read content inside shadow DOM.');
    }
  } catch (error) {
    logError('Shadow DOM test failed', error);
  } finally {
    await browser.close();
    log('Browser closed.');
  }
}

testShadowDOM();