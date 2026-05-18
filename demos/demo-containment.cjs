'use strict';
/*
 * Overra — Containment Lockdown demo.
 *
 *   node demos/demo-containment.cjs --rehearse   # validate selectors only
 *   node demos/demo-containment.cjs              # record video
 *
 * Requires the Next.js dev server to be running on http://localhost:3000
 * and the demo account test@overra.dev to own at least one device with
 * status='normal' and no walletAuthority set.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.DEMO_EMAIL || 'test@overra.dev';
const PASSWORD = process.env.DEMO_PASSWORD || 'Test1234!';
// SAFETY: target only the synthetic demo device. Real agent-paired devices
// would actually execute containment locally on the operator's machine.
const DEMO_DEVICE_ID = process.env.DEMO_DEVICE_ID || 'demo-device-0000-0000-0000-000000000001';
const VIDEO_DIR = path.join(__dirname, 'screenshots');
const OUTPUT_NAME = 'demo-containment.webm';
const REHEARSAL = process.argv.includes('--rehearse');

// --------------- Cursor + subtitle overlay --------------- //

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    cursor.style.cssText = `
      position: fixed; z-index: 999999; pointer-events: none;
      width: 24px; height: 24px;
      transition: left 0.1s, top 0.1s;
      filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.3));
    `;
    cursor.style.left = '0px';
    cursor.style.top = '0px';
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });
  });
}

async function injectSubtitleBar(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-subtitle')) return;
    const bar = document.createElement('div');
    bar.id = 'demo-subtitle';
    bar.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 999998;
      text-align: center; padding: 12px 24px;
      background: rgba(0, 0, 0, 0.75);
      color: white; font-family: -apple-system, "Segoe UI", sans-serif;
      font-size: 16px; font-weight: 500; letter-spacing: 0.3px;
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    bar.textContent = '';
    bar.style.opacity = '0';
    document.body.appendChild(bar);
  });
}

async function showSubtitle(page, text) {
  await page.evaluate((t) => {
    const bar = document.getElementById('demo-subtitle');
    if (!bar) return;
    if (t) {
      bar.textContent = t;
      bar.style.opacity = '1';
    } else {
      bar.style.opacity = '0';
    }
  }, text);
  if (text) await page.waitForTimeout(800);
}

async function reInjectOverlays(page) {
  await injectCursor(page);
  await injectSubtitleBar(page);
}

// --------------- Helpers --------------- //

async function ensureVisible(page, locator, label) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`REHEARSAL FAIL: "${label}" not found - selector: ${typeof locator === 'string' ? locator : '(locator object)'}`);
    const dump = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input, select, textarea, a'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => `${el.tagName}[${el.type || ''}] "${(el.textContent || '').trim().substring(0, 40)}"`)
        .slice(0, 40)
        .join('\n  ');
    });
    console.error('  Visible elements:\n  ' + dump);
    return false;
  }
  console.log(`REHEARSAL OK: "${label}"`);
  return true;
}

async function moveAndClick(page, locator, label, opts = {}) {
  const { postClickDelay = 800, ...clickOpts } = opts;
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: moveAndClick skipped - "${label}" not visible`);
    return false;
  }
  try {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
      await page.waitForTimeout(400);
    }
    await el.click(clickOpts);
  } catch (e) {
    console.error(`WARNING: moveAndClick failed on "${label}": ${e.message}`);
    return false;
  }
  await page.waitForTimeout(postClickDelay);
  return true;
}

async function typeSlowly(page, locator, text, label, charDelay = 35) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: typeSlowly skipped - "${label}" not visible`);
    return false;
  }
  await moveAndClick(page, el, label);
  await el.fill('');
  await el.pressSequentially(text, { delay: charDelay });
  await page.waitForTimeout(500);
  return true;
}

async function panElements(page, selector, maxCount = 5) {
  const elements = await page.locator(selector).all();
  for (let i = 0; i < Math.min(elements.length, maxCount); i++) {
    try {
      const box = await elements[i].boundingBox();
      if (box && box.y < 700) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
        await page.waitForTimeout(550);
      }
    } catch (e) {
      console.warn(`WARNING: panElements skipped element ${i}: ${e.message}`);
    }
  }
}

// --------------- Rehearsal --------------- //

async function rehearse(page) {
  let allOk = true;
  const ok = (b) => { if (!b) allOk = false; };

  console.log('--- Rehearsing login ---');
  await page.goto(`${BASE_URL}/login`);
  ok(await ensureVisible(page, 'input[type="email"]', 'Email input'));
  ok(await ensureVisible(page, 'input[type="password"]', 'Password input'));
  ok(await ensureVisible(page, 'button[type="submit"]', 'Authenticate button'));

  console.log('--- Logging in for downstream rehearsal ---');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10_000 }).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState('domcontentloaded').catch(() => null);

  console.log('--- Rehearsing devices list ---');
  await page.goto(`${BASE_URL}/devices`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  ok(await ensureVisible(page, 'a[href="/containment"]', 'Sidebar Containment link'));

  console.log('--- Rehearsing containment page ---');
  await page.goto(`${BASE_URL}/containment`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  ok(await ensureVisible(
    page,
    'button:has-text("ENTER CONTAINMENT MODE"), button:has-text("RELEASE CONTAINMENT MODE")',
    'Containment action button',
  ));
  ok(await ensureVisible(page, 'text=Containment Configuration', 'Containment Configuration card'));

  if (!allOk) {
    console.error('REHEARSAL FAILED - fix selectors before recording');
    process.exit(1);
  }
  console.log('REHEARSAL PASSED - all selectors verified');
}

// --------------- Recording --------------- //

async function record(page) {
  // Step 1 — Login
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);
  await showSubtitle(page, 'Step 1 — Operator authentication');
  await page.waitForTimeout(1200);
  await typeSlowly(page, 'input[type="email"]', EMAIL, 'Email');
  await typeSlowly(page, 'input[type="password"]', PASSWORD, 'Password');
  await page.waitForTimeout(500);
  await moveAndClick(page, 'button[type="submit"]', 'Authenticate', { postClickDelay: 3500 });
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);

  // Step 2 — Fleet overview
  await showSubtitle(page, 'Step 2 — Endpoint fleet');
  await page.waitForTimeout(1500);
  await panElements(page, 'aside a, nav a', 4);
  await page.waitForTimeout(800);
  await panElements(page, 'tbody tr', 3);
  await page.waitForTimeout(1200);

  // Step 3 — Open the Containment console (pinned to synthetic demo device).
  await showSubtitle(page, 'Step 3 — Containment console');
  await page.goto(`${BASE_URL}/containment?device=${DEMO_DEVICE_ID}`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);

  // SAFETY GUARD: refuse to proceed if the URL does not target the demo device.
  // This prevents the demo from ever firing containment on an agent-paired
  // device (which would lock the operator's actual machine).
  const url = page.url();
  if (!url.includes(DEMO_DEVICE_ID)) {
    throw new Error(`Refusing to click containment action: URL does not target demo device. URL=${url}`);
  }

  // Step 4 — Pan policy panel + scroll
  await showSubtitle(page, 'Step 4 — Containment policy');
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'smooth' }));
  await page.waitForTimeout(1400);
  for (const label of ['Disable Network Interfaces', 'Revoke Active Sessions', 'Freeze Critical Applications', 'Lock System']) {
    const el = page.locator(`text=${label}`).first();
    if (await el.isVisible().catch(() => false)) {
      try {
        const box = await el.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
          await page.waitForTimeout(700);
        }
      } catch (e) {
        console.warn(`pan policy row "${label}" skipped: ${e.message}`);
      }
    }
  }

  // Step 5 — Initiate containment
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1400);
  await showSubtitle(page, 'Step 5 — Initiate containment');
  await page.waitForTimeout(900);
  await moveAndClick(
    page,
    'button:has-text("ENTER CONTAINMENT MODE")',
    'Enter Containment Mode',
    { postClickDelay: 3500 }
  );

  // Step 6 — Confirmation
  await showSubtitle(page, 'Step 6 — Endpoint contained');
  await page.waitForTimeout(2800);

  // Step 7 — Release
  await showSubtitle(page, 'Step 7 — Restoring normal state');
  await page.waitForTimeout(900);
  await moveAndClick(
    page,
    'button:has-text("RELEASE CONTAINMENT MODE")',
    'Release Containment Mode',
    { postClickDelay: 3500 }
  );

  // Step 8 — Done
  await showSubtitle(page, 'Step 8 — Endpoint released');
  await page.waitForTimeout(3000);
  await showSubtitle(page, '');
  await page.waitForTimeout(600);
}

// --------------- Entry --------------- //

(async () => {
  const browser = await chromium.launch({ headless: true });

  if (REHEARSAL) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    try {
      await rehearse(page);
    } catch (err) {
      console.error('REHEARSAL ERROR:', err.message);
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
    }
    return;
  }

  const context = await browser.newContext({
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await record(page);
  } catch (err) {
    console.error('DEMO ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await context.close();
    const video = page.video();
    if (video) {
      try {
        const src = await video.path();
        const dest = path.join(VIDEO_DIR, OUTPUT_NAME);
        fs.copyFileSync(src, dest);
        console.log('Video saved:', dest);
      } catch (e) {
        console.error('ERROR: Failed to copy video:', e.message);
      }
    }
    await browser.close();
  }
})();
