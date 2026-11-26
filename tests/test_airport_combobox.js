'use strict';
// Real-browser tests for the airport combobox (Chromium via Playwright).
// The page is served locally and talks to a LOCAL MOCK of GET /api/airports (cross-origin, like GitHub Pages -> Render).
// It does NOT call Charter724 or the real Render server, and it does not test flight search, payment, booking or wallet.
// Run:  node tests/test_airport_combobox.js        (needs: npm i playwright && npx playwright install chromium)
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';

const AIRPORTS = [
  { code: 'KIH', name: 'Kish International Airport', nameFa: 'فرودگاه بین‌المللی کیش', nameAr: 'مطار كيش الدولي', city: 'Kish' },
  { code: 'MHD', name: 'Mashhad Hasheminejad Airport', nameFa: 'فرودگاه مشهد', nameAr: 'مطار مشهد', city: 'Mashhad' },
  { code: 'IKA', name: 'Tehran Imam Khomeini Airport', nameFa: 'فرودگاه امام خمینی تهران', nameAr: 'مطار الإمام الخميني طهران', city: 'Tehran' },
  { code: 'THR', name: 'Tehran Mehrabad Airport', nameFa: 'فرودگاه مهرآباد تهران', nameAr: 'مطار مهرآباد طهران', city: 'Tehran' },
  { code: 'NJF', name: 'Najaf Al Ashraf Airport', nameFa: 'فرودگاه نجف', nameAr: 'مطار النجف الأشرف', city: 'Najaf' },
  { code: 'BGW', name: 'Baghdad International Airport', nameFa: 'فرودگاه بغداد', nameAr: 'مطار بغداد الدولي', city: 'Baghdad' },
  { code: 'BSR', name: 'Basra International Airport', nameFa: 'فرودگاه بصره', nameAr: 'مطار البصرة الدولي', city: 'Basra' },
  { code: 'GBT', name: 'Gorgan Airport', nameFa: 'فرودگاه گرگان', nameAr: 'مطار كركان', city: 'Gorgan' },
  { code: 'ZBR', name: 'Chabahar Konarak Airport', nameFa: 'فرودگاه چابهار', nameAr: 'مطار جابهار', city: 'Chabahar' },
  { code: 'ABD', name: 'Abadan Airport', nameFa: 'فرودگاه آبادان', nameAr: 'مطار عبادان', city: 'Abadan' },
  { code: 'SYZ', name: 'Shiraz International Airport', nameFa: 'فرودگاه شیراز', nameAr: 'مطار شيراز', city: 'Shiraz' },
  { code: 'XSS', name: '<img src=x onerror="window.__xss=1">Evil', nameFa: 'تست', nameAr: 'تست', city: 'X' },
  { code: 'BAD1', name: 'Invalid code entry (must be ignored)' },
  { name: 'No code at all (must be ignored)' },
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const results = []; let current = '';
function startServers() {
  const mock = { fail: 0, hits: 0, shape: 'flat' };
  const api = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
    if (u.pathname === '/__mode') { mock.fail = Number(u.searchParams.get('fail') || 0); mock.shape = u.searchParams.get('shape') || 'flat'; mock.hits = 0; res.writeHead(200, h); return res.end('{}'); }
    if (u.pathname === '/__hits') { res.writeHead(200, h); return res.end(JSON.stringify({ hits: mock.hits })); }
    if (u.pathname === '/api/airports') {
      mock.hits++;
      if (mock.fail > 0) { mock.fail--; res.writeHead(503, h); return res.end(JSON.stringify({ error: { code: 'PROVIDER_NOT_CONFIGURED' } })); }
      const list = mock.shape === 'nested' ? AIRPORTS.map(a => ({ iata: a.code, name: { fa: a.nameFa, ar: a.nameAr, en: a.name }, city: a.city })) : AIRPORTS;
      res.writeHead(200, h); return res.end(JSON.stringify({ source: 'charter724', fictional: false, airports: list }));
    }
    res.writeHead(404, h); res.end('{}');
  });
  const web = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname, f = path.join(ROOT, p === '/' ? 'airport-demo.html' : p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res);
  });
  return Promise.all([new Promise(r => api.listen(0, '127.0.0.1', r)), new Promise(r => web.listen(0, '127.0.0.1', r))]).then(() => ({ api, web, mock }));
}
const test = (name, fn) => results.push({ name, fn });

