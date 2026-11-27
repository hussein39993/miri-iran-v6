'use strict';
// Wallet UI, Stage 1: PREVIEW ONLY. Nothing here credits a wallet, converts money or contacts a payment provider.
// Balances/rates/transactions are demo data held in memory (never localStorage). Requires UI (ui.js) and MIW (wallet-core.js).
(function () {
  const { t, el, fmtDate, S, LANGS } = UI;
  const W = window.MIW;
  const CODES = W.CODES;
  const DB = { txs: W.demoTransactions(), balances: W.DEMO_BALANCES };

  const loc = () => LANGS[S.lang].loc;
  const fmt = (n, c) => { const d = W.CUR[c].dec; return new Intl.NumberFormat(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n); };
  const money = (n, c) => fmt(n, c) + ' ' + c;
  const fmtRate = r => new Intl.NumberFormat(loc(), { maximumSignificantDigits: 6 }).format(r);
  const ltr = txt => el('bdi', txt, 'wltr', { dir: 'ltr' });
  const NS = 'http://www.w3.org/2000/svg';
  const chatIcon = () => { const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', 'M4 5h16v11H9l-5 4z'); s.append(p); return s; };
  const field = (id, label, ctrl) => { const d = el('div', undefined, 'field'), l = el('label', label); l.htmlFor = id; d.append(l, ctrl); return d; };
  const curSelect = (id, list, value) => { const s = el('select'); s.id = id; list.forEach(c => { const o = el('option', c + ' — ' + t('w_cur_' + c)); o.value = c; s.append(o); }); s.value = value; return s; };
  const optSelect = (id, pairs, value) => { const s = el('select'); s.id = id; pairs.forEach(([v, l]) => { const o = el('option', l); o.value = v; s.append(o); }); s.value = value; return s; };
  const errP = q => { const p = el('p', t('w_err_' + q.error) + ' ', 'err', { role: 'alert' }); if (q.limit !== undefined) p.append(ltr(money(q.limit, q.from))); return p; };
  const dlAdd = (dl, k, v) => { const dd = el('dd'); dd.append(v); dl.append(el('dt', k), dd); };
  const rateText = (from, to, r) => { const x = W.scaleRate(r); return ltr(new Intl.NumberFormat(loc()).format(x.base) + ' ' + from + ' = ' + fmtRate(x.value) + ' ' + to); };

  const pendingSum = c => DB.txs.filter(x => W.isPending(x) && x.toCur === c).reduce((s, x) => s + x.final, 0);

  function balances() {
    const box = el('section', undefined, 'wbal', { 'aria-label': t('w_balances') });
    CODES.forEach(c => {
      const card = el('article', undefined, 'wc wc-' + c), top = el('div', undefined, 'wc-top');
      top.append(el('span', W.CUR[c].country, 'wflag'), el('strong', c), el('small', t('w_cur_' + c), 'muted'), el('span', t('w_example'), 'badge'));
      const amt = el('p', undefined, 'bal'); amt.append(ltr(fmt(DB.balances[c], c)), ' ', el('span', t('w_sym_' + c), 'wsym'));
      const pend = el('small', undefined, 'muted'); pend.append(t('w_pending') + ': ', ltr(money(pendingSum(c), c)));
      card.append(top, amt, pend); box.append(card);
    });
    return box;
  }

  const GLYPH = { pending: '◔', under_review: '◎', approved: '✔', completed: '✔', rejected: '✖', failed: '!', cancelled: '⊘', refunded: '↩' };
  const statusBadge = s => el('span', GLYPH[s] + ' ' + t('w_stt_' + s), 'wst wst-' + s);

  function txCard(tx) {
    const c = el('article', undefined, 'wtx'), head = el('div', undefined, 'wtx-head');
    head.append(el('strong', t('w_ty_' + tx.type)), statusBadge(tx.status));
    const main = el('p', undefined, 'wtx-main'); main.append(ltr(money(tx.amount, tx.fromCur) + ' → ' + money(tx.final, tx.toCur)));
    const dl = el('dl', undefined, 'wdl');
    dlAdd(dl, t('w_txId'), ltr(tx.id)); dlAdd(dl, t('w_custId'), ltr(tx.customerId));
    dlAdd(dl, t('w_orig'), ltr(money(tx.amount, tx.fromCur))); dlAdd(dl, t('w_dest'), ltr(tx.toCur));
    dlAdd(dl, t('w_rate'), rateText(tx.fromCur, tx.toCur, tx.rate)); dlAdd(dl, t('w_fee'), ltr(money(tx.fee, tx.toCur)));
    dlAdd(dl, t('w_final'), ltr(money(tx.final, tx.toCur))); dlAdd(dl, t('w_method'), t('w_pm_' + tx.method));
    dlAdd(dl, t('w_when'), fmtDate(tx.at));
    c.append(head, main, dl);
    if (tx.isDemo) c.append(el('small', t('w_example'), 'badge'));
    return c;
  }

  // ---------- Converter (exchange preview and calculator) ----------
  function converter(o, timers) {
    const ex = o.mode === 'exchange', rates = W.getRates(), ttl = rates.quoteTtlSec;
    const box = el('section', undefined, 'panel wconv');
    let from = o.from, to = o.to, exp = Date.now() + ttl * 1000, expired = false;
    const sf = curSelect(o.id + '-f', CODES, from), st = curSelect(o.id + '-t', CODES, to);
    const amt = el('input', undefined, undefined, { type: 'text', inputmode: 'decimal', autocomplete: 'off' }); amt.id = o.id + '-a'; amt.value = o.amount || '';
    const swap = el('button', '⇄', 'wswap', { 'aria-label': t('w_swap'), title: t('w_swap') }); swap.type = 'button';
    const avail = el('p', undefined, 'muted'), out = el('div', undefined, 'wout', { 'aria-live': 'polite' });
    const clock = el('p', undefined, 'muted'), refresh = el('button', t('w_refresh'), 'ghost2'); refresh.type = 'button'; refresh.hidden = true;
    const confirm = el('button', t('w_confirmOff'), 'cta'); confirm.type = 'button'; confirm.disabled = true;
    const pair = el('div', undefined, 'wpair'); pair.append(field(o.id + '-f', t('w_from'), sf), swap, field(o.id + '-t', t('w_to'), st));
    box.append(el('h2', t(ex ? 'w_exTitle' : 'w_calcTitle')), pair);
    if (ex) box.append(avail);
    box.append(field(o.id + '-a', t('w_amount'), amt), out);
    if (ex) box.append(clock, refresh, confirm, el('p', t('w_confirmNote'), 'muted'));

    const tickText = () => { const left = Math.max(0, Math.ceil((exp - Date.now()) / 1000)); clock.textContent = left > 0 ? t('w_expires') + ' ' + left + ' ' + t('w_secs') : t('w_expired'); return left; };
    function paint() {
      out.replaceChildren();
      if (ex) { avail.replaceChildren(t('w_availBal') + ': ', ltr(money(DB.balances[from], from))); }
      if (!amt.value.trim()) { out.append(el('p', t('w_calcHint'), 'muted')); return; }
      const q = W.quote(from, to, amt.value, { balances: ex ? DB.balances : null });
      if (q.net === undefined) { out.append(errP(q)); return; }
      const dl = el('dl', undefined, 'wdl');
      dlAdd(dl, t('w_rate'), rateText(from, to, q.rate));
      dlAdd(dl, t('w_gross'), ltr(money(q.gross, to)));
      dlAdd(dl, t('w_fee'), ltr(money(q.fee, to) + ' (' + q.feePct + '%)'));
      const net = el('strong', undefined, 'wnet'); net.append(ltr(money(q.net, to))); dlAdd(dl, t('w_receive'), net);
      out.append(dl);
      if (q.error) out.append(errP(q));
      if (ex && expired) out.append(el('p', t('w_expired'), 'err', { role: 'alert' }));
    }
    const reset = () => { exp = Date.now() + ttl * 1000; expired = false; refresh.hidden = true; if (ex) tickText(); paint(); };
    sf.onchange = () => { const prev = from; from = sf.value; if (from === to) { to = prev; st.value = to; } reset(); };
    st.onchange = () => { const prev = to; to = st.value; if (from === to) { from = prev; sf.value = from; } reset(); };
    swap.onclick = () => { [from, to] = [to, from]; sf.value = from; st.value = to; reset(); };
    amt.oninput = reset; refresh.onclick = reset;
    if (ex) {
      tickText();
      const id = setInterval(() => {
        if (!box.isConnected) { clearInterval(id); return; }
        const left = tickText(), was = expired; expired = left === 0; refresh.hidden = !expired; if (expired !== was) paint();
      }, 1000);
      timers.push(id);
    }
    paint();
    return box;
  }

  // ---------- Fund tab ----------
  function fundPanel(ctx) {
    const pane = el('div');
    let dep = 'IQD', credit = 'IQD', method = 'support', busy = false;
    const cta = el('section', undefined, 'wsupport'), ctaBtn = el('button', undefined, 'cta wa'); ctaBtn.type = 'button'; ctaBtn.append(chatIcon(), el('span', t('w_fundSupport')));
    cta.append(ctaBtn, el('p', t('w_fundSupportDesc'), 'muted'));
    const form = el('form', undefined, 'panel wform'); form.noValidate = true;
    const sd = curSelect('wf-dep', CODES, dep), sc = el('select'); sc.id = 'wf-credit';
    const amt = el('input', undefined, undefined, { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '150000' }); amt.id = 'wf-amt';
    const methods = el('div', undefined, 'wpms', { role: 'group', 'aria-label': t('w_payMethod') });
    const prev = el('div', undefined, 'wout', { 'aria-live': 'polite' }), err = el('div', undefined, undefined, { 'aria-live': 'assertive' }), done = el('div', undefined, undefined, { 'aria-live': 'polite' });
    const submit = el('button', t('w_submitReq'), 'cta'); submit.type = 'submit';
    const fields = el('div', undefined, 'fields'); fields.append(field('wf-dep', t('w_depCur'), sd), field('wf-amt', t('w_depAmt'), amt), field('wf-credit', t('w_creditCur'), sc));
    const lab = el('label', t('w_payMethod'));
    form.append(el('h2', t('w_fundTitle')), fields, lab, methods, el('p', t('w_pmNote'), 'muted'), prev, err, submit);

    const fillCredit = () => { const al = W.FUNDING_CREDIT[dep]; sc.replaceChildren(); al.forEach(c => { const o = el('option', c + ' — ' + t('w_cur_' + c)); o.value = c; sc.append(o); }); if (!al.includes(credit)) credit = al[0]; sc.value = credit; };
    const stLabel = s => t(s === 'available' ? 'w_avail' : s === 'not_connected' ? 'w_notConnected' : 'w_comingSoon');
    const fillMethods = () => {
      methods.replaceChildren();
      W.PAYMENT_METHODS[dep].forEach(([id, status]) => {
        const b = el('button', undefined, 'wpm'); b.type = 'button'; b.disabled = status !== 'available'; b.setAttribute('aria-pressed', String(id === method));
        b.append(el('span', t('w_pm_' + id)), el('small', stLabel(status), 'wpmst wpmst-' + status));
        b.onclick = () => { method = id; fillMethods(); };
        methods.append(b);
      });
    };
    function paintPrev() {
      prev.replaceChildren(); err.replaceChildren();
      if (!amt.value.trim()) return;
      const q = W.fundingQuote(dep, credit, amt.value);
      if (q.net === undefined) { prev.append(errP(q)); return; }
      prev.append(el('h3', t('w_prevTitle'), 'wh3'));
      const dl = el('dl', undefined, 'wdl');
      dlAdd(dl, t('w_rate'), rateText(dep, credit, q.rate)); dlAdd(dl, t('w_gross'), ltr(money(q.gross, credit)));
      dlAdd(dl, t('w_fee'), ltr(money(q.fee, credit) + ' (' + q.feePct + '%)'));
      const net = el('strong', undefined, 'wnet'); net.append(ltr(money(q.net, credit))); dlAdd(dl, t('w_credit'), net);
      prev.append(dl, el('p', t('w_estNote'), 'muted'));
      if (q.error) prev.append(errP(q));
    }
    sd.onchange = () => { dep = sd.value; method = 'support'; fillCredit(); fillMethods(); paintPrev(); };
    sc.onchange = () => { credit = sc.value; paintPrev(); };
    amt.oninput = paintPrev;
    ctaBtn.onclick = () => { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); amt.focus({ preventScroll: true }); };

    form.onsubmit = e => {
      e.preventDefault(); if (busy) return; err.replaceChildren();
      if (method !== 'support' || W.PAYMENT_METHODS[dep].find(m => m[0] === method)[1] !== 'available') { err.append(el('p', t('w_err_method'), 'err', { role: 'alert' })); return; }
      const q = W.fundingQuote(dep, credit, amt.value);
      if (!q.ok) { err.append(errP(q)); return; }
      busy = true; submit.disabled = true; setTimeout(() => { busy = false; submit.disabled = false; }, 2000);
      const tx = { id: W.makeFundRef(DB.txs.map(x => x.id)), customerId: W.DEMO_CUSTOMER, type: 'funding', status: 'pending', fromCur: dep, amount: q.amount, toCur: credit, rate: q.rate, fee: q.fee, final: q.net, method: 'support', at: W.nowLocal(), isDemo: true };
      DB.txs.unshift(tx); // Request only. The wallet balance is NOT changed.
      const url = W.whatsAppUrl(W.fundMessage(tx));
      done.replaceChildren();
      const box = el('section', undefined, 'panel wdone'), dl = el('dl', undefined, 'wdl');
      dlAdd(dl, t('w_reqRef'), ltr(tx.id)); dlAdd(dl, t('w_fStatus'), statusBadge('pending')); dlAdd(dl, t('w_pendVerif'), ltr(money(tx.amount, dep) + ' → ' + money(tx.final, credit)));
      const a = el('a', t('w_openWa'), 'cta wa'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.prepend(chatIcon());
      box.append(el('h2', t('w_reqDone')), dl, a, el('p', t('w_noCredit'), 'note warn'), el('p', t('w_receiptSoon'), 'muted'), el('p', t('w_noSecrets'), 'muted'));
      done.append(box); amt.value = ''; prev.replaceChildren();
      window.open(url, '_blank', 'noopener');
      ctx.repaint();
    };
    fillCredit(); fillMethods();
    const pendBox = el('div'); const paintPend = () => { pendBox.replaceChildren(el('h2', t('w_reqList'))); const items = DB.txs.filter(W.isPending); if (!items.length) pendBox.append(el('p', t('w_noPending'), 'muted empty')); items.forEach(x => pendBox.append(txCard(x))); };
    ctx.reg(paintPend); paintPend();
    pane.append(cta, form, done, pendBox);
    return pane;
  }

  // ---------- Rates tab ----------
  function ratesPanel(ctx) {
    const pane = el('div'), r = W.getRates();
    const box = el('section', undefined, 'panel');
    box.append(el('h2', t('w_ratesTitle')), el('p', t('w_ratesNote'), 'note'));
    [['USD', 'IQD', 'w_modeDirect'], ['USD', 'IRT', 'w_modeDirect'], ['IQD', 'IRT', 'w_modeVia']].forEach(([a, b, m]) => {
      const L = W.rateLine(a, b, r), row = el('div', undefined, 'wrate'); row.append(el('strong', a + '/' + b), ltr(new Intl.NumberFormat(loc()).format(L.base) + ' ' + a + ' = ' + fmtRate(L.value) + ' ' + b), el('small', t(m) + ' · ' + t('w_example'), 'muted')); box.append(row);
    });
    const dl = el('dl', undefined, 'wdl');
    dlAdd(dl, t('w_commission'), ltr(r.feePct + '%'));
    dlAdd(dl, t('w_limits'), ltr(money(r.minUSD, 'USD') + ' – ' + money(r.maxUSD, 'USD')));
    box.append(dl, el('p', t('w_tomanNote'), 'muted'));
    pane.append(box, converter({ mode: 'calc', id: 'wc', from: 'IQD', to: 'USD', amount: '150000' }, ctx.timers));
    return pane;
  }

  // ---------- History tab ----------
  function histPanel(ctx) {
    const pane = el('div'), F = { from: '', to: '', currency: '', type: '', status: '' };
    const box = el('section', undefined, 'panel wfilters');
    const d1 = el('input', undefined, undefined, { type: 'date' }), d2 = el('input', undefined, undefined, { type: 'date' }); d1.id = 'wh-d1'; d2.id = 'wh-d2';
    const all = [['', t('w_all')]];
    const sc = optSelect('wh-cur', all.concat(CODES.map(c => [c, c])), ''), sty = optSelect('wh-type', all.concat(W.TYPES.map(x => [x, t('w_ty_' + x)])), ''), sst = optSelect('wh-st', all.concat(W.STATUSES.map(x => [x, t('w_stt_' + x)])), '');
    const reset = el('button', t('w_reset'), 'ghost2'); reset.type = 'button';
    box.append(field('wh-d1', t('w_fDateFrom'), d1), field('wh-d2', t('w_fDateTo'), d2), field('wh-cur', t('w_fCurrency'), sc), field('wh-type', t('w_fType'), sty), field('wh-st', t('w_fStatus'), sst), reset);
    const count = el('p', undefined, 'muted', { 'aria-live': 'polite' }), list = el('div', undefined, 'list');
    const paint = () => {
      const items = W.filterTx(DB.txs, F).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      count.textContent = items.length + ' ' + t('w_results'); list.replaceChildren();
      if (!items.length) list.append(el('p', t('w_noTx'), 'muted empty'));
      items.forEach(x => list.append(txCard(x)));
    };
    const bind = (n, k) => { n.onchange = () => { F[k] = n.value; paint(); }; };
    bind(d1, 'from'); bind(d2, 'to'); bind(sc, 'currency'); bind(sty, 'type'); bind(sst, 'status');
    reset.onclick = () => { Object.keys(F).forEach(k => { F[k] = ''; }); [d1, d2, sc, sty, sst].forEach(n => { n.value = ''; }); paint(); };
    ctx.reg(paint); paint();
    pane.append(el('h2', t('w_histTitle')), el('p', t('w_histNote'), 'note'), box, count, list);
    return pane;
  }

  function run(root) {
    const timers = [], repaints = [], ctx = { timers, reg: f => repaints.push(f), repaint: () => repaints.forEach(f => f()) };
    const balBox = el('div'); const paintBal = () => balBox.replaceChildren(balances()); ctx.reg(paintBal); paintBal();
    root.append(el('p', t('w_demoBanner'), 'note warn'), el('p', t('w_indep'), 'muted'), balBox);
    const tabs = [['fund', 'w_tabFund', fundPanel], ['exchange', 'w_tabExchange', c => converter({ mode: 'exchange', id: 'we', from: 'USD', to: 'IQD', amount: '' }, c.timers)], ['rates', 'w_tabRates', ratesPanel], ['history', 'w_tabHistory', histPanel]];
    const bar = el('div', undefined, 'wtabs', { role: 'tablist', 'aria-label': t('w_tabsLabel') }), panes = el('div'), btns = {}, pn = {};
    const show = id => tabs.forEach(([i]) => { const on = i === id; btns[i].setAttribute('aria-selected', String(on)); btns[i].tabIndex = on ? 0 : -1; pn[i].hidden = !on; });
    tabs.forEach(([id, k, fn]) => {
      const b = el('button', t(k), 'wtab', { role: 'tab', id: 'wtab-' + id, 'aria-controls': 'wpane-' + id }); b.type = 'button'; b.onclick = () => show(id);
      b.onkeydown = e => { const ids = tabs.map(x => x[0]), n = ids.indexOf(id), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); const rtl = LANGS[S.lang].dir === 'rtl', nx = ids[(n + (rtl ? -d : d) + ids.length) % ids.length]; show(nx); btns[nx].focus(); };
      const p = el('div', undefined, 'wpane', { role: 'tabpanel', id: 'wpane-' + id, 'aria-labelledby': 'wtab-' + id }); p.append(fn(ctx));
      btns[id] = b; pn[id] = p; bar.append(b); panes.append(p);
    });
    show('fund');
    const sup = el('section', undefined, 'panel wsup'), wa = el('a', undefined, 'cta wa'); wa.href = W.whatsAppUrl(); wa.target = '_blank'; wa.rel = 'noopener noreferrer'; wa.append(chatIcon(), el('span', t('w_chat')));
    const tk = el('a', t('w_ticket'), 'ghost2 wtk'); tk.href = '#/profile';
    sup.append(el('h2', t('w_supportTitle')), el('p', t('w_supportNote'), 'muted'), ltr(W.SUPPORT_DISPLAY), wa, tk);
    root.append(bar, panes, sup);
    return () => { timers.forEach(clearInterval); };
  }
  window.Wallet = { run, DB };
})();
