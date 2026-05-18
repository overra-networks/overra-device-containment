import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/overra-screenshots';
const DEVICE_ID = '4cd5a3ea-7960-455d-8799-2274b1e19604';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function go(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
}

// Login
await go(`${BASE}/login`);
await page.screenshot({ path: `${OUT}/01-login.png` });

await page.fill('input[type="email"]', 'admin@overra.io');
await page.fill('input[type="password"]', 'securepass123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(1800);

// Dashboard
await page.screenshot({ path: `${OUT}/02-dashboard.png` });

// Device Detail - top (status + config)
await go(`${BASE}/devices/${DEVICE_ID}`);
await page.screenshot({ path: `${OUT}/03-device-top.png` });

// Device Detail - scrolled to audit log
await page.evaluate(() => window.scrollTo({ top: 750, behavior: 'instant' }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-device-log.png` });

// Downloads
await go(`${BASE}/downloads`);
await page.screenshot({ path: `${OUT}/05-downloads.png` });

// Settings
await go(`${BASE}/settings`);
await page.screenshot({ path: `${OUT}/06-settings.png` });

await browser.close();
console.log('Done.');
