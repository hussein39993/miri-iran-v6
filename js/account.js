'use strict';
// Customer account UI (Stage 3A, sandbox): sign in, register, e-mail activation, password recovery, profile.
// The server is the only authority: this file never decides who is allowed to do what, and never stores passwords.
// All text is inserted with textContent (no innerHTML). Pages render immediately; network calls never block the interface.
(function () {
  const { t, el, S, fmtDate } = UI;
  const KEY = k => (t(k) === k ? null : t(k));
  const errText = e => KEY('a_e_' + (e && e.code)) || t('a_e_generic');
  const fieldText = c => KEY('a_f_' + c) || t('a_f_invalid');

  function field(id, label, ctrl, hint) { const d = el('div', undefined, 'field'), l = el('label', label); l.htmlFor = id; d.append(l, ctrl); if (hint) d.append(el('small', hint, 'muted')); const e = el('small', '', 'err', { id: id + '-err', role: 'alert' }); d.append(e); d._err = e; return d; }
  const input = (id, type, auto, extra) => { const i = el('input', undefined, undefined, { id, type, autocomplete: auto, ...(extra || {}) }); return i; };
  const langSelect = id => { const s = el('select'); s.id = id; [['ar', 'العربية'], ['fa', 'فارسی'], ['en', 'English']].forEach(([v, l]) => { const o = el('option', l); o.value = v; s.append(o); }); s.value = S.lang; return s; };
  const statusBadge = s => el('span', t('a_st_' + s), 'wst acct-st-' + s);

  // Runs fn while the button is disabled; shows the "server is waking up" note if the request is slow.
  function makeCall(wakeEl) {
    return { onSlow: on => { wakeEl.textContent = on ? t('a_waking') : ''; } };
  }
  function showFieldErrors(fields, map, out) {
    Object.values(map).forEach(f => { f._err.textContent = ''; });
    let any = false;
    Object.entries(fields || {}).forEach(([k, c]) => { if (map[k]) { map[k]._err.textContent = fieldText(c); any = true; } });
    if (!any && fields && fields.form) out.textContent = fieldText(fields.form);
    return any;
  }

  function mount(root) {
    const box = el('section', undefined, 'acct'), body = el('div'); box.append(el('p', t('a_sandbox'), 'note'), body); root.append(box);
    const onEnd = () => { if (!box.isConnected) { window.removeEventListener('mi-session-ended', onEnd); return; } showAuth('login'); };
    window.addEventListener('mi-session-ended', onEnd);

    function status(msg, cls) { return el('p', msg, cls || 'muted', { role: 'status' }); }

    function showAuth(tab, notice) {
      body.replaceChildren();
      const bar = el('div', undefined, 'wtabs', { role: 'tablist' });
      [['login', 'a_login'], ['register', 'a_register']].forEach(([id, k]) => { const b = el('button', t(k), 'wtab', { role: 'tab', 'aria-selected': String(id === tab) }); b.type = 'button'; b.onclick = () => showAuth(id); bar.append(b); });
      body.append(bar); if (notice) body.append(status(notice, 'note positive'));
      body.append(tab === 'register' ? registerForm() : tab === 'forgot' ? forgotForm() : loginForm());
    }

    function loginForm() {
      const f = el('form', undefined, 'panel'), email = input('ac-email', 'email', 'username', { required: 'true' }), pw = input('ac-pw', 'password', 'current-password', { required: 'true' });
      const out = el('p', '', 'err', { role: 'alert' }), wake = el('p', '', 'muted', { 'aria-live': 'polite' }), go = el('button', t('a_submitLogin'), 'cta'); go.type = 'submit';
      const extra = el('div'), fg = el('a', t('a_forgot'), 'muted'); fg.href = '#/profile'; fg.onclick = e => { e.preventDefault(); showAuth('forgot'); };
      f.append(el('h2', t('a_login')), field('ac-email', t('a_email'), email), field('ac-pw', t('a_password'), pw), out, wake, go, extra, el('p', undefined, 'muted'));
      f.lastChild.append(fg);
      f.onsubmit = async e => {
        e.preventDefault(); out.textContent = ''; extra.replaceChildren(); go.disabled = true;
        const r = await Api.post('/api/auth/login', { email: email.value, password: pw.value }, makeCall(wake)); go.disabled = false;
        if (r.ok) { Api.token.set(r.data.token); pw.value = ''; showProfile(r.data.customer); return; }
        out.textContent = errText(r.error);
        if (r.error.code === 'EMAIL_NOT_VERIFIED') { const rs = el('button', t('a_resend'), 'ghost2'); rs.type = 'button'; rs.onclick = async () => { rs.disabled = true; const x = await Api.post('/api/auth/resend-verification', { email: email.value }, makeCall(wake)); extra.replaceChildren(status(x.ok ? t('a_resendDone') : errText(x.error), x.ok ? 'note positive' : 'err')); }; extra.append(rs); }
      };
      return f;
    }

    function registerForm() {
      const f = el('form', undefined, 'panel'), name = input('ar-name', 'text', 'name', { required: 'true', maxlength: '100' }), email = input('ar-email', 'email', 'username', { required: 'true' }), phone = input('ar-phone', 'tel', 'tel', { inputmode: 'tel' });
      const pw = input('ar-pw', 'password', 'new-password', { required: 'true' }), pw2 = input('ar-pw2', 'password', 'new-password', { required: 'true' }), lang = langSelect('ar-lang');
      const map = { fullName: field('ar-name', t('a_fullName'), name), email: field('ar-email', t('a_email'), email), phone: field('ar-phone', t('a_phone'), phone), password: field('ar-pw', t('a_password'), pw, t('a_pwHint')), pw2: field('ar-pw2', t('a_password2'), pw2), lang: field('ar-lang', t('a_lang'), lang) };
      const out = el('p', '', 'err', { role: 'alert' }), wake = el('p', '', 'muted', { 'aria-live': 'polite' }), go = el('button', t('a_submitRegister'), 'cta'); go.type = 'submit';
      f.append(el('h2', t('a_register')), ...Object.values(map), out, wake, go);
      f.onsubmit = async e => {
        e.preventDefault(); out.textContent = ''; showFieldErrors({}, map, out);
        if (pw.value !== pw2.value) { map.pw2._err.textContent = fieldText('mismatch'); return; }
        go.disabled = true;
        const r = await Api.post('/api/auth/register', { fullName: name.value, email: email.value, phone: phone.value, password: pw.value, lang: lang.value }, makeCall(wake)); go.disabled = false;
        if (r.ok) { showAuth('login', t('a_regDone')); return; }
        if (r.error.code === 'VALIDATION' && showFieldErrors(r.error.fields, map, out)) return;
        out.textContent = errText(r.error);
      };
      return f;
    }

    function forgotForm() {
      const f = el('form', undefined, 'panel'), email = input('af-email', 'email', 'username', { required: 'true' }), out = el('p', '', 'err', { role: 'alert' }), wake = el('p', '', 'muted', { 'aria-live': 'polite' }), go = el('button', t('a_submitForgot'), 'cta'); go.type = 'submit';
      const back = el('button', t('a_login'), 'ghost2'); back.type = 'button'; back.onclick = () => showAuth('login');
      f.append(el('h2', t('a_forgot')), field('af-email', t('a_email'), email), out, wake, go, back);
      f.onsubmit = async e => { e.preventDefault(); out.textContent = ''; go.disabled = true; const r = await Api.post('/api/auth/forgot-password', { email: email.value }, makeCall(wake)); go.disabled = false; if (r.ok) { out.className = 'positive'; out.textContent = t('a_forgotDone'); } else { out.className = 'err'; out.textContent = errText(r.error); } };
      return f;
    }

    function showProfile(c) {
      body.replaceChildren();
      const card = el('section', undefined, 'panel'), dl = el('dl', undefined, 'wdl'), add = (k, v) => { const dd = el('dd'); dd.append(v); dl.append(el('dt', k), dd); };
      const id = el('bdi', c.customerNo, 'wltr', { dir: 'ltr' }), em = el('bdi', c.email, 'wltr', { dir: 'ltr' });
      add(t('a_custNo'), id); add(t('a_email'), em); add('', el('span', c.emailVerified ? '✔ ' + t('a_verified') : '! ' + t('a_notVerified'), 'wst ' + (c.emailVerified ? 'wst-completed' : 'wst-pending')));
      add(t('a_status'), statusBadge(c.status)); add(t('a_member'), document.createTextNode(fmtDate(c.createdAt))); if (c.lastLoginAt) add(t('a_lastLogin'), document.createTextNode(fmtDate(c.lastLoginAt)));
      card.append(el('h2', c.fullName), dl); body.append(card);
      if (c.status === 'restricted') body.append(el('p', t('a_restrictedNote'), 'note warn'));

      const f = el('form', undefined, 'panel'), name = input('ap-name', 'text', 'name', { maxlength: '100' }), phone = input('ap-phone', 'tel', 'tel', { inputmode: 'tel' }), lang = langSelect('ap-lang'); name.value = c.fullName; phone.value = c.phone || ''; lang.value = c.preferredLang;
      const map = { fullName: field('ap-name', t('a_fullName'), name), phone: field('ap-phone', t('a_phone'), phone), lang: field('ap-lang', t('a_lang'), lang) };
      const out = el('p', '', 'positive', { role: 'status' }), wake = el('p', '', 'muted', { 'aria-live': 'polite' }), save = el('button', t('a_save'), 'cta'); save.type = 'submit';
      f.append(...Object.values(map), out, wake, save);
      f.onsubmit = async e => { e.preventDefault(); out.textContent = ''; out.className = 'err'; showFieldErrors({}, map, out); save.disabled = true; const r = await Api.post('/api/me/update', { fullName: name.value, phone: phone.value, lang: lang.value }, makeCall(wake)); save.disabled = false; if (r.ok) { out.className = 'positive'; out.textContent = t('a_saved'); return; } if (r.error.code === 'VALIDATION' && showFieldErrors(r.error.fields, map, out)) return; out.textContent = errText(r.error); };
      body.append(f);

      const pf = el('form', undefined, 'panel'), cur = input('apw-cur', 'password', 'current-password'), nw = input('apw-new', 'password', 'new-password'), nw2 = input('apw-new2', 'password', 'new-password');
      const pmap = { currentPassword: field('apw-cur', t('a_currentPw'), cur), password: field('apw-new', t('a_newPw'), nw, t('a_pwHint')), pw2: field('apw-new2', t('a_password2'), nw2) };
      const pout = el('p', '', 'err', { role: 'alert' }), pgo = el('button', t('a_changePw'), 'cta'); pgo.type = 'submit';
      pf.append(el('h2', t('a_changePw')), ...Object.values(pmap), pout, pgo);
      pf.onsubmit = async e => {
        e.preventDefault(); pout.textContent = ''; pout.className = 'err'; showFieldErrors({}, pmap, pout);
        if (nw.value !== nw2.value) { pmap.pw2._err.textContent = fieldText('mismatch'); return; }
        pgo.disabled = true; const r = await Api.post('/api/me/change-password', { currentPassword: cur.value, newPassword: nw.value }, makeCall(wake)); pgo.disabled = false;
        if (r.ok) { cur.value = nw.value = nw2.value = ''; pout.className = 'positive'; pout.textContent = t('a_pwChanged'); return; }
        if (r.error.code === 'VALIDATION' && showFieldErrors(r.error.fields, pmap, pout)) return; pout.textContent = errText(r.error);
      };
      body.append(pf);

      const row = el('div', undefined, 'navrow'), lo = el('button', t('a_logout'), 'ghost2'), la = el('button', t('a_logoutAll'), 'ghost2'); lo.type = la.type = 'button';
      lo.onclick = async () => { lo.disabled = true; await Api.post('/api/auth/logout', {}); Api.token.clear(); showAuth('login'); };
      la.onclick = async () => { la.disabled = true; const r = await Api.post('/api/auth/logout-all', {}); Api.token.clear(); showAuth('login', r.ok ? t('a_loggedOutAll') : ''); };
      row.append(lo, la); body.append(row);
    }

    function loadProfile() {
      body.replaceChildren(status(t('a_loading')));
      const wake = el('p', '', 'muted', { 'aria-live': 'polite' }); body.append(wake);
      Api.get('/api/me', makeCall(wake)).then(r => {
        if (!box.isConnected) return;
        if (r.ok) return showProfile(r.data.customer);
        if (r.error.code === 'SESSION_INVALID') { Api.token.clear(); return showAuth('login'); }
        body.replaceChildren(el('p', errText(r.error), 'err', { role: 'alert' })); const rt = el('button', t('a_login'), 'ghost2'); rt.type = 'button'; rt.onclick = loadProfile; body.append(rt);
      });
    }
    if (Api.token.get()) loadProfile(); else showAuth('login');
  }

  const tokenFrom = kind => { const m = new RegExp('^#/' + kind + '/([A-Za-z0-9_-]{20,100})').exec(location.hash); return m ? m[1] : ''; };
  const clearHash = kind => { try { history.replaceState(null, '', location.pathname + location.search + '#/' + kind); } catch (_) { /* ignore */ } }; // the one-time token must not stay in the address bar / history

  function verify(root) {
    const box = el('section', undefined, 'panel'), out = el('p', t('a_verifying'), 'muted', { role: 'status' }), wake = el('p', '', 'muted', { 'aria-live': 'polite' }); box.append(el('h2', t('a_title')), out, wake); root.append(box);
    const tk = tokenFrom('verify'); clearHash('verify');
    const go = () => { const b = el('a', t('a_goLogin'), 'cta'); b.href = '#/profile'; box.append(b); };
    if (!tk) { out.className = 'err'; out.textContent = t('a_verifyBad'); go(); return; }
    Api.post('/api/auth/verify-email', { token: tk }, makeCall(wake)).then(r => { out.className = r.ok ? 'positive' : 'err'; out.textContent = r.ok ? t('a_verifyOk') : (r.error.code === 'INVALID_OR_EXPIRED_TOKEN' ? t('a_verifyBad') : errText(r.error)); go(); });
  }

  function reset(root) {
    const tk = tokenFrom('reset'); clearHash('reset');
    const f = el('form', undefined, 'panel'), pw = input('ar2-pw', 'password', 'new-password', { required: 'true' }), pw2 = input('ar2-pw2', 'password', 'new-password', { required: 'true' });
    const map = { password: field('ar2-pw', t('a_newPw'), pw, t('a_pwHint')), pw2: field('ar2-pw2', t('a_password2'), pw2) };
    const out = el('p', '', 'err', { role: 'alert' }), wake = el('p', '', 'muted', { 'aria-live': 'polite' }), go = el('button', t('a_submitReset'), 'cta'); go.type = 'submit';
    f.append(el('h2', t('a_resetTitle')), ...Object.values(map), out, wake, go); root.append(f);
    if (!tk) { out.textContent = t('a_resetBad'); go.disabled = true; return; }
    f.onsubmit = async e => {
      e.preventDefault(); out.textContent = ''; showFieldErrors({}, map, out);
      if (pw.value !== pw2.value) { map.pw2._err.textContent = fieldText('mismatch'); return; }
      go.disabled = true; const r = await Api.post('/api/auth/reset-password', { token: tk, password: pw.value }, makeCall(wake));
      if (r.ok) { Api.token.clear(); f.replaceChildren(el('p', t('a_resetOk'), 'positive', { role: 'status' })); const b = el('a', t('a_goLogin'), 'cta'); b.href = '#/profile'; f.append(b); return; }
      go.disabled = false;
      if (r.error.code === 'VALIDATION' && showFieldErrors(r.error.fields, map, out)) return;
      out.textContent = r.error.code === 'INVALID_OR_EXPIRED_TOKEN' ? t('a_resetBad') : errText(r.error);
    };
  }
  window.Account = { mount, verify, reset };
})();
