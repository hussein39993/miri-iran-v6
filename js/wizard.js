'use strict';
// Reusable multi-step flow. Travel: search>results>details>review>done. Finance: form>review>done.
(function () {
  const { t, num, el, S } = UI;
  const pairs = a => a.map((x, i) => [String(i), x]);

  function defs(service) {
    const spec = MI.SERVICES.find(s => s.id === service).spec, d = [];
    const add = (name, label, kind, o = {}) => d.push({ name, label, kind, req: true, ...o });
    for (const c of spec) {
      if (c === 'p') { add('from', t('from'), 'select', { opts: pairs(t('pl')), val: '0' }); add('to', t('to'), 'select', { opts: pairs(t('pl')), val: '2' }); }
      if (c === 'f') {
        add('from', t('from'), 'select', { opts: pairs(t('pl')), val: '0' }); add('to', t('to'), 'select', { opts: pairs(t('pl')), val: '2' });
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
      if (d.name === 'to' && R.sameCity(f)) e.to = 'sameCity';
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

  function fieldNode(d, form, errs) {
    const w = el('div', undefined, 'field'), id = 'f_' + d.name, l = el('label', d.label); l.htmlFor = id;
    const c = d.kind === 'select' ? el('select') : el('input');
    c.id = id; c.name = d.name;
    if (d.kind === 'select') d.opts.forEach(([v, lab]) => { const o = el('option', lab); o.value = v; c.append(o); });
    else { c.type = d.kind; if (d.min) c.min = d.min; if (d.ph) c.placeholder = d.ph; if (d.kind === 'number') { c.min = 1; c.step = 1; c.inputMode = 'numeric'; } }
    if (d.ltr) c.dir = 'ltr';
    c.value = form[d.name] ?? d.val ?? ''; form[d.name] = c.value;
    c.oninput = c.onchange = () => { form[d.name] = c.value; };
    const p = el('p', errs[d.name] ? t('err_' + errs[d.name]) : '', 'err', { 'aria-live': 'polite' });
    if (errs[d.name]) c.setAttribute('aria-invalid', 'true');
    w.append(l, c, p); return w;
  }
  function fmtRow(k, v) {
    if (k === 'stops') return v === 0 ? t('nonstop') : v + ' ' + t('stopWord');
    if (k === 'fare') return t('fare_' + v); if (k === 'cancel') return t('cancel_' + v);
    return v;
  }
  function run(root, service, flow) {
    const steps = flow === 'travel' ? ['search', 'results', 'details', 'review', 'done'] : ['form', 'review', 'done'];
    const st = { i: 0, form: {}, cust: {}, pick: null, rec: null, errs: {} };
    const ds = defs(service);
    const box = el('div'); root.append(box); draw();

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
      box.replaceChildren(progress());
      const s = steps[st.i], body = el('section', undefined, 'step');
      box.append(body);
      if (s === 'search' || s === 'form') {
        if (flow === 'fin' && ds.some(d => d.name === 'bank')) body.append(el('p', t('banksNote'), 'note'));
        const g = el('div', undefined, 'fields'); ds.forEach(d => g.append(fieldNode(d, st.form, st.errs))); body.append(g);
        body.append(nav(() => {
          st.errs = check(ds, st.form);
          if (Object.keys(st.errs).length) { draw(); const bad = box.querySelector('[aria-invalid]'); if (bad) bad.focus(); return; }
          st.i++; draw();
        }, flow === 'travel' ? t('search') : t('next')));
      } else if (s === 'results') {
        body.append(el('p', t('loading'), 'muted'));
        setTimeout(() => {
          if (steps[st.i] !== 'results') return;
          body.replaceChildren(el('p', t('fictional'), 'note'));
          if (service === 'flight') body.append(el('p', t('paxNote'), 'muted'));
          const all = P.search(service, st.form), view = { sort: 'price', nonstop: false }, bar = el('div', undefined, 'fields'), list = el('div');
          const sw = el('div', undefined, 'field'), sl = el('label', t('sortBy')), ss = el('select'); sl.htmlFor = 'f_sort'; ss.id = 'f_sort';
          [['price', 'sort_price'], ['duration', 'sort_duration'], ['dep', 'sort_dep']].forEach(([v, k]) => { const o = el('option', t(k)); o.value = v; ss.append(o); });
          sw.append(sl, ss); bar.append(sw);
          let nsc = null;
          if (service === 'flight') { const w = el('div', undefined, 'field'), l = el('label', t('onlyNonstop')); nsc = el('input'); nsc.type = 'checkbox'; nsc.id = 'f_ns'; l.htmlFor = 'f_ns'; w.append(l, nsc); bar.append(w); }
          const card = r => {
            const c = el('article', undefined, 'result'), h = el('div', undefined, 'rh');
            h.append(el('strong', r.title || (t('svc')[service] + ' #' + (r.id.slice(-1) * 1 + 1))), el('span', t('sample'), 'badge'));
            c.append(h);
            const rows = el('dl', undefined, 'rows');
            Object.entries(r.rows).forEach(([k, v]) => rows.append(el('dt', t('r_' + k)), el('dd', String(fmtRow(k, v)))));
            c.append(rows);
            const f = el('div', undefined, 'rf'); f.append(el('strong', num(r.price) + ' ' + t('toman')));
            const b = el('button', t('selectBtn'), 'cta small'); b.type = 'button'; b.onclick = () => { st.pick = r; st.i++; draw(); }; f.append(b); c.append(f); return c;
          };
          const paint = () => {
            const rows = MI.sortResults(MI.filterResults(all, { nonstop: view.nonstop }), view.sort);
            list.replaceChildren(); if (!rows.length) list.append(el('p', t('noResults'), 'muted empty'));
            rows.forEach(r => list.append(card(r)));
          };
          ss.onchange = () => { view.sort = ss.value; paint(); };
          if (nsc) nsc.onchange = () => { view.nonstop = nsc.checked; paint(); };
          body.append(bar, list, nav(null)); paint();
        }, 350);
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
