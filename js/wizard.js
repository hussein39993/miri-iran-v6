'use strict';
// Reusable multi-step flow. Travel: search>results>details>review>done. Finance: form>review>done.
(function () {
  const { t, num, el, S } = UI;
  const pairs = a => a.map((x, i) => [String(i), x]);
  // Texts for the new airport/live-search parts (kept here so no other file has to change).
  const TXT = {
    searchAirport: { ar: 'ابحث بالاسم (عربي / فارسي / English) أو برمز IATA', fa: 'جستجو با نام (عربی / فارسی / English) یا کد IATA', en: 'Search by name (Arabic / Persian / English) or IATA code' },
    noMatch: { ar: 'لا يوجد مطار مطابق', fa: 'فرودگاهی پیدا نشد', en: 'No matching airport' },
    count: { ar: n => n + ' مطار', fa: n => n + ' فرودگاه', en: n => n + (n === 1 ? ' airport' : ' airports') },
    loadingAirports: { ar: 'جارٍ تحميل المطارات من الخادم... (قد يستغرق حتى دقيقة عند أول استخدام)', fa: 'در حال بارگذاری فرودگاه‌ها از سرور... (بار اول ممکن است تا یک دقیقه طول بکشد)', en: 'Loading airports from the server... (the first request can take up to a minute)' },
    airportsFailed: { ar: 'تعذّر تحميل قائمة المطارات: ', fa: 'بارگذاری فهرست فرودگاه‌ها ناموفق بود: ', en: 'Could not load the airport list: ' },
    retry: { ar: 'إعادة المحاولة', fa: 'تلاش دوباره', en: 'Retry' },
    airportRequired: { ar: 'اختر مطارًا من القائمة', fa: 'یک فرودگاه از فهرست انتخاب کنید', en: 'Choose an airport from the list' },
    airportsLive: { ar: n => 'قائمة المطارات حيّة من الخادم (Charter724) — ' + n + ' مطار', fa: n => 'فهرست فرودگاه‌ها زنده از سرور (Charter724) — ' + n + ' فرودگاه', en: n => 'Live airport list from the server (Charter724) — ' + n + ' airports' },
    airportsDemo: { ar: n => 'قائمة مطارات تجريبية (ليست من Charter724) — ' + n, fa: n => 'فهرست فرودگاه‌های نمایشی (نه از Charter724) — ' + n, en: n => 'DEMO airport list (not from Charter724) — ' + n },
    searching: { ar: 'جارٍ البحث عن الرحلات... (قد يستغرق حتى دقيقة عند أول استخدام)', fa: 'در حال جستجوی پروازها... (بار اول ممکن است تا یک دقیقه طول بکشد)', en: 'Searching flights... (the first request can take up to a minute)' },
    searchFailed: { ar: 'فشل البحث: ', fa: 'جستجو ناموفق بود: ', en: 'Search failed: ' },
    liveBanner: { ar: 'نتائج حيّة من Charter724 — للعرض فقط، الحجز والدفع معطّلان', fa: 'نتایج زنده از Charter724 — فقط نمایش؛ رزرو و پرداخت غیرفعال است', en: 'LIVE results from Charter724 — view only; booking and payment are disabled' },
    demoBanner: { ar: 'بيانات تجريبية وهمية — ليست رحلات أو أسعارًا حقيقية', fa: 'داده‌های نمایشی ساختگی — پرواز یا قیمت واقعی نیست', en: 'DEMO fictional data — not real flights or prices' },
    liveBadge: { ar: 'حيّ', fa: 'زنده', en: 'LIVE' },
    noPrice: { ar: 'السعر غير متاح', fa: 'قیمت موجود نیست', en: 'Price not available' },
    returnFlights: { ar: 'رحلات العودة', fa: 'پروازهای برگشت', en: 'Return flights' }
  };
  const L = k => { const v = TXT[k][S.lang] || TXT[k].en; return v; };
  (function injectCss() {
    if (document.getElementById('miri-wizard-css')) return;
    const c = document.createElement('style'); c.id = 'miri-wizard-css';
    c.textContent = '.apt-q{margin-bottom:.4rem;font-size:16px}.apt-hint{margin:.25rem 0 0;font-size:.85em;opacity:.8}'
      + '.live-badge{display:inline-block;margin-inline-start:.5rem;padding:.05rem .5rem;border-radius:999px;background:#0a7d3b;color:#fff;font-size:.75em;font-weight:700}'
      + '.src-live{border-inline-start:4px solid #0a7d3b}.src-demo{border-inline-start:4px solid #c77700}';
    document.head.append(c);
  })();

  function defs(service) {
    const spec = MI.SERVICES.find(s => s.id === service).spec, d = [];
    const add = (name, label, kind, o = {}) => d.push({ name, label, kind, req: true, ...o });
    for (const c of spec) {
      if (c === 'p') { add('from', t('from'), 'select', { opts: pairs(t('pl')), val: '0' }); add('to', t('to'), 'select', { opts: pairs(t('pl')), val: '2' }); }
      if (c === 'f') {
        add('from', t('from'), 'airport', { opts: [], val: '' }); add('to', t('to'), 'airport', { opts: [], val: '' });
        add('trip', t('trip'), 'select', { opts: [['oneway', t('tripOpts')[0]], ['round', t('tripOpts')[1]]], val: 'oneway' });
        add('date', t('date'), 'date', { val: MI.isoLocal(), min: MI.isoLocal() });
        add('ret', t('retDate'), 'date', { req: false, val: '', min: MI.isoLocal() });
        const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [String(a + i), String(a + i)]);
        add('adults', t('adults'), 'select', { opts: rng(1, 9), val: '1' }); add('children', t('children'), 'select', { opts: rng(0, 8), val: '0' }); add('infants', t('infants'), 'select', { opts: rng(0, 4), val: '0' });
        add('cabin', t('cabin'), 'select', { opts: pairs(t('cabinOpts')), val: '0' });
      }
      if (c === 'x') add('refRef', t('refRef'), 'text', { ph: 'DEMO-BKG-0001', ltr: true });
      if (c === 'y') add('refReason', t('refReason'), 'select', { opts: pairs(t('refReasons')), val: '0' });
      if (c === 'c') add('from', t('city'), 'select', { opts: pairs(t('pl')), val: '2' });
      if (c === 'd') add('date', t('date'), 'date', { val: MI.isoLocal(), min: MI.isoLocal() });
      if (c === 'n') add('pax', t('pax'), 'select', { opts: pairs(['1', '2', '3', '4']).map(([, v]) => [v, v]), val: '1' });
      if (c === 'o') add('operator', t('operator'), 'select', { opts: pairs(t('op')), val: '0' });
      if (c === 'h') add('phone', t('phone'), 'tel', { ph: '09xxxxxxxxx', ltr: true });
      if (c === 'k') add('pkg', t('pkg'), 'select', { opts: ['50000', '100000', '200000'].map(v => [v, num(v) + ' ' + t('toman')]), val: '50000' });
      if (c === 'b') add('bank', t('bank'), 'select', { opts: [['', t('choose')], ...pairs(t('banks'))], val: '' });
      if (c === 'a') add('amount', t('amount'), 'number', { ph: '100000' });
      if (c === 'u') add('cur', t('currency'), 'select', { opts: Object.entries(t('cur')), val: 'IRT' });
      if (c === 'r') add('rcp', t('rcp'), 'text', { req: false, ph: t('rcpHint') });
      if (c === 't') add('billType', t('billType'), 'select', { opts: pairs(t('bt')), val: '0' });
      if (c === 'i') add('billId', t('billId'), 'text', { ph: '123456789', ltr: true });
    }
    return d;
  }
  const detailDefs = () => [{ name: 'name', label: t('custName'), kind: 'text', req: true }, { name: 'contact', label: t('custContact'), kind: 'tel', req: true, ltr: true }];

  function check(ds, f) {
    const e = {}, R = MI.rules;
    for (const d of ds) {
      const v = f[d.name];
      if (d.kind === 'airport' && !v) e[d.name] = 'airportRequired';
      else if (d.name === 'to' && R.sameCity(f)) e.to = 'sameCity';
      else if (d.name === 'date' && R.pastDate(v)) e.date = 'pastDate';
      else if (d.name === 'ret' && f.trip === 'round' && !R.returnDate(f.date, v)) e.ret = 'returnDate';
      else if (d.name === 'adults' && !R.pax(f.adults, f.children, f.infants)) e.adults = 'pax';
      else if (d.name === 'refRef' && !(R.refRef(v) && (P.store.bookings.some(b => b.ref === String(v).trim()) || P.store.rides.some(r => r.id === String(v).trim())))) e.refRef = 'refRef';
      else if (d.name === 'amount' && !R.amount(v)) e.amount = 'amount';
      else if (d.name === 'phone' && !R.phone(v)) e.phone = 'phone';
      else if (d.name === 'bank' && !v) e.bank = 'bank';
      else if (d.name === 'billId' && !R.bill(v)) e.billId = 'bill';
      else if (d.name === 'name' && !R.name(v)) e.name = 'name';
      else if (d.name === 'contact' && !R.contact(v)) e.contact = 'contact';
    }
    return e;
  }
  const show = (d, v) => (d.opts ? ((d.opts.find(o => o[0] === String(v)) || [])[1] ?? v) : (v || '-'));

  const errText = k => (TXT[k] && typeof TXT[k][S.lang] === 'string' ? TXT[k][S.lang] : t('err_' + k));
  // V6 Task 1: ONE searchable combobox per airport field (js/airport-combobox.js). The chosen IATA code is written straight into
  // form.from / form.to, which the existing LiveFlights.search() already sends. Same airport in both fields is blocked by the combobox.
  function comboAirportNode(d, form, errs, reg) {
    const w = el('div', undefined, 'field'), host = el('div'), id = 'f_' + d.name + '_err', other = d.name === 'from' ? 'to' : 'from';
    const p = el('p', errs[d.name] ? errText(errs[d.name]) : '', 'err', { 'aria-live': 'polite', id });
    const cb = MiriAirportCombobox.mount(host, {
      lang: S.lang, name: d.name, label: d.label, placeholder: L('searchAirport'),
      getExcluded: () => form[other],
      onChange: code => { form[d.name] = code; if (code) p.textContent = ''; }
    });
    cb.setAirports(d.combo);
    if (form[d.name] && !cb.setValue(form[d.name])) form[d.name] = '';
    cb.input.setAttribute('aria-describedby', id);
    if (errs[d.name]) cb.input.setAttribute('aria-invalid', 'true');
    reg.push(cb); w.append(host, p); return w;
  }
  // Airport list not loaded yet: one inactive field (the step shows a loading note or a retry button).
  function waitingAirportNode(d) {
    const w = el('div', undefined, 'field'), l = el('label', d.label), c = el('input'); c.id = 'f_' + d.name; l.htmlFor = c.id; c.disabled = true; c.placeholder = '...';
    w.append(l, c, el('p', '', 'err', { 'aria-live': 'polite' })); return w;
  }
  const airportNode = (d, form, errs, reg) => !(d.airports || []).length ? waitingAirportNode(d)
    : (window.MiriAirportCombobox && d.combo && reg) ? comboAirportNode(d, form, errs, reg) : legacyAirportNode(d, form, errs);
  // Old picker (search box + <select>). Only used if js/airport-combobox.js did not load, so the page keeps working.
  function legacyAirportNode(d, form, errs) {
    const w = el('div', undefined, 'field'), id = 'f_' + d.name, l = el('label', d.label); l.htmlFor = id;
    const q = el('input'); q.type = 'search'; q.id = id + '_q'; q.className = 'apt-q'; q.autocomplete = 'off'; q.dir = 'auto';
    q.placeholder = L('searchAirport'); q.setAttribute('aria-label', d.label + ' — ' + L('searchAirport'));
    const c = el('select'); c.id = id; c.name = d.name;
    const hint = el('p', '', 'apt-hint', { 'aria-live': 'polite' });
    const all = d.airports || [];
    if (!all.length) { // list not loaded yet: show an inactive placeholder instead of an empty list
      q.disabled = true; const o = el('option', '...'); o.value = ''; c.append(o); c.disabled = true;
      w.append(l, q, c, el('p', '', 'err', { 'aria-live': 'polite' })); return w;
    }
    const fill = (matches, keep) => {
      c.replaceChildren();
      if (!matches.length) { const o = el('option', L('noMatch')); o.value = ''; c.append(o); form[d.name] = ''; hint.textContent = L('noMatch'); return; }
      matches.forEach(a => { const o = el('option', LiveFlights.label(a, S.lang)); o.value = a.code; c.append(o); });
      c.value = matches.some(a => a.code === keep) ? keep : matches[0].code;
      form[d.name] = c.value; hint.textContent = L('count')(matches.length);
    };
    fill(LiveFlights.filter(all, ''), form[d.name]);
    q.oninput = () => fill(LiveFlights.filter(all, q.value), form[d.name]);
    q.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); c.focus(); } };
    c.onchange = () => { form[d.name] = c.value; };
    const p = el('p', errs[d.name] ? errText(errs[d.name]) : '', 'err', { 'aria-live': 'polite' });
    if (errs[d.name]) c.setAttribute('aria-invalid', 'true');
    w.append(l, q, c, hint, p); return w;
  }
  function fieldNode(d, form, errs, reg) {
    if (d.kind === 'airport') return airportNode(d, form, errs, reg);
    const w = el('div', undefined, 'field'), id = 'f_' + d.name, l = el('label', d.label); l.htmlFor = id;
    const c = d.kind === 'select' ? el('select') : el('input');
    c.id = id; c.name = d.name;
    if (d.kind === 'select') d.opts.forEach(([v, lab]) => { const o = el('option', lab); o.value = v; c.append(o); });
    else { c.type = d.kind; if (d.min) c.min = d.min; if (d.ph) c.placeholder = d.ph; if (d.kind === 'number') { c.min = 1; c.step = 1; c.inputMode = 'numeric'; } }
    if (d.ltr) c.dir = 'ltr';
    c.value = form[d.name] ?? d.val ?? ''; form[d.name] = c.value;
    c.oninput = c.onchange = () => { form[d.name] = c.value; };
    const p = el('p', errs[d.name] ? errText(errs[d.name]) : '', 'err', { 'aria-live': 'polite' });
    if (errs[d.name]) c.setAttribute('aria-invalid', 'true');
    w.append(l, c, p); return w;
  }
  function fmtRow(k, v) {
    if (k === 'stops') return v === null || v === undefined ? '-' : v === 0 ? t('nonstop') : v + ' ' + t('stopWord');
    if (k === 'fare') return t('fare_' + v) === 'fare_' + v ? v : t('fare_' + v); if (k === 'cancel') return t('cancel_' + v) === 'cancel_' + v ? v : t('cancel_' + v);
    return v;
  }
  function run(root, service, flow) {
    const steps = flow === 'travel' ? ['search', 'results', 'details', 'review', 'done'] : ['form', 'review', 'done'];
    const st = { i: 0, form: {}, cust: {}, pick: null, rec: null, errs: {}, airportReady: service !== 'flight', airportError: '', searching: false };
    const ds = defs(service);
    const box = el('div'); root.append(box); draw();
    function loadAirports() {
      st.airportReady = false; st.airportError = '';
      if (!window.LiveFlights) { st.airportError = 'js/live-flights.js was not loaded (missing file or blocked script).'; if (st.i === 0) draw(); return; }
      LiveFlights.airports().then(r => {
        const list = r.airports, has = c => list.some(a => a.code === c);
        for (const d of ds.filter(x => x.name === 'from' || x.name === 'to')) d.airports = list;
        for (const d of ds.filter(x => x.name === 'from' || x.name === 'to')) d.opts = list.map(a => [a.code, LiveFlights.label(a, S.lang)]);
        // Airports in the shape the searchable combobox expects (same data, same Arabic fallback names as LiveFlights).
        if (window.MiriAirportCombobox) {
          const combo = list.map(a => MiriAirportCombobox.normalizeAirport({ code: a.code, nameEn: a.en, nameFa: a.fa, nameAr: a.ar })).filter(Boolean);
          for (const d of ds.filter(x => x.name === 'from' || x.name === 'to')) d.combo = combo;
        }
        st.airportSource = { fictional: r.fictional, source: r.source, n: list.length };
        // Same defaults as the old five-city list (Baghdad -> Mashhad) when the backend has them; the person can change both freely.
        if (!st.form.from) st.form.from = has('BGW') ? 'BGW' : list[0].code;
        if (!st.form.to) st.form.to = has('MHD') && st.form.from !== 'MHD' ? 'MHD' : (list.find(a => a.code !== st.form.from) || list[0]).code;
        st.airportReady = true; if (st.i === 0) draw();
      }).catch(e => { st.airportError = e.message || String(e); if (st.i === 0) draw(); });
    }
    if (service === 'flight') loadAirports();

    function progress() {
      const ol = el('ol', undefined, 'progress', { 'aria-label': t('prog') });
      steps.forEach((s, i) => { const li = el('li', t('st_' + s), i < st.i ? 'done' : i === st.i ? 'cur' : ''); if (i === st.i) li.setAttribute('aria-current', 'step'); ol.append(li); });
      return ol;
    }
    function nav(next, nextLabel, hideBack) {
      const n = el('div', undefined, 'navrow');
      if (!hideBack && st.i > 0) { const b = el('button', t('back'), 'ghost2'); b.type = 'button'; b.onclick = () => { st.errs = {}; st.i--; draw(); }; n.append(b); }
      if (next) { const b = el('button', nextLabel || t('next'), 'cta'); b.type = 'button'; b.onclick = next; n.append(b); }
      return n;
    }
    function summary() {
      const g = el('dl', undefined, 'sum');
      const row = (k, v) => g.append(el('dt', k), el('dd', v));
      row(t('svc')[service], '');
      ds.forEach(d => row(d.label, String(show(d, st.form[d.name])).replace(/^$/, '-')));
      if (st.pick) { row(st.pick.title || t('svc')[service], num(st.pick.price) + ' ' + t('toman')); }
      if (flow === 'travel') row(t('custName'), st.cust.name);
      return g;
    }
    function draw() {
      (st.combos || []).forEach(c => c.destroy()); st.combos = [];
      box.replaceChildren(progress());
      const s = steps[st.i], body = el('section', undefined, 'step');
      box.append(body);
      if (s === 'search' || s === 'form') {
        if (flow === 'fin' && ds.some(d => d.name === 'bank')) body.append(el('p', t('banksNote'), 'note'));
        if (service === 'flight' && !st.airportReady) {
          if (st.airportError) {
            body.append(el('p', L('airportsFailed') + st.airportError, 'note warn', { role: 'alert' }));
            const rb = el('button', L('retry'), 'cta small'); rb.type = 'button'; rb.onclick = () => { loadAirports(); draw(); }; body.append(rb);
          } else body.append(el('p', L('loadingAirports'), 'note', { role: 'status' }));
        } else if (service === 'flight' && st.airportSource) {
          const sr = st.airportSource;
          body.append(el('p', (sr.fictional ? L('airportsDemo') : L('airportsLive'))(sr.n), 'note ' + (sr.fictional ? 'src-demo' : 'src-live')));
        }
        const g = el('div', undefined, 'fields'); ds.forEach(d => g.append(fieldNode(d, st.form, st.errs, st.combos))); body.append(g);
        body.append(nav(() => {
          if (service === 'flight' && !st.airportReady) return;
          st.combos.forEach(c => c.commit()); // text typed but not yet confirmed (some phones do not blur the field when a button is tapped)
          st.errs = check(ds, st.form);
          if (Object.keys(st.errs).length) { draw(); const bad = box.querySelector('[aria-invalid]'); if (bad) bad.focus(); return; }
          st.i++; draw();
        }, flow === 'travel' ? t('search') : t('next')));
      } else if (s === 'results') {
        body.append(el('p', service === 'flight' ? L('searching') : t('loading'), 'muted', { role: 'status' }));
        (async () => {
          if (steps[st.i] !== 'results') return;
          let all, fictional = true, inbound = [];
          try {
            if (service === 'flight') {
              const answer = await LiveFlights.search(st.form);
              fictional = answer.fictional === true;
              all = fictional ? (answer.results || []).map(r => ({id:r.id, fictional:true, title:r.airline, price:r.price.amountToman, rows:{depAirport:r.from, arrAirport:r.to, dep:r.departure, arr:r.arrival||'-', duration:'-', stops:r.stops, baggage:r.baggage, fare:r.cabin, cancel:'-'}})) : (answer.results || []).map(LiveFlights.displayed);
              inbound = (answer.returnResults || []).map(LiveFlights.displayed);
            } else all = P.search(service, st.form);
          } catch (err) {
            if (steps[st.i] === 'results') body.replaceChildren(el('p', L('searchFailed') + (err && err.message || err), 'note warn', { role: 'alert' }), nav(null));
            return;
          }
          if (steps[st.i] !== 'results') return;
          body.replaceChildren();
          if (fictional) body.append(el('p', (service === 'flight' ? L('demoBanner') + ' — ' : '') + t('fictional'), 'note warn src-demo'));
          else body.append(el('p', L('liveBanner'), 'note src-live'));
          if (service === 'flight') body.append(el('p', t('paxNote'), 'muted'));
          const view = { sort: 'price', nonstop: false }, bar = el('div', undefined, 'fields'), list = el('div');
          const sw = el('div', undefined, 'field'), sl = el('label', t('sortBy')), ss = el('select'); sl.htmlFor = 'f_sort'; ss.id = 'f_sort';
          [['price', 'sort_price'], ['duration', 'sort_duration'], ['dep', 'sort_dep']].forEach(([v, k]) => { const o = el('option', t(k)); o.value = v; ss.append(o); });
          sw.append(sl, ss); bar.append(sw);
          let nsc = null;
          if (service === 'flight') { const w = el('div', undefined, 'field'), l = el('label', t('onlyNonstop')); nsc = el('input'); nsc.type = 'checkbox'; nsc.id = 'f_ns'; l.htmlFor = 'f_ns'; w.append(l, nsc); bar.append(w); }
          const card = r => {
            const c = el('article', undefined, 'result'), h = el('div', undefined, 'rh');
            h.append(el('strong', r.title || t('svc')[service])); if (r.fictional) h.append(el('span', t('sample'), 'badge')); else if (service === 'flight') h.append(el('span', L('liveBadge'), 'live-badge'));
            c.append(h);
            const rows = el('dl', undefined, 'rows');
            Object.entries(r.rows).forEach(([k, v]) => rows.append(el('dt', t('r_' + k)), el('dd', String(fmtRow(k, v)))));
            c.append(rows);
            const f = el('div', undefined, 'rf'); f.append(el('strong', Number.isFinite(Number(r.price)) && r.price !== null ? num(r.price) + ' ' + t('toman') : L('noPrice')));
            if (r.fictional) { const b = el('button', t('selectBtn'), 'cta small'); b.type = 'button'; b.onclick = () => { st.pick = r; st.i++; draw(); }; f.append(b); } c.append(f); return c;
          };
          const paint = () => {
            const rows = MI.sortResults(MI.filterResults(all, { nonstop: view.nonstop }), view.sort);
            list.replaceChildren(); if (!rows.length) list.append(el('p', t('noResults'), 'muted empty'));
            rows.forEach(r => list.append(card(r)));
          };
          ss.onchange = () => { view.sort = ss.value; paint(); };
          if (nsc) nsc.onchange = () => { view.nonstop = nsc.checked; paint(); };
          body.append(bar, list, nav(null)); paint();
          if (inbound.length) { body.append(el('h3', L('returnFlights'))); inbound.forEach(r => body.append(card(r))); }
        })();
      } else if (s === 'details') {
        const dd = detailDefs(), g = el('div', undefined, 'fields'); dd.forEach(d => g.append(fieldNode(d, st.cust, st.errs))); body.append(g);
        body.append(nav(() => { st.errs = check(dd, st.cust); if (Object.keys(st.errs).length) { draw(); const bad = box.querySelector('[aria-invalid]'); if (bad) bad.focus(); return; } st.i++; draw(); }));
      } else if (s === 'review') {
        body.append(el('h2', t('reviewTitle')), summary(), el('p', t('reviewNote'), 'note'));
        body.append(nav(() => {
          st.rec = flow === 'travel' ? P.submitBooking(service, st.form, st.pick && { title: st.pick.title, price: st.pick.price }, st.cust) : P.submitFinance(service, st.form);
          st.i++; draw();
        }, t('confirmDemo')));
      } else {
        body.append(el('h2', t('doneTitle')), el('p', t('doneNote'), 'note warn'));
        const g = el('dl', undefined, 'sum'); g.append(el('dt', t('refLabel')), el('dd', st.rec.ref), el('dt', t('statusLabel')), el('dd', t('statusDemo'))); body.append(g);
        const n = el('div', undefined, 'navrow');
        const a = el('button', t('newSearch'), 'ghost2'); a.type = 'button'; a.onclick = () => { st.i = 0; st.form = {}; st.cust = {}; st.pick = null; draw(); };
        const b = el('a', t('goBookings'), 'cta small'); b.href = '#/bookings'; n.append(a, b); body.append(n);
      }
    }
  }
  window.Wizard = { run, defs, check };
})();
