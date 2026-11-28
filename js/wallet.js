'use strict';
// Wallet UI, Stage 2: exchange rates, commissions and limits come from the backend (set by the administrator).
// Still PREVIEW ONLY: nothing here credits a wallet, converts money or contacts a payment provider.
// Balances/transactions are demo examples held in memory (never localStorage). Requires UI (ui.js) and MIW (wallet-core.js).
(function () {
  const { t, el, fmtDate, S, LANGS } = UI;
  const W = window.MIW;
  const CODES = W.CODES;
  const DB = { txs: W.demoTransactions(), balances: W.DEMO_BALANCES };
  // Backend address. Same origin when the page is served by Render itself; otherwise the Render URL (already allowed by the page CSP).
  const API = window.MI_API_BASE !== undefined ? window.MI_API_BASE : (/onrender\.com$/.test(location.hostname) ? '' : 'https://miri-iran-v6.onrender.com');
  const RS = { status: 'loading', R: null, fetchedAt: 0 }; // shared rate state. There is NO fallback rate: no valid rate = conversion disabled.
  const getR = () => (W.rateUsable(RS.R) ? RS.R : null);

  // Non-blocking: the wallet renders first; rates arrive later. Long timeout + retry because Render Free may need up to a minute to wake up.
  // Identical requests share one network call (Api.get de-duplicates). A rate is NEVER reused after its own expiry (getR checks the deadline).
  async function loadRates(done, force) {
    if (!force && RS.status === 'ok' && W.rateUsable(RS.R) && Date.now() - RS.fetchedAt < 30000) { done(); return; }
    const r = await Api.get('/api/wallet/rates', { timeout: 30000, retries: 1, onSlow: on => { RS.waking = on; done(); } });
    const j = r.data;
    if (r.ok && j && j.status === 'ok') { RS.R = W.fromApi(j, Date.now()); RS.status = RS.R ? 'ok' : 'invalid'; }
    else if (r.ok && j && (j.status === 'expired' || j.status === 'unavailable')) { RS.R = null; RS.status = j.status; }
    else { RS.status = W.rateUsable(RS.R) ? 'ok' : 'error'; if (!W.rateUsable(RS.R)) RS.R = null; } // a transient failure never extends an old rate past its expiry
    RS.waking = false; RS.fetchedAt = Date.now(); done();
  }

  const loc = () => LANGS[S.lang].loc;
  const fmt = (n, c) => { const d = W.CUR[c].dec; return new Intl.NumberFormat(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n); };
  const money = (n, c) => fmt(n, c) + ' ' + c;
  const nf = (n, o) => new Intl.NumberFormat(loc(), o).format(n);
  const fmtRate = r => nf(r, { maximumSignificantDigits: 6 });
  const ltr = txt => el('bdi', txt, 'wltr', { dir: 'ltr' });
  const NS = 'http://www.w3.org/2000/svg';
  const chatIcon = () => { const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', 'M4 5h16v11H9l-5 4z'); s.append(p); return s; };
  const field = (id, label, ctrl) => { const d = el('div', undefined, 'field'), l = el('label', label); l.htmlFor = id; d.append(l, ctrl); return d; };
  const curSelect = (id, list, value) => { const s = el('select'); s.id = id; list.forEach(c => { const o = el('option', c + ' — ' + t('w_cur_' + c)); o.value = c; s.append(o); }); s.value = value; return s; };
  const optSelect = (id, pairs, value) => { const s = el('select'); s.id = id; pairs.forEach(([v, l]) => { const o = el('option', l); o.value = v; s.append(o); }); s.value = value; return s; };
  const errP = q => { const p = el('p', t('w_err_' + q.error) + ' ', 'err', { role: 'alert' }); if (q.limit !== undefined) p.append(ltr(money(q.limit, q.from))); return p; };
  const dlAdd = (dl, k, v) => { const dd = el('dd'); dd.append(v); dl.append(el('dt', k), dd); };
  // "1 USD" style line using the rate actually applied. USD pairs are shown per 100 USD, as the administrator enters them.
  const rateText = (from, to, r) => { const x = W.scaleRate(r); return ltr(nf(x.base) + ' ' + from + ' = ' + fmtRate(x.value) + ' ' + to); };
  const pairText = (from, to, R) => { const r = W.pairRate(from, to, R); if (from === 'USD') return ltr('100 USD = ' + fmtRate(r * 100) + ' ' + to); if (to === 'USD') return ltr(fmtRate(100 / r) + ' ' + from + ' = 100 USD'); return rateText(from, to, r); };
  const feeText = (pct, amt, c) => ltr(money(amt, c) + ' (' + nf(pct) + '%)');

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
  function converter(o, ctx) {
    const ex = o.mode === 'exchange';
    const box = el('section', undefined, 'panel wconv');
    let from = o.from, to = o.to, exp = 0, expired = false;
    const ttlMs = () => { const R = getR(); return R ? Math.min(R.quoteTtlSec * 1000, Math.max(0, R.deadline - Date.now())) : 0; };
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
      if (ex) avail.replaceChildren(t('w_availBal') + ': ', ltr(money(DB.balances[from], from)));
      if (!getR()) { out.append(errP({ error: 'noRate' })); return; }
      if (!amt.value.trim()) { out.append(el('p', t('w_calcHint'), 'muted')); return; }
      const q = W.quote(from, to, amt.value, { rates: getR(), balances: ex ? DB.balances : null });
      if (q.net === undefined) { out.append(errP(q)); return; }
      const dl = el('dl', undefined, 'wdl');
      dlAdd(dl, t('w_rate'), rateText(from, to, q.rate)); dlAdd(dl, t('w_gross'), ltr(money(q.gross, to)));
      dlAdd(dl, t('w_xfee'), feeText(q.exchangePct, q.exchangeFee, to));
      const net = el('strong', undefined, 'wnet'); net.append(ltr(money(q.net, to))); dlAdd(dl, t('w_receive'), net);
      out.append(dl);
      if (q.error) out.append(errP(q));
      if (ex && expired) out.append(el('p', t('w_expired'), 'err', { role: 'alert' }));
    }
    const reset = () => { exp = Date.now() + ttlMs(); expired = false; refresh.hidden = true; if (ex) tickText(); paint(); };
    sf.onchange = () => { const prev = from; from = sf.value; if (from === to) { to = prev; st.value = to; } reset(); };
    st.onchange = () => { const prev = to; to = st.value; if (from === to) { from = prev; sf.value = from; } reset(); };
    swap.onclick = () => { [from, to] = [to, from]; sf.value = from; st.value = to; reset(); };
    amt.oninput = reset; refresh.onclick = () => loadRates(() => ctx.rates(), true);
    ctx.sub(reset); // rates changed (loaded, refreshed or expired): new quote
    if (ex) {
      const id = setInterval(() => {
        if (!box.isConnected) { clearInterval(id); return; }
        const left = tickText(), was = expired; expired = left === 0; refresh.hidden = !expired; if (expired !== was) paint();
      }, 1000);
      ctx.timers.push(id);
    }
    reset();
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
    form.append(el('h2', t('w_fundTitle')), fields, el('label', t('w_payMethod')), methods, el('p', t('w_pmNote'), 'muted'), prev, err, submit);

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
      if (!getR()) { prev.append(errP({ error: 'noRate' })); return; }
      if (!amt.value.trim()) return;
      const q = W.fundingQuote(dep, credit, amt.value, { rates: getR() });
      if (q.net === undefined) { prev.append(errP(q)); return; }
      prev.append(el('h3', t('w_prevTitle'), 'wh3'));
      const dl = el('dl', undefined, 'wdl');
      dlAdd(dl, t('w_rate'), rateText(dep, credit, q.rate)); dlAdd(dl, t('w_gross'), ltr(money(q.gross, credit)));
      dlAdd(dl, t('w_ffee'), feeText(q.fundingPct, q.fundingFee, credit));
      if (dep !== credit) dlAdd(dl, t('w_xfee'), feeText(q.exchangePct, q.exchangeFee, credit));
      const net = el('strong', undefined, 'wnet'); net.append(ltr(money(q.net, credit))); dlAdd(dl, t('w_credit'), net);
      prev.append(dl, el('p', t('w_estNote'), 'muted'));
      if (q.error) prev.append(errP(q));
    }
    sd.onchange = () => { dep = sd.value; method = 'support'; fillCredit(); fillMethods(); paintPrev(); };
    sc.onchange = () => { credit = sc.value; paintPrev(); };
    amt.oninput = paintPrev; ctx.sub(paintPrev);
    ctaBtn.onclick = () => { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); amt.focus({ preventScroll: true }); };

    form.onsubmit = e => {
      e.preventDefault(); if (busy) return; err.replaceChildren();
      if (method !== 'support' || W.PAYMENT_METHODS[dep].find(m => m[0] === method)[1] !== 'available') { err.append(el('p', t('w_err_method'), 'err', { role: 'alert' })); return; }
      const q = W.fundingQuote(dep, credit, amt.value, { rates: getR() }); // no valid rate => not ok => request cannot be created
      if (!q.ok) { err.append(errP(q)); return; }
      busy = true; submit.disabled = true; setTimeout(() => { busy = false; submit.disabled = false; }, 2000);
      const d = new Date();
      const tx = { id: W.makeFundRef(DB.txs.map(x => x.id), d), customerId: W.DEMO_CUSTOMER, type: 'funding', status: 'pending', fromCur: dep, amount: q.amount, toCur: credit, rate: q.rate, fee: q.fee, final: q.net, method: 'support', at: W.nowLocal(d), tz: W.tzLabel(d),
        fundingPct: q.fundingPct, fundingFee: q.fundingFee, exchangePct: q.exchangePct, exchangeFee: q.exchangeFee, rateVersion: getR().version, isDemo: true };
      DB.txs.unshift(tx); // Request only. The wallet balance is NOT changed.
      const url = W.whatsAppUrl(W.fundMessage(tx, S.lang)); // message language follows the site language
      done.replaceChildren();
      const box = el('section', undefined, 'panel wdone'), dl = el('dl', undefined, 'wdl');
      dlAdd(dl, t('w_reqRef'), ltr(tx.id)); dlAdd(dl, t('w_fStatus'), statusBadge('pending')); dlAdd(dl, t('w_pendVerif'), ltr(money(tx.amount, dep) + ' → ' + money(tx.final, credit)));
      const a = el('a', t('w_openWa'), 'cta wa'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.prepend(chatIcon());
      box.append(el('h2', t('w_reqDone')), dl, a, el('p', t('w_noCredit'), 'note warn'), el('p', t('w_receiptSoon'), 'muted'), el('p', t('w_noSecrets'), 'muted'));
      done.append(box); amt.value = ''; prev.replaceChildren();
      window.open(url, '_blank', 'noopener');
      ctx.repaint();
    };
    fillCredit(); fillMethods(); paintPrev();
    const pendBox = el('div'); const paintPend = () => { pendBox.replaceChildren(el('h2', t('w_reqList'))); const items = DB.txs.filter(W.isPending); if (!items.length) pendBox.append(el('p', t('w_noPending'), 'muted empty')); items.forEach(x => pendBox.append(txCard(x))); };
    ctx.reg(paintPend); paintPend();
    pane.append(cta, form, done, pendBox);
    return pane;
  }

  // ---------- Rates tab ----------
  function ratesPanel(ctx) {
    const pane = el('div'), box = el('section', undefined, 'panel');
    const paint = () => {
      box.replaceChildren(el('h2', t('w_ratesTitle')), el('p', t('w_ratesNote'), 'note')); const R = getR();
      if (R) {
        box.append(el('h3', t('w_pairs'), 'wh3'));
        W.derivedTable(R).forEach(x => { const row = el('div', undefined, 'wrate'); row.append(el('strong', undefined, undefined).appendChild(ltr(x.from + ' → ' + x.to)).parentNode, pairText(x.from, x.to, R)); box.append(row); });
        const dl = el('dl', undefined, 'wdl');
        dlAdd(dl, t('w_updated'), fmtDate(R.updatedAt)); dlAdd(dl, t('w_validUntil'), fmtDate(R.validUntil));
        dlAdd(dl, t('w_ffee'), ltr(nf(R.fees.fundingPct) + '%')); dlAdd(dl, t('w_xfee'), ltr(nf(R.fees.exchangePct) + '%'));
        dlAdd(dl, t('w_limits'), ltr(money(R.limits.minUSD, 'USD') + ' – ' + money(R.limits.maxUSD, 'USD')));
        box.append(dl);
      }
      box.append(el('p', t('w_tomanNote'), 'muted'));
    };
    ctx.sub(paint); paint();
    pane.append(box, converter({ mode: 'calc', id: 'wc', from: 'IQD', to: 'USD', amount: '150000' }, ctx));
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
    const timers = [], repaints = [], subs = [];
    const ctx = { timers, reg: f => repaints.push(f), repaint: () => repaints.forEach(f => f()), sub: f => subs.push(f) };
    const bar = el('div', undefined, 'wratebar');
    const paintBar = () => {
      bar.replaceChildren();
      if (RS.status === 'ok' && getR()) return;
      if (RS.status === 'loading') { bar.append(el('p', t(RS.waking ? 'w_rt_waking' : 'w_rt_loading'), 'muted', { role: 'status' })); return; }
      const key = RS.status === 'ok' ? 'expired' : RS.status; // a rate that ran out of time is "expired"
      const p = el('p', t('w_rt_' + key) + ' ', 'note warn', { role: 'alert' }), b = el('button', t('w_retry'), 'ghost2'); b.type = 'button';
      b.onclick = () => { RS.status = 'loading'; paintBar(); loadRates(onRates, true); };
      p.append(b); bar.append(p);
    };
    const onRates = () => { paintBar(); subs.forEach(f => f()); };
    const balBox = el('div'); const paintBal = () => balBox.replaceChildren(balances()); ctx.reg(paintBal); paintBal();
    ctx.rates = onRates;
    root.append(el('p', t('w_demoBanner'), 'note warn'), el('p', t('w_indep'), 'muted'), bar, balBox);
    const tabs = [['fund', 'w_tabFund', fundPanel], ['exchange', 'w_tabExchange', c => converter({ mode: 'exchange', id: 'we', from: 'USD', to: 'IQD', amount: '' }, c)], ['rates', 'w_tabRates', ratesPanel], ['history', 'w_tabHistory', histPanel]];
    const tabBar = el('div', undefined, 'wtabs', { role: 'tablist', 'aria-label': t('w_tabsLabel') }), panes = el('div'), btns = {}, pn = {};
    const show = id => tabs.forEach(([i]) => { const on = i === id; btns[i].setAttribute('aria-selected', String(on)); btns[i].tabIndex = on ? 0 : -1; pn[i].hidden = !on; });
    tabs.forEach(([id, k, fn]) => {
      const b = el('button', t(k), 'wtab', { role: 'tab', id: 'wtab-' + id, 'aria-controls': 'wpane-' + id }); b.type = 'button'; b.onclick = () => show(id);
      b.onkeydown = e => { const ids = tabs.map(x => x[0]), n = ids.indexOf(id), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); const rtl = LANGS[S.lang].dir === 'rtl', nx = ids[(n + (rtl ? -d : d) + ids.length) % ids.length]; show(nx); btns[nx].focus(); };
      const p = el('div', undefined, 'wpane', { role: 'tabpanel', id: 'wpane-' + id, 'aria-labelledby': 'wtab-' + id }); p.append(fn(ctx));
      btns[id] = b; pn[id] = p; tabBar.append(b); panes.append(p);
    });
    show('fund');
    const sup = el('section', undefined, 'panel wsup'), wa = el('a', undefined, 'cta wa'); wa.href = W.whatsAppUrl(); wa.target = '_blank'; wa.rel = 'noopener noreferrer'; wa.append(chatIcon(), el('span', t('w_chat')));
    const tk = el('a', t('w_ticket'), 'ghost2 wtk'); tk.href = '#/profile';
    sup.append(el('h2', t('w_supportTitle')), el('p', t('w_supportNote'), 'muted'), ltr(W.SUPPORT_DISPLAY), wa, tk);
    root.append(tabBar, panes, sup);
    paintBar();
    loadRates(onRates, false);
    timers.push(setInterval(() => { if (!root.isConnected) return; loadRates(onRates, true); }, 60000)); // pick up new admin rates within a minute
    return () => { timers.forEach(clearInterval); };
  }
  window.Wallet = { run, DB, RS };
})();
