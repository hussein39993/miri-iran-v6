'use strict';
// Taxi module: Pickup > Destination > Route + Vehicle > Payment/Review > Demo ride. Demo provider only.
(function () {
  const { t, num, el, store, fmtDate, S } = UI;
  const STG = { created: 0, searching: 1, assigned: 2, arriving: 3, started: 4, completed: 5, cancelled: 6 };
  const recents = () => { try { return JSON.parse(store.get('miri.recent') || '[]').filter(r => MI.inArea(r.lat, r.lon)).slice(0, 5); } catch { return []; } };
  const saveRecent = p => store.set('miri.recent', JSON.stringify([p, ...recents().filter(r => r.label !== p.label)].slice(0, 5)));
  const row = (a, b) => { const d = el('div', undefined, 'line'); d.append(el('span', a), el('strong', b)); return d; };

  function run(root) {
    const prov = P.getSnappProvider();
    const st = { step: 'pickup', pickup: null, dest: null, cur: null, route: null, veh: 'eco', pay: 'cash', note: '', ride: null, timer: null, map: null, ok: false, layers: [] };
    // Option B: the existing external button, kept exactly (class, text, href, rel).
    const bar = el('div', undefined, 'optbar'), A = el('div', undefined, 'opt'), B = el('div', undefined, 'opt');
    A.append(el('strong', t('tx_optA')), el('span', t('tx_optAd'), 'muted'));
    const open = el('a', t('openSnapp'), 'ghost2 linkbtn'); open.href = 'https://snapp.ir'; open.target = '_blank'; open.rel = 'noopener noreferrer';
    B.append(open, el('span', t('openSnappNote'), 'muted')); bar.append(A, B);
    root.append(el('p', t('snappIntro'), 'note'), bar);
    const wrap = el('div', undefined, 'taxi'), mapBox = el('div', undefined, 'tmapwrap'), mapEl = el('div', undefined, 'tmap'), pin = el('div', undefined, 'cpin'), sheet = el('div', undefined, 'sheet');
    mapBox.append(mapEl, pin); wrap.append(mapBox, sheet); root.append(wrap, el('p', t('tx_mapNote'), 'muted'));

    MapSvc.loadLeaflet().then(() => {
      st.map = MapSvc.createMap(mapEl, { lat: 35.6892, lon: 51.389, zoom: 12 }); st.ok = true;
      st.map.on('moveend', () => { if ((st.step === 'pickup' || st.step === 'dest') && st.cur && !(st.cur.label && MI.haversineKm(st.cur, MapSvc.center(st.map)) < 0.005)) { st.cur = { ...MapSvc.center(st.map), label: '' }; if (st.showAddr) st.showAddr(); } });
      render();
    }).catch(() => { st.ok = false; mapEl.replaceChildren(el('p', t('tx_mapFail'), 'note')); render(); });

    const clearLayers = () => { st.layers.forEach(l => l.remove()); st.layers = []; };
    function render() {
      sheet.replaceChildren(); pin.hidden = !(st.ok && (st.step === 'pickup' || st.step === 'dest')); pin.className = 'cpin ' + (st.step === 'pickup' ? 'pk' : 'ds');
      if (st.step === 'pickup' || st.step === 'dest') { clearLayers(); pickStep(st.step); } else if (st.step === 'vehicle') vehicleStep(); else if (st.step === 'review') reviewStep(); else rideStep();
    }
    function choose(x) { st.cur = { lat: x.lat, lon: x.lon, label: x.label || '' }; if (st.ok) st.map.setView([x.lat, x.lon], 16, { animate: false }); if (st.showAddr) st.showAddr(); }

    function pickStep(kind) {
      sheet.append(el('h2', t(kind === 'pickup' ? 'tx_pickupTitle' : 'tx_destTitle')));
      const f = el('form', undefined, 'sform'), inp = el('input'), go = el('button', t('tx_searchBtn'), 'cta small'); inp.type = 'search'; inp.maxLength = 120; inp.placeholder = t('tx_search'); inp.setAttribute('aria-label', t('tx_search')); go.type = 'submit'; f.append(inp, go);
      const msg = el('p', '', 'muted', { 'aria-live': 'polite' }), list = el('div', undefined, 'sugs'), addr = el('p', '', 'addr');
      st.showAddr = () => { addr.textContent = st.cur ? ((st.cur.label ? st.cur.label + ' · ' : '') + t('tx_coords') + ': ' + MapSvc.fmtCoord(st.cur)) : ''; };
      const sug = x => { const b = el('button', x.label, 'sug'); b.type = 'button'; b.onclick = () => choose(x); return b; };
      f.onsubmit = async e => { e.preventDefault(); const q = inp.value.trim(); if (q.length < 2) return; msg.textContent = t('tx_searching'); list.replaceChildren(); try { const r = await MapSvc.geocode(q, S.lang); msg.textContent = r.length ? '' : t('tx_noResults'); r.forEach(x => list.append(sug(x))); } catch { msg.textContent = t('tx_netFail'); } };
      sheet.append(f, msg, list);
      if (kind === 'pickup' && navigator.geolocation) { const b = el('button', t('tx_locate'), 'ghost2'); b.type = 'button'; b.onclick = () => navigator.geolocation.getCurrentPosition(p => choose({ lat: p.coords.latitude, lon: p.coords.longitude, label: t('tx_myLoc') }), () => { msg.textContent = t('tx_locDenied'); }, { timeout: 8000 }); sheet.append(b); }
      const chips = (title, items) => { if (!items.length) return; const d = el('div', undefined, 'chips'); d.append(el('small', title, 'muted')); items.forEach(x => { const b = el('button', x.label, 'chip'); b.type = 'button'; b.onclick = () => choose(x); d.append(b); }); sheet.append(d); };
      if (kind === 'dest') chips(t('tx_recent'), recents());
      chips(t('tx_popular'), MapSvc.PRESETS.map((p, i) => ({ ...p, label: t('ppl')[i] })));
      if (st.ok) sheet.append(el('p', t('tx_moveMap'), 'muted'));
      const ok = el('button', t(kind === 'pickup' ? 'tx_confirmP' : 'tx_confirmD'), 'cta'), err = el('p', '', 'err', { 'aria-live': 'polite' }); ok.type = 'button';
      ok.onclick = async () => {
        err.textContent = ''; let p = st.ok ? { ...MapSvc.center(st.map), label: (st.cur && st.cur.label && MI.haversineKm(st.cur, MapSvc.center(st.map)) < 0.005) ? st.cur.label : '' } : (st.cur && { ...st.cur });
        if (!p) { err.textContent = t(kind === 'pickup' ? 'err_pickup' : 'err_dest'); return; }
        if (!MI.inArea(p.lat, p.lon)) { err.textContent = t('tx_outside'); return; }
        ok.disabled = true; if (!p.label) { try { p.label = await MapSvc.reverse(p, S.lang); } catch { } } if (!p.label) p.label = MapSvc.fmtCoord(p);
        ok.disabled = false; st[kind] = p; if (kind === 'dest') saveRecent(p); st.cur = null;
        st.step = kind === 'pickup' && !st.dest ? 'dest' : (st.pickup && st.dest ? 'vehicle' : 'pickup'); render();
      };
      sheet.append(addr, err, ok); st.showAddr();
    }

    async function vehicleStep() {
      const top = el('div', undefined, 'navrow');
      const ed = (k, lab) => { const b = el('button', lab, 'ghost2'); b.type = 'button'; b.onclick = () => { st.step = k; render(); }; return b; };
      const sw = el('button', t('tx_swap'), 'ghost2'); sw.type = 'button'; sw.onclick = () => { [st.pickup, st.dest] = [st.dest, st.pickup]; render(); };
      top.append(ed('pickup', t('pickup') + ' · ' + t('tx_edit')), ed('dest', t('dest') + ' · ' + t('tx_edit')), sw);
      sheet.append(row(t('pickup'), st.pickup.label), row(t('dest'), st.dest.label), top);
      const body = el('div'); body.append(el('p', t('tx_routeLoading'), 'muted')); sheet.append(body);
      clearLayers(); if (st.ok) st.layers.push(MapSvc.addPin(st.map, st.pickup, 'pk'), MapSvc.addPin(st.map, st.dest, 'ds'));
      const rt = await MapSvc.route(st.pickup, st.dest); if (st.step !== 'vehicle') return; st.route = rt;
      if (st.ok) { st.layers.push(MapSvc.addLine(st.map, rt.coords)); MapSvc.fit(st.map, rt.coords); }
      body.replaceChildren(); const q = v => prov.quote({ pickup: st.pickup, dest: st.dest, km: rt.km, min: rt.min, vehicle: v, source: rt.source });
      try { q('eco'); } catch { body.append(el('p', t('err_sameLoc'), 'err')); return; }
      body.append(row(t('dist'), rt.km + ' ' + t('km')), row(t('time'), rt.min + ' ' + t('minU')), el('p', t(rt.source === 'osrm' ? 'tx_roadEst' : 'tx_lineEst'), 'note'));
      const cards = el('div', undefined, 'vehs');
      ['eco', 'pre'].forEach(v => { const quote = q(v), c = el('button', undefined, 'veh'); c.type = 'button'; c.setAttribute('aria-pressed', st.veh === v);
        c.append(el('strong', t('v_' + v)), el('span', t('vd_' + v), 'muted'), el('b', num(quote.price) + ' ' + t('toman')), el('small', t('tx_fareDemo'), 'muted'), el('small', t('tx_arrival'), 'muted'));
        c.onclick = () => { st.veh = v; cards.querySelectorAll('.veh').forEach(x => x.setAttribute('aria-pressed', x === c)); }; cards.append(c); });
      const next = el('button', t('tx_toPay'), 'cta'); next.type = 'button'; next.onclick = () => { st.step = 'review'; render(); };
      body.append(cards, next);
    }

    function reviewStep() {
      const q = prov.quote({ pickup: st.pickup, dest: st.dest, km: st.route.km, min: st.route.min, vehicle: st.veh, source: st.route.source });
      sheet.append(el('h2', t('reviewTitle')), row(t('pickup'), st.pickup.label), row(t('dest'), st.dest.label), row(t('dist'), st.route.km + ' ' + t('km') + ' · ' + st.route.min + ' ' + t('minU')), row(t('v_' + st.veh), num(q.price) + ' ' + t('toman')), el('p', t('tx_fareDemo'), 'note'));
      const fs = el('fieldset', undefined, 'pay'); fs.append(el('legend', t('pay')));
      [['cash', t('payCash'), false], ['wallet', t('payWallet'), true]].forEach(([v, l, dis]) => { const lab = el('label', undefined, 'radio'), r = el('input'); r.type = 'radio'; r.name = 'pay'; r.value = v; r.disabled = dis; r.checked = v === st.pay; r.onchange = () => { st.pay = v; }; lab.append(r, document.createTextNode(' ' + l)); fs.append(lab); });
      const nl = el('label', t('tx_note')), ta = el('textarea'); ta.maxLength = 140; ta.rows = 2; ta.value = st.note; ta.id = 'tx_note'; nl.htmlFor = 'tx_note'; ta.oninput = () => { st.note = ta.value; };
      const pl = el('div', undefined, 'chips'); pl.append(el('small', t('tx_plannedLbl'), 'muted')); t('tx_planned').forEach(x => { const b = el('button', x, 'chip'); b.type = 'button'; b.disabled = true; pl.append(b); });
      const n = el('div', undefined, 'navrow'), back = el('button', t('back'), 'ghost2'), go = el('button', t('tx_request'), 'cta'); back.type = go.type = 'button';
      back.onclick = () => { st.step = 'vehicle'; render(); };
      go.onclick = () => { st.ride = prov.create(q, st.pay, st.note, { pickup: st.pickup.label, dest: st.dest.label }); st.step = 'ride'; render(); clearInterval(st.timer); st.timer = setInterval(() => { prov.advance(st.ride.id); drawRide(); }, 2200); };
      n.append(back, go); sheet.append(fs, nl, ta, pl, n);
    }

    function rideStep() { st.rideBox = el('div'); sheet.append(st.rideBox); drawRide(); }
    function drawRide() {
      if (st.step !== 'ride') return; const r = st.ride, box = st.rideBox; box.replaceChildren(); const i = STG[r.status];
      box.append(el('h2', t('rideTitle')), el('p', t('tx_stages')[i], 'status-line', { 'aria-live': 'polite' }));
      const ol = el('ol', undefined, 'stages'); t('tx_stages').slice(0, 6).forEach((s, k) => ol.append(el('li', s, r.status === 'cancelled' ? '' : k < i ? 'done' : k === i ? 'cur' : ''))); box.append(ol);
      if (r.status === 'assigned' || r.status === 'arriving' || r.status === 'started') box.append(row(t('driver'), t('driverName')));
      const n = el('div', undefined, 'navrow');
      if (r.status === 'completed' || r.status === 'cancelled') { clearInterval(st.timer); if (r.status === 'completed') { box.append(el('h3', t('tx_receipt')), row(t('refLabel'), r.id), row(t('total'), num(r.quote.price) + ' ' + t('toman')), row(t('statusLabel'), fmtDate(r.at))); } const nb = el('button', t('newSearch'), 'ghost2'); nb.type = 'button'; nb.onclick = () => { Object.assign(st, { step: 'pickup', pickup: null, dest: null, route: null, ride: null, note: '' }); render(); }; n.append(nb); }
      else { const c = el('button', t('cancelRide'), 'ghost2'); c.type = 'button'; c.onclick = () => { prov.cancel(r.id); clearInterval(st.timer); drawRide(); }; n.append(c); }
      const h = el('a', t('goBookings'), 'cta small'); h.href = '#/bookings'; n.append(h); box.append(n);
    }
    render();
    return () => { clearInterval(st.timer); if (st.map) st.map.remove(); };
  }
  window.Taxi = { run };
})();