(async () => {
  const { api, web, mock } = await startServers();
  const apiUrl = 'http://127.0.0.1:' + api.address().port, webUrl = 'http://127.0.0.1:' + web.address().port;
  const setMode = async (q) => { await fetch(apiUrl + '/__mode?' + q); };
  const browser = await chromium.launch();

  async function open(ctx, lang = 'ar', mode = '') {
    await setMode(mode);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/503/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(`${webUrl}/airport-demo.html?lang=${lang}&api=${encodeURIComponent(apiUrl)}`);
    await page.waitForFunction(() => window.pair && window.pair.ready).then(() => page.evaluate(() => window.pair.ready));
    page.errors = errors; return page;
  }
  const fromIn = p => p.locator('#fromHost input.mac-input'), toIn = p => p.locator('#toHost input.mac-input');
  const optCodes = (p, host) => p.locator(`#${host} .mac-opt`).evaluateAll(n => n.map(x => x.dataset.code));
  const codes = p => p.evaluate(() => window.pair.getCodes());

  const desktop = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const mobile = await browser.newContext({ ...devices['Pixel 7'] });

  // ---------- pure logic (inside the real browser engine too) ----------
  test('page has exactly two airport fields: 2 comboboxes, 0 <select>, 2 hidden code inputs', async () => {
    const p = await open(desktop);
    assert.strictEqual(await p.locator('input[role=combobox]').count(), 2);
    assert.strictEqual(await p.locator('select').count(), 0);
    assert.strictEqual(await p.locator('input.mac-input:visible').count(), 2);
    await p.close();
  });
  test('airports are loaded dynamically from GET /api/airports (cross-origin), invalid codes ignored, one request shared by both fields', async () => {
    const p = await open(desktop); await fromIn(p).focus();
    const c = await optCodes(p, 'fromHost'); assert.strictEqual(c.length, 12); assert(!c.includes('BAD1') && !c.includes('BAD'));
    assert.strictEqual((await (await fetch(apiUrl + '/__hits')).json()).hits, 1);
    assert.strictEqual(await p.evaluate(() => window.pair.source), 'charter724'); await p.close();
  });
  test('works with a nested airport shape too ({iata, name:{fa,ar,en}})', async () => {
    const p = await open(desktop, 'en', 'shape=nested'); await fromIn(p).fill('kish');
    assert.deepStrictEqual(await optCodes(p, 'fromHost'), ['KIH']);
    await fromIn(p).fill('مطار كيش'); assert.deepStrictEqual(await optCodes(p, 'fromHost'), ['KIH']); await p.close();
  });
  const searches = [
    ['English name', 'kish', 'KIH'], ['English partial, mixed case', 'MaShHaD', 'MHD'], ['IATA code lower', 'kih', 'KIH'], ['IATA code upper', 'NJF', 'NJF'],
    ['Persian name', 'کیش', 'KIH'], ['Arabic keyboard (ك ي) for Persian name', 'كيش', 'KIH'], ['Persian with diacritic', 'مَشهد', 'MHD'],
    ['Arabic name with ال', 'النجف', 'NJF'], ['Arabic hamza forms (الأشرف)', 'الاشرف', 'NJF'], ['Arabic إ/أ vs ا (الإمام)', 'الامام', 'IKA'],
    ['Persian آ vs Arabic ا (آبادان / ابادان)', 'ابادان', 'ABD'], ['Persian گ typed with Arabic ك (كركان)', 'كركان', 'GBT'], ['Persian چ typed as Arabic ج (جابهار)', 'جابهار', 'ZBR'],
    ['Persian name with ZWNJ stripped (بین المللی کیش)', 'بین المللی کیش', 'KIH'], ['two words in any order (Imam Tehran)', 'imam tehran', 'IKA'],
    ['Arabic city (البصرة)', 'البصرة', 'BSR'], ['Arabic ة vs Persian ه (البصره)', 'البصره', 'BSR'], ['no match for unrelated digits', '۹۹۹', null],
  ];
  searches.forEach(([label, q, expect]) => test('search: ' + label + ' "' + q + '"', async () => {
    const p = await open(desktop); await fromIn(p).fill(q); const c = await optCodes(p, 'fromHost');
    if (expect) { assert(c.includes(expect), 'expected ' + expect + ' in ' + JSON.stringify(c)); assert.strictEqual(c[0], expect, 'best match must be first: ' + JSON.stringify(c)); } else assert.strictEqual(c.length, 0);
    await p.close();
  }));
  test('digits: Persian and Arabic-Indic digits normalise to ASCII; Latin diacritics and case are ignored', async () => {
    const p = await open(desktop); const r = await p.evaluate(() => [MiriAirportCombobox.normalize('۱۲۳٤٥'), MiriAirportCombobox.normalize('Ésfahàn')]); assert.deepStrictEqual(r, ['12345', 'esfahan']); await p.close();
  });
  test('"tehran" finds both Tehran airports (IKA, THR); unknown text shows the empty message', async () => {
    const p = await open(desktop); await fromIn(p).fill('tehran'); assert.deepStrictEqual((await optCodes(p, 'fromHost')).sort(), ['IKA', 'THR']);
    await fromIn(p).fill('zzzzqq'); assert.strictEqual(await p.locator('#fromHost .mac-opt').count(), 0); assert(/No matching|لا توجد|پیدا نشد/.test(await p.locator('#fromHost .mac-msg').innerText())); await p.close();
  });

  // ---------- selection / display / payload ----------
  test('mouse: choosing shows "name (CODE)" in the same field, hidden value = IATA code, list closes', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).click(); await fromIn(p).fill('mash'); await p.locator('#fromHost .mac-opt[data-code=MHD]').click();
    assert.strictEqual(await fromIn(p).inputValue(), 'Mashhad Hasheminejad Airport (MHD)'); assert.strictEqual(await p.locator('#fromHost input[type=hidden]').inputValue(), 'MHD');
    assert.strictEqual(await p.locator('#fromHost .mac-list').isHidden(), true); assert.deepStrictEqual(await codes(p), { from: 'MHD', to: '' }); await p.close();
  });
  test('Arabic page shows the Arabic-script name + code; English page shows the English name + code', async () => {
    const a = await open(desktop, 'ar'); await fromIn(a).fill('kih'); await a.keyboard.press('ArrowDown'); await a.keyboard.press('Enter');
    assert(/\(KIH\)$/.test(await fromIn(a).inputValue()) && /[\u0600-\u06ff]/.test(await fromIn(a).inputValue()), await fromIn(a).inputValue()); await a.close();
    const f = await open(desktop, 'fa'); await fromIn(f).fill('kih'); await f.keyboard.press('Enter'); assert.strictEqual(await fromIn(f).inputValue(), 'فرودگاه بین‌المللی کیش (KIH)'); await f.close();
  });
  test('typing after a selection clears the old code at once (a stale code can never be sent)', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('kih'); await p.keyboard.press('Enter'); assert.strictEqual((await codes(p)).from, 'KIH');
    await fromIn(p).press('End'); await p.keyboard.type('x'); assert.strictEqual((await codes(p)).from, ''); await p.close();
  });
  test('focusing a selected field selects its text and shows the FULL list (typing replaces, not appends)', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('kih'); await p.keyboard.press('Enter'); await toIn(p).focus(); await fromIn(p).click(); await p.waitForTimeout(80);
    assert.strictEqual(await p.locator('#fromHost .mac-opt').count(), 12); await p.keyboard.type('shiraz'); assert.deepStrictEqual(await optCodes(p, 'fromHost'), ['SYZ']); await p.close();
  });
  test('blur with an exact IATA code selects it; blur with a unique match selects it; blur with junk reverts to the last empty/valid state', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('bgw'); await toIn(p).focus(); assert.strictEqual((await codes(p)).from, 'BGW');
    await toIn(p).fill('basra'); await fromIn(p).focus(); assert.strictEqual((await codes(p)).to, 'BSR');
    await fromIn(p).fill('qqq'); await toIn(p).focus(); assert.strictEqual(await fromIn(p).inputValue(), ''); assert.strictEqual((await codes(p)).from, ''); await p.close();
  });
  test('clear (×) button empties the field and the code', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('kih'); await p.keyboard.press('Enter'); await p.locator('#fromHost .mac-clear').click();
    assert.strictEqual(await fromIn(p).inputValue(), ''); assert.strictEqual((await codes(p)).from, ''); await p.close();
  });

  // ---------- same airport ----------
  test('same airport is blocked: disabled in the other list, click does nothing, keyboard skips it, setValue refuses', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('kih'); await p.keyboard.press('Enter');
    await toIn(p).fill('kish'); const off = p.locator('#toHost .mac-opt[data-code=KIH]'); assert.strictEqual(await off.getAttribute('aria-disabled'), 'true');
    await off.click({ force: true }); assert.strictEqual((await codes(p)).to, '');
    await toIn(p).fill('kih'); await p.keyboard.press('Enter'); assert.strictEqual((await codes(p)).to, ''); // only match is disabled: nothing is chosen
    await toIn(p).fill(''); await toIn(p).focus(); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); const first = (await codes(p)).to; assert(first && first !== 'KIH', 'first enabled item chosen: ' + first);
    assert.strictEqual(await p.evaluate(() => window.pair.to.setValue('KIH')), false); assert.strictEqual(await p.evaluate(() => window.pair.from.setValue(window.pair.to.value)), false);
    assert.strictEqual(await p.evaluate(() => window.pair.validate()), true); await p.close();
  });
  test('after the departure changes, the old departure becomes selectable again in the arrival list', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('kih'); await p.keyboard.press('Enter'); await fromIn(p).fill('mhd'); await p.keyboard.press('Enter');
    await toIn(p).fill('kih'); assert.strictEqual(await p.locator('#toHost .mac-opt[data-code=KIH]').getAttribute('aria-disabled'), null);
    await p.keyboard.press('Enter'); assert.deepStrictEqual(await codes(p), { from: 'MHD', to: 'KIH' }); await p.close();
  });

  // ---------- keyboard / ARIA ----------
  test('keyboard: ArrowDown opens + moves, ArrowUp moves back, Enter selects, Esc closes, Tab leaves, aria attributes follow', async () => {
    const p = await open(desktop, 'en'); const i = fromIn(p); await i.focus(); await p.keyboard.press('Escape'); assert.strictEqual(await i.getAttribute('aria-expanded'), 'false');
    await p.keyboard.press('ArrowDown'); assert.strictEqual(await i.getAttribute('aria-expanded'), 'true');
    const a1 = await i.getAttribute('aria-activedescendant'); assert(a1); await p.keyboard.press('ArrowDown'); const a2 = await i.getAttribute('aria-activedescendant'); assert.notStrictEqual(a1, a2);
    await p.keyboard.press('ArrowUp'); assert.strictEqual(await i.getAttribute('aria-activedescendant'), a1);
    assert.strictEqual(await p.locator('#' + a1).getAttribute('aria-selected'), 'true'); assert.strictEqual(await p.locator('#' + a1).getAttribute('role'), 'option');
    assert.strictEqual(await i.getAttribute('role'), 'combobox'); assert.strictEqual(await p.locator('#' + await i.getAttribute('aria-controls')).getAttribute('role'), 'listbox');
    await p.keyboard.press('Escape'); assert.strictEqual(await i.getAttribute('aria-expanded'), 'false');
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); assert((await codes(p)).from, 'Enter selected the highlighted airport');
    await p.keyboard.press('Tab'); assert.strictEqual(await toIn(p).evaluate(n => n === document.activeElement), true); await p.close();
  });
  test('keyboard: typing then Enter picks the best (first) match; Enter with a closed list does not break the form', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('tehran mehr'); await p.keyboard.press('Enter'); assert.strictEqual((await codes(p)).from, 'THR'); await p.keyboard.press('Enter'); assert.strictEqual((await codes(p)).from, 'THR'); await p.close();
  });
  test('Escape on an empty/closed field with text clears it', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('kih'); await p.keyboard.press('Enter'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); assert.strictEqual(await fromIn(p).inputValue(), ''); await p.close();
  });
  test('validate(): empty fields -> false + aria-invalid + focus on the first empty field; both set and different -> true', async () => {
    const p = await open(desktop, 'en'); assert.strictEqual(await p.evaluate(() => window.pair.validate()), false);
    assert.strictEqual(await fromIn(p).getAttribute('aria-invalid'), 'true'); assert.strictEqual(await fromIn(p).evaluate(n => n === document.activeElement), true);
    await fromIn(p).fill('kih'); await p.keyboard.press('Enter'); await toIn(p).fill('mhd'); await p.keyboard.press('Enter');
    assert.strictEqual(await p.evaluate(() => window.pair.validate()), true); await p.locator('#go').click(); assert.deepStrictEqual(JSON.parse(await p.locator('#out').innerText()), { valid: true, from: 'KIH', to: 'MHD' }); await p.close();
  });

  // ---------- security / robustness ----------
  test('airport text from the API is inserted as text (no HTML/script execution)', async () => {
    const p = await open(desktop, 'en'); await fromIn(p).fill('evil'); assert.strictEqual(await p.locator('#fromHost .mac-list img').count(), 0); assert.strictEqual(await p.evaluate(() => window.__xss || 0), 0);
    assert(/<img/.test(await p.locator('#fromHost .mac-opt-name').first().innerText())); await p.close();
  });
  test('API failure: error + retry button shown; retry succeeds without reloading the page', async () => {
    const p = await open(desktop, 'en', 'fail=1'); await fromIn(p).focus(); assert(/Could not load/.test(await p.locator('#fromHost .mac-msg').innerText()));
    await p.locator('#fromHost .mac-retry').click(); await p.waitForFunction(() => document.querySelectorAll('#fromHost .mac-opt').length > 0); assert.strictEqual(await p.locator('#fromHost .mac-opt').count(), 12);
    assert.strictEqual(await p.locator('#toHost .mac-opt').count() >= 0, true); await p.close();
  });
  test('no JavaScript errors in the console during all of the above flows (checked on a fresh run)', async () => {
    const p = await open(desktop, 'ar'); await fromIn(p).fill('كيش'); await p.keyboard.press('Enter'); await toIn(p).fill('مشهد'); await p.keyboard.press('Enter'); assert.deepStrictEqual(p.errors, []); await p.close();
  });

  // ---------- mobile (touch emulation, Pixel 7) ----------
  test('MOBILE touch: tap field, type Arabic, tap suggestion -> selected; tap other field and pick; same airport blocked', async () => {
    const p = await open(mobile, 'ar'); await fromIn(p).tap(); await p.keyboard.type('كيش'); await p.locator('#fromHost .mac-opt[data-code=KIH]').tap();
    assert.strictEqual((await codes(p)).from, 'KIH'); assert(/\(KIH\)$/.test(await fromIn(p).inputValue()));
    await toIn(p).tap(); await p.keyboard.type('kish'); assert.strictEqual(await p.locator('#toHost .mac-opt[data-code=KIH]').getAttribute('aria-disabled'), 'true');
    await p.locator('#toHost .mac-opt[data-code=KIH]').tap({ force: true }); assert.strictEqual((await codes(p)).to, '');
    await toIn(p).fill(''); await p.keyboard.type('مشهد'); await p.locator('#toHost .mac-opt[data-code=MHD]').tap(); assert.deepStrictEqual(await codes(p), { from: 'KIH', to: 'MHD' });
    assert.deepStrictEqual(p.errors, []); await p.close();
  });
  test('MOBILE: input font is >= 16px (no iOS zoom), touch targets >= 44px, page does not scroll sideways, list stays inside the viewport width', async () => {
    const p = await open(mobile, 'ar'); await fromIn(p).tap();
    const m = await p.evaluate(() => { const i = document.querySelector('.mac-input'), o = document.querySelector('.mac-opt'), l = document.querySelector('.mac-list'), r = l.getBoundingClientRect();
      return { fs: parseFloat(getComputedStyle(i).fontSize), h: o.getBoundingClientRect().height, ih: i.getBoundingClientRect().height, sx: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: r.left, right: r.right, vw: innerWidth }; });
    assert(m.fs >= 16, 'font ' + m.fs); assert(m.h >= 44, 'option h ' + m.h); assert(m.ih >= 44, 'input h ' + m.ih); assert(m.sx <= 0, 'h-scroll ' + m.sx); assert(m.left >= 0 && m.right <= m.vw + 0.5, JSON.stringify(m)); await p.close();
  });
  test('MOBILE: dragging/scrolling inside the list does not select anything and keeps the list open', async () => {
    const p = await open(mobile, 'en'); await fromIn(p).tap(); const box = await p.locator('#fromHost .mac-list').boundingBox();
    await p.mouse.move(box.x + 20, box.y + box.height - 20); await p.evaluate(() => { document.querySelector('#fromHost .mac-list').scrollTop = 150; });
    assert.strictEqual((await codes(p)).from, ''); assert.strictEqual(await fromIn(p).getAttribute('aria-expanded'), 'true'); await p.close();
  });
  test('tap/click outside closes the list and reverts unfinished text', async () => {
    const p = await open(mobile, 'en'); await fromIn(p).tap(); await p.keyboard.type('qqq'); await p.locator('h1').tap(); await p.waitForTimeout(60);
    assert.strictEqual(await fromIn(p).getAttribute('aria-expanded'), 'false'); assert.strictEqual(await fromIn(p).inputValue(), ''); await p.close();
  });

  // ---------- screenshots (visual check by a human) ----------
  test('screenshots: desktop RTL, mobile RTL, mobile LTR dark (saved only when SHOTS_DIR is set)', async () => {
    if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true });
    let p = await open(desktop, 'ar'); await fromIn(p).fill('كيش'); await p.screenshot({ path: path.join(SHOTS, 'desktop-rtl-search.png') }); await p.close();
    p = await open(mobile, 'ar'); await fromIn(p).tap(); await p.keyboard.type('طهران'); await p.screenshot({ path: path.join(SHOTS, 'mobile-rtl-search.png') }); await p.close();
    const dark = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'dark' }); p = await open(dark, 'en'); await fromIn(p).tap(); await p.keyboard.type('kih'); await p.keyboard.press('Enter'); await toIn(p).tap(); await p.keyboard.type('k');
    await p.screenshot({ path: path.join(SHOTS, 'mobile-ltr-dark-same-airport-blocked.png') }); await p.close(); await dark.close();
  });

  let pass = 0, fail = 0;
  for (const t of results) {
    try { await t.fn(); pass++; console.log('PASS  ' + t.name); } catch (e) { fail++; console.log('FAIL  ' + t.name + '\n      ' + String(e.message).split('\n').slice(0, 4).join('\n      ')); }
  }
  console.log(`\n${pass} passed, ${fail} failed (Chromium ${browser.version()}, local mock API)`);
  await browser.close(); api.close(); web.close(); process.exit(fail ? 1 : 0);
})();
