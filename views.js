'use strict';
(function () {
  const { t, num, el, svg, S, fmtDate } = UI;
  const STG = { created: 0, searching: 1, assigned: 2, arriving: 3, started: 4, completed: 5, cancelled: 6 };
  const noop = () => { };
  const tile = s => { const a = el('a', undefined, 'tile' + (s.id === 'snapp' ? ' feature' : '')); a.href = s.href || '#/s/' + s.id; a.append(svg(s.id), el('span', t('svc')[s.id])); return a; };
  const grid = g => { const d = el('div', undefined, 'grid'); MI.SERVICES.filter(s => s.group === g).forEach(s => d.append(tile(s))); return d; };
  const demoNote = txt => el('p', txt, 'note');
  const promo = (k, href) => { const a = el('a', undefined, 'promo'); a.href = href; a.append(el('strong', t(k + 't')), el('span', t(k + 'd'))); return a; };
  const rowsList = (items, f, emptyKey) => { const box = el('div', undefined, 'list'); if (!items.length) box.append(el('p', t(emptyKey), 'muted empty')); items.forEach(i => box.append(f(i))); return box; };
  const line = (a, b, c) => { const d = el('div', undefined, 'line'); d.append(el('span', a), el('strong', b)); if (c) d.append(el('small', c, 'muted')); return d; };

  function home(root) {
    const h = el('section', undefined, 'hero'); h.append(el('h1', t('heroTitle')), el('p', t('heroText')));
    const car = el('div', undefined, 'carousel'); [['o3', '#/s/snapp'], ['o1', '#/s/hotel'], ['o2', '#/s/flight']].forEach(([k, href]) => car.append(promo(k, href)));
    const ds = el('div', undefined, 'carousel'); [2, 3, 4].forEach((i, n) => { const a = el('a', undefined, 'dest d' + n); a.href = '#/s/flight'; a.append(el('strong', t('pl')[i]), el('small', t('sample'), 'badge')); ds.append(a); });
    root.append(h, car, el('h2', t('travel')), grid('travel'), el('h2', t('digital')), grid('digital'), el('h2', t('customer')), grid('customer'), el('h2', t('destTitle')), ds);
  }
  function notifications(root) { root.append(el('h1', t('nfTitle')), el('p', t('nfNote'), 'note')); t('nfItems').forEach(x => root.append(line(x, t('sample')))); }
  function offers(root) { root.append(el('h1', t('offersTitle')), el('p', t('o1d'), 'note'), promo('o1', '#/s/hotel'), promo('o2', '#/s/flight')); }

  function bookings(root) {
    root.append(el('h1', t('bookingsTitle')), el('p', t('histNote'), 'muted'));
    root.append(rowsList(P.store.bookings, b => line(b.ref + ' · ' + t('svc')[b.service] + ' · ' + fmtDate(b.at), b.pick ? num(b.pick.price) + ' ' + t('toman') : '', t('statusDemo')), 'noBookings'));
    root.append(el('h2', t('reqTitle')), rowsList(P.store.requests, r => line(r.ref + ' · ' + t('svc')[r.service], '', t('statusDemo')), 'noReq'));
    root.append(el('h2', t('rideHistory')), rowsList(P.store.rides, r => line(r.id + ' · ' + fmtDate(r.at), num(r.quote.price) + ' ' + t('toman'), t('tx_stages')[STG[r.status]]), 'noRides'));
  }

  function wallet(root) {
    const W = P.WALLET;
    const c = el('section', undefined, 'wcard'); c.append(el('small', t('wBalance')), el('p', num(W.balance) + ' ' + t('toman'), 'bal'));
    const sub = el('div', undefined, 'wsub'); sub.append(el('span', t('wAvail') + ': ' + num(W.available)), el('span', t('wPending') + ': ' + num(W.pending))); c.append(sub, el('small', t('balanceNote')));
    root.append(el('h1', t('svc').wallet), c, el('p', t('irrNote'), 'muted'));
    const acts = el('div', undefined, 'navrow'), hist = el('div');
    const paint = () => hist.replaceChildren(...P.store.activity.map(a => { const d = line(t('k_' + a.kind), (a.amount > 0 ? '+' : '') + num(a.amount), t('s_' + a.status)); return d; }));
    [['deposit', 'wDeposit'], ['transfer', 'wTransfer'], ['refund', 'wRefund']].forEach(([k, l]) => { const b = el('button', t(l), 'ghost2'); b.type = 'button'; b.onclick = () => { P.addSampleRequest(k); paint(); }; acts.append(b); });
    root.append(acts, el('p', t('wHint'), 'muted'), el('h2', t('wActivity')), hist); paint();
  }

  function profile(root) {
    root.append(el('h1', t('profileTitle')), el('p', t('profileNote'), 'note'), el('h2', t('supportTitle')), el('p', t('supportNote'), 'muted'));
    const f = el('form'), a = el('input'), m = el('input'), out = el('p', '', 'positive', { 'aria-live': 'polite' }); a.id = 'tk1'; m.id = 'tk2';
    const w = (id, lab, c) => { const d = el('div', undefined, 'field'), l = el('label', lab); l.htmlFor = id; d.append(l, c); return d; };
    const send = el('button', t('ticketSend'), 'cta'); send.type = 'submit'; f.append(w('tk1', t('ticketSubject'), a), w('tk2', t('ticketMsg'), m), send, out);
    f.onsubmit = e => { e.preventDefault(); if (!a.value.trim() || !m.value.trim()) { out.textContent = t('err_name'); out.className = 'err'; return; } P.store.tickets.unshift({ s: a.value, m: m.value }); out.className = 'positive'; out.textContent = t('ticketDone'); a.value = m.value = ''; };
    root.append(f);
  }

  function service(root, id) {
    const s = MI.SERVICES.find(x => x.id === id); if (!s) { location.hash = '#/home'; return noop; }
    const head = el('div', undefined, 'svc-head'); head.append(svg(id), el('h1', t('svc')[id])); root.append(head);
    if (s.flow === 'travel' || s.flow === 'fin') { root.append(el('p', t('demo'), 'note')); if (t('finDesc')[id]) root.append(el('p', t('finDesc')[id], 'muted')); Wizard.run(root, id, s.flow); }
    else if (s.flow === 'taxi') return Taxi.run(root);
    else if (s.flow === 'wallet') wallet(root);
    else if (s.flow === 'rates') root.append(el('p', t('ratesNote'), 'note'), el('p', t('irrNote'), 'muted'));
    else root.append(el('p', t('needPartner'), 'note'));
    return noop;
  }
  window.Views = { home, offers, notifications, bookings, wallet, profile, service };
})();
