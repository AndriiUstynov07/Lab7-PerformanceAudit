// Автоматичні заміри сценаріїв S1–S4 (Lab 7).
// Використання: node measure.mjs <stage> <outDir> [scenarios=S1,S2,S3,S4] [runs=3]
// Шлях до Chrome береться з CHROME_PATH або шукається у стандартних місцях Windows.
// Потрібен запущений `npm run preview` на http://localhost:4173.
// Умови: вікно 1366×900, CPU 4× (CDP Emulation.setCPUThrottlingRate),
// кеш вимкнено, S1 — мережа "Fast 4G" (як у DevTools), S2–S4 — без мережевого throttling.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';

const [stage, outDir, scenArg = 'S1,S2,S3,S4', runsArg = '3', lhArg = '1'] = process.argv.slice(2);
const scenarios = scenArg.split(',');
const RUNS = Number(runsArg);
const URL = 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
const VIEWPORT = { width: 1366, height: 900 };
// DevTools preset "Fast 4G": 9 Mbps down, 1.5 Mbps up, RTT 60 ms × 2.75
const FAST_4G = {
  offline: false,
  latency: 165,
  downloadThroughput: (9 * 1000 * 1000 / 8) * 0.9,
  uploadThroughput: (1.5 * 1000 * 1000 / 8) * 0.9,
};
const CATEGORIES = [
  '-*', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.stack',
  'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'loading',
  'latencyInfo', 'toplevel', 'blink.console', 'disabled-by-default-devtools.screenshot',
].join(',');

const INIT = `
  window.__lt = 0; window.__ltCount = 0; window.__inter = {}; window.__lcp = 0; window.__cls = 0;
  new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lt += e.duration; window.__ltCount++; window.__lastLt = performance.now(); })).observe({ type: 'longtask' });
  new PerformanceObserver(l => l.getEntries().forEach(e => {
    if (e.interactionId) window.__inter[e.interactionId] = Math.max(window.__inter[e.interactionId] || 0, e.duration);
  })).observe({ type: 'event', durationThreshold: 16 });
  new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
`;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitQuiet(page, quietMs = 1500, max = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const since = await page.evaluate(() => performance.now() - (window.__lastLt || 0));
    if (since > quietMs) return;
    await sleep(250);
  }
}

function countForcedReflows(traceFile) {
  const json = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  const events = Array.isArray(json) ? json : json.traceEvents;
  let forced = 0, layouts = 0, layoutMs = 0;
  for (const e of events) {
    if (e.name !== 'Layout') continue;
    if (e.ph === 'X' || e.ph === 'B') {
      layouts++;
      if (e.dur) layoutMs += e.dur / 1000;
      if (e.args?.beginData?.stackTrace?.length) forced++;
    }
  }
  return { forced, layouts, layoutMs: Math.round(layoutMs) };
}

async function runScenario(browser, scen, run, traceFile) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  const res = {};

  if (scen === 'S1') {
    await cdp.send('Network.emulateNetworkConditions', FAST_4G);
    await browser.startTracing(page, { path: traceFile, screenshots: true, categories: CATEGORIES.split(',') });
    await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
    await waitQuiet(page, 2000);
    await sleep(1000);
    await browser.stopTracing();
    const m = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, lt: window.__lt }));
    res.lcp = Math.round(m.lcp); res.cls = +m.cls.toFixed(3); res.loadLongTasks = Math.round(m.lt);
    res.transferredMB = +(bytes / 1024 / 1024).toFixed(2);
  } else {
    await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
    await waitQuiet(page, 1500);
    await sleep(500);
    await page.evaluate(() => { window.__lt = 0; window.__ltCount = 0; window.__inter = {}; });
    await browser.startTracing(page, { path: traceFile, screenshots: true, categories: CATEGORIES.split(',') });
    await sleep(300);
    if (scen === 'S2') {
      await page.click('input[type=search]');
      for (const ch of 'мат') { await page.keyboard.type(ch); await sleep(150); }
    } else if (scen === 'S3') {
      await page.click('.tutor-card__fav >> nth=0');
    } else if (scen === 'S4') {
      await page.mouse.move(800, 500);
      for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 100); await sleep(100); }
    }
    await waitQuiet(page, 1500);
    await sleep(500);
    await browser.stopTracing();
    const m = await page.evaluate(() => ({ lt: window.__lt, n: window.__ltCount, inter: Object.values(window.__inter) }));
    res.longTasks = Math.round(m.lt);
    res.longTaskCount = m.n;
    res.interaction = m.inter.length ? Math.round(Math.max(...m.inter)) : 0;
    if (scen === 'S3') {
      res.favActive = await page.evaluate(() => document.querySelector('.tutor-card__fav')?.getAttribute('aria-pressed'));
    }
    if (scen === 'S4') Object.assign(res, countForcedReflows(traceFile));
  }
  await context.close();
  return res;
}

