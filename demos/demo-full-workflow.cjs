'use strict';
/*
 * Overra — Full Operator Workflow Demo.
 *
 * Story:
 *   Sign-up -> auto-login -> first-time dashboard -> Downloads page with
 *   per-OS install instructions -> sign out -> sign in as the established
 *   operator -> Containment console -> Enter containment -> Release.
 *
 *   node demos/demo-full-workflow.cjs --rehearse   # validate selectors only
 *   node demos/demo-full-workflow.cjs              # record video
 *
 * Requires the Next.js dev server to be running on http://localhost:3000.
 *
 * SAFETY:
 *   The user's real endpoint is registered with hostname "void". The demo
 *   MUST NOT trigger containment on it. We pin every containment action to
 *   the synthetic device id below and refuse to click if the URL drifts.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';

// Established operator (already has paired devices in DB).
const OPERATOR_EMAIL = process.env.DEMO_EMAIL || 'test@overra.dev';
const OPERATOR_PASSWORD = process.env.DEMO_PASSWORD || 'Test1234!';

// Synthetic non-void device. Hostname is "demo-workstation-01" in the DB,
// no agent paired (agent_token_hash IS NULL), no walletAuthority set, so
// containment is one-click and never touches the operator's real machine.
const SAFE_DEMO_DEVICE_ID =
  process.env.DEMO_DEVICE_ID || 'demo-device-0000-0000-0000-000000000001';
const FORBIDDEN_HOSTNAME = 'void';

// New ephemeral signup account, unique per run.
const SIGNUP_SUFFIX = Date.now().toString(36);
const SIGNUP_NAME = 'Demo Operator';
const SIGNUP_EMAIL = `demo-${SIGNUP_SUFFIX}@overra.test`;
const SIGNUP_PASSWORD = 'DemoPass1234!';

const VIDEO_DIR = path.join(__dirname, 'screenshots');
const OUTPUT_NAME = 'demo-full-workflow.webm';
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
      transition: left 0.08s, top 0.08s;
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
      background: rgba(0, 0, 0, 0.78);
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
  if (text) await page.waitForTimeout(700);
}

async function hideDevOverlays(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-dev-overlay],
      [data-nextjs-toast],
      #__next-build-watcher,
      #__nextjs__container_errors_label,
      #__nextjs__container_build_indicator,
      [data-nextjs-build-indicator] {
        display: none !important;
        pointer-events: none !important;
      }
    `,
  }).catch(() => null);
}

async function reInjectOverlays(page) {
  await hideDevOverlays(page);
  await injectCursor(page);
  await injectSubtitleBar(page);
}

// --------------- Helpers --------------- //

async function ensureVisible(page, locator, label) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(
      `REHEARSAL FAIL: "${label}" not found - selector: ${typeof locator === 'string' ? locator : '(locator object)'}`,
    );
    const dump = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input, select, textarea, a'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => `${el.tagName}[${el.type || ''}] "${(el.textContent || '').trim().substring(0, 40)}"`)
        .slice(0, 50)
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
    await page.waitForTimeout(280);
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
      await page.waitForTimeout(380);
    }
    await el.click(clickOpts);
  } catch (e) {
    console.error(`WARNING: moveAndClick failed on "${label}": ${e.message}`);
    return false;
  }
  await page.waitForTimeout(postClickDelay);
  return true;
}

async function typeSlowly(page, locator, text, label, charDelay = 32) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: typeSlowly skipped - "${label}" not visible`);
    return false;
  }
  await moveAndClick(page, el, label);
  await el.fill('');
  await el.pressSequentially(text, { delay: charDelay });
  await page.waitForTimeout(450);
  return true;
}

async function hoverElement(page, locator, dwellMs = 700) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return false;
  try {
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await page.waitForTimeout(dwellMs);
    }
  } catch (e) {
    console.warn(`hoverElement skipped: ${e.message}`);
  }
  return true;
}

async function panElements(page, selector, maxCount = 5) {
  const elements = await page.locator(selector).all();
  for (let i = 0; i < Math.min(elements.length, maxCount); i++) {
    try {
      const box = await elements[i].boundingBox();
      if (box && box.y < 700) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await page.waitForTimeout(520);
      }
    } catch (e) {
      console.warn(`WARNING: panElements skipped element ${i}: ${e.message}`);
    }
  }
}

// --------------- Login as established operator --------------- //

async function loginAs(page, email, password) {
  await typeSlowly(page, 'input[type="email"]', email, 'Email');
  await typeSlowly(page, 'input[type="password"]', password, 'Password');
  await page.waitForTimeout(400);
  await moveAndClick(page, 'button[type="submit"]', 'Authenticate', { postClickDelay: 3200 });
  await page.waitForLoadState('domcontentloaded').catch(() => null);
}

// --------------- Rehearsal --------------- //

async function rehearse(page) {
  let allOk = true;
  const ok = (b) => { if (!b) allOk = false; };

  console.log('--- Rehearsing signup ---');
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  ok(await ensureVisible(page, 'input[placeholder="Jane Smith"]', 'Signup Name input'));
  ok(await ensureVisible(page, 'input[type="email"]', 'Signup Email input'));
  ok(await ensureVisible(page, 'input[type="password"]', 'Signup Password input'));
  ok(await ensureVisible(page, 'button[type="submit"]', 'Signup Submit button'));

  console.log('--- Rehearsing login ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  ok(await ensureVisible(page, 'input[type="email"]', 'Login Email input'));
  ok(await ensureVisible(page, 'input[type="password"]', 'Login Password input'));
  ok(await ensureVisible(page, 'button[type="submit"]', 'Login Submit button'));

  console.log('--- Logging in as operator for downstream rehearsal ---');
  await loginAs(page, OPERATOR_EMAIL, OPERATOR_PASSWORD);

  console.log('--- Rehearsing sidebar ---');
  ok(await ensureVisible(page, 'a[href="/downloads"]', 'Sidebar Downloads link'));
  ok(await ensureVisible(page, 'button:has-text("Sign Out")', 'Sidebar Sign Out button'));

  console.log('--- Rehearsing downloads page ---');
  await page.goto(`${BASE_URL}/downloads`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  ok(await ensureVisible(page, 'text=How to install the agent', 'Install instructions card'));
  ok(await ensureVisible(page, 'button:has-text("Windows")', 'Windows tab button'));
  ok(await ensureVisible(page, 'button:has-text("macOS")', 'macOS tab button'));
  ok(await ensureVisible(page, 'button:has-text("Linux")', 'Linux tab button'));
  ok(await ensureVisible(page, 'button:has-text("Generate .ps1")', 'Generate .ps1 button'));

  console.log('--- Rehearsing containment console (synthetic device) ---');
  await page.goto(`${BASE_URL}/containment?device=${SAFE_DEMO_DEVICE_ID}`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  ok(await ensureVisible(
    page,
    'button:has-text("ENTER CONTAINMENT MODE"), button:has-text("RELEASE CONTAINMENT MODE")',
    'Containment action button',
  ));

  // Refuse to record if the containment heading itself names the forbidden host.
  const headings = await page.locator('h1, h2, h3').allInnerTexts().catch(() => []);
  if (headings.some((t) => t.toLowerCase().includes(FORBIDDEN_HOSTNAME))) {
    console.error(`REHEARSAL FAIL: containment heading references forbidden host "${FORBIDDEN_HOSTNAME}"`);
    allOk = false;
  }

  if (!allOk) {
    console.error('REHEARSAL FAILED - fix selectors before recording');
    process.exit(1);
  }
  console.log('REHEARSAL PASSED - all selectors verified');
}

// --------------- Recording --------------- //

async function record(page) {
  // -----------------------------------------------------------------
  // Step 1 — Sign up
  // -----------------------------------------------------------------
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);
  await showSubtitle(page, 'Step 1 — Create your operator account');
  await page.waitForTimeout(1300);

  await typeSlowly(page, 'input[placeholder="Jane Smith"]', SIGNUP_NAME, 'Name');
  await typeSlowly(page, 'input[type="email"]', SIGNUP_EMAIL, 'Email');
  await typeSlowly(page, 'input[type="password"]', SIGNUP_PASSWORD, 'Password');
  await page.waitForTimeout(450);
  await moveAndClick(page, 'button[type="submit"]', 'Create account', { postClickDelay: 3800 });
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);

  // -----------------------------------------------------------------
  // Step 2 — First-time portal: empty fleet
  // -----------------------------------------------------------------
  await showSubtitle(page, 'Step 2 — First sign-in to the portal');
  await page.waitForTimeout(1600);
  await panElements(page, 'aside a', 5);
  await page.waitForTimeout(900);

  // -----------------------------------------------------------------
  // Step 3 — Installing the endpoint agent
  // -----------------------------------------------------------------
  await showSubtitle(page, 'Step 3 — Install the endpoint agent');
  await moveAndClick(page, 'aside a[href="/downloads"]', 'Sidebar -> Downloads', { postClickDelay: 1800 });
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);
  await page.waitForTimeout(1100);

  await showSubtitle(page, 'Step 3 — Generate a one-time installer');
  await panElements(page, 'button:has-text("Generate")', 3);
  await page.waitForTimeout(700);

  await moveAndClick(page, 'button:has-text("Generate .sh")', 'Generate Linux installer', {
    postClickDelay: 2200,
  });

  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h2, h3, [class*="CardTitle"], div'))
      .find((n) => (n.textContent || '').trim().startsWith('How to install the agent'));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(1600);

  await showSubtitle(page, 'Step 3 — Step-by-step install guide');
  await page.waitForTimeout(900);

  for (const os of ['Windows', 'macOS', 'Linux']) {
    await moveAndClick(page, `button:has-text("${os}")`, `${os} install tab`, { postClickDelay: 1500 });
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div'))
        .find((n) => (n.textContent || '').trim().startsWith('How to install the agent'));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    await page.waitForTimeout(700);
    await panElements(page, 'ol li', 3);
    await page.waitForTimeout(600);
  }

  // -----------------------------------------------------------------
  // Step 4 — Sign out, then sign in as the operator who owns devices
  // -----------------------------------------------------------------
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(900);
  await showSubtitle(page, 'Step 4 — Switching to operator with paired endpoints');
  await page.waitForTimeout(900);
  // force:true defeats the Next.js dev overlay's pointer-events trap.
  await moveAndClick(page, 'button:has-text("Sign Out")', 'Sign Out', {
    postClickDelay: 2800,
    force: true,
  });
  await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => null);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);

  await showSubtitle(page, 'Step 5 — Sign in as established operator');
  await page.waitForTimeout(900);
  await loginAs(page, OPERATOR_EMAIL, OPERATOR_PASSWORD);
  await reInjectOverlays(page);

  // -----------------------------------------------------------------
  // Step 6 — Containment console (PINNED to synthetic non-void device)
  // -----------------------------------------------------------------
  await showSubtitle(page, 'Step 6 — Open Containment console');
  await page.goto(`${BASE_URL}/containment?device=${SAFE_DEMO_DEVICE_ID}`);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await reInjectOverlays(page);

  // SAFETY GUARD: refuse to act if URL drifted, or page heading names "void".
  const url = page.url();
  if (!url.includes(SAFE_DEMO_DEVICE_ID)) {
    throw new Error(`Refusing to proceed: URL does not target synthetic demo device. URL=${url}`);
  }
  const headings = await page.locator('h1, h2, h3').allInnerTexts().catch(() => []);
  if (headings.some((t) => t.toLowerCase().includes(FORBIDDEN_HOSTNAME))) {
    throw new Error(`Refusing to proceed: containment heading references forbidden host "${FORBIDDEN_HOSTNAME}"`);
  }

  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'smooth' }));
  await page.waitForTimeout(1200);

  for (const label of ['Disable Network Interfaces', 'Revoke Active Sessions', 'Freeze Critical Applications', 'Lock System']) {
    await hoverElement(page, `text=${label}`, 700);
  }

  // -----------------------------------------------------------------
  // Step 7 — Enter containment
  // -----------------------------------------------------------------
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1200);
  await showSubtitle(page, 'Step 7 — Initiate containment');
  await page.waitForTimeout(800);
  await moveAndClick(
    page,
    'button:has-text("ENTER CONTAINMENT MODE")',
    'Enter Containment Mode',
    { postClickDelay: 3500 },
  );

  await showSubtitle(page, 'Step 7 — Endpoint contained');
  await page.waitForTimeout(2600);

  // -----------------------------------------------------------------
  // Step 8 — Release containment
  // -----------------------------------------------------------------
  await showSubtitle(page, 'Step 8 — Releasing containment');
  await page.waitForTimeout(900);
  await moveAndClick(
    page,
    'button:has-text("RELEASE CONTAINMENT MODE")',
    'Release Containment Mode',
    { postClickDelay: 3500 },
  );

  await showSubtitle(page, 'Step 8 — Endpoint released, fleet healthy');
  await page.waitForTimeout(3000);
  await showSubtitle(page, '');
  await page.waitForTimeout(700);
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

  console.log(`[demo] Ephemeral signup account: ${SIGNUP_EMAIL}`);
  console.log(`[demo] Synthetic containment target: ${SAFE_DEMO_DEVICE_ID}`);
  console.log(`[demo] Forbidden host (never acted on): ${FORBIDDEN_HOSTNAME}`);

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