async function runLighthouse(n, htmlFile) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-sandbox', '--window-size=1366,900'] });
    const r = await lighthouse(URL, { port: chrome.port, output: 'html', onlyCategories: ['performance'], disableStorageReset: false }, desktopConfig);
    await chrome.kill();
    const a = r.lhr.audits;
    out.push({
      score: Math.round(r.lhr.categories.performance.score * 100),
      lcp: Math.round(a['largest-contentful-paint'].numericValue),
      tbt: Math.round(a['total-blocking-time'].numericValue),
      cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
      fcp: Math.round(a['first-contentful-paint'].numericValue),
      bytesMB: +(a['total-byte-weight'].numericValue / 1024 / 1024).toFixed(2),
    });
    if (i === 0 && htmlFile) fs.writeFileSync(htmlFile, r.report);
  }
  return out;
}

const KEY = { S1: 'lcp', S2: 'longTasks', S3: 'interaction', S4: 'longTasks' };

(async () => {
  fs.mkdirSync(path.join(outDir, 'traces'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const result = { stage, chrome: browser.version(), date: new Date().toISOString(), scenarios: {} };
  for (const scen of scenarios) {
    const runs = [];
    for (let r = 1; r <= RUNS; r++) {
      const tf = path.join(outDir, 'traces', `.tmp-${stage}-${scen}-${r}.json`);
      const m = await runScenario(browser, scen, r, tf);
      m.trace = tf;
      runs.push(m);
      console.log(stage, scen, 'run', r, JSON.stringify({ ...m, trace: undefined }));
    }
    // залишаємо трейс медіанного запуску (gzip, DevTools відкриває .json.gz)
    const k = KEY[scen];
    const med = median(runs.map((x) => x[k]));
    const keep = runs.find((x) => x[k] === med);
    const final = path.join(outDir, 'traces', `${stage}-${scen}.json.gz`);
    fs.writeFileSync(final, zlib.gzipSync(fs.readFileSync(keep.trace)));
    for (const x of runs) { fs.rmSync(x.trace, { force: true }); delete x.trace; }
    const medians = {};
    for (const key of Object.keys(runs[0])) if (typeof runs[0][key] === 'number') medians[key] = median(runs.map((x) => x[key]));
    result.scenarios[scen] = { runs, median: medians, trace: path.basename(final) };
  }
  await browser.close();
  if (scenarios.includes('S1') && lhArg === '1') {
    const lh = await runLighthouse(RUNS, path.join(outDir, 'raw', `${stage}-lighthouse.html`));
    lh.forEach((x, i) => console.log(stage, 'LH run', i + 1, JSON.stringify(x)));
    const medians = {};
    for (const key of Object.keys(lh[0])) medians[key] = median(lh.map((x) => x[key]));
    result.lighthouse = { runs: lh, median: medians };
  }
  fs.writeFileSync(path.join(outDir, 'raw', `${stage}.json`), JSON.stringify(result, null, 2));
  console.log('DONE', stage, JSON.stringify(Object.fromEntries(Object.entries(result.scenarios).map(([k, v]) => [k, v.median]))), JSON.stringify(result.lighthouse?.median));
})().catch((e) => { console.error(e); process.exit(1); });
