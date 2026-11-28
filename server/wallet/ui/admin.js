'use strict';
// Admin page for exchange rates. Same-origin only. All text is inserted with textContent (no innerHTML).
(function () {
  const app = document.getElementById('app');
  const h = (tag, props, ...kids) => { const e = document.createElement(tag); if (props) for (const k in props) { if (k === 'class') e.className = props[k]; else if (k.startsWith('on')) e[k] = props[k]; else if (props[k] !== undefined) e.setAttribute(k, props[k]); } kids.flat().forEach(c => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); }); return e; };
  const MSG = { invalid: 'قيمة غير صحيحة.', range: 'القيمة خارج الحدود المسموحة.', buyAboveSell: 'سعر الشراء يجب ألا يكون أكبر من سعر البيع.', spreadTooWide: 'الفرق بين الشراء والبيع كبير جداً (أكثر من 25%).', largeChange: 'تغيير كبير عن السعر الحالي (أكثر من 10%).' };
  const FIELDS = [['buyIQD', 'سعر شراء الدولار بالدينار', 'كم دينار يستلم الزبون عندما يحوّل 100 دولار إلى دينار.'], ['sellIQD', 'سعر بيع الدولار بالدينار', 'كم دينار يدفع الزبون عندما يحوّل دينار إلى 100 دولار.'], ['buyIRT', 'سعر شراء الدولار بالتومان', 'كم تومان يستلم الزبون مقابل 100 دولار. التومان وليس الريال.'], ['sellIRT', 'سعر بيع الدولار بالتومان', 'كم تومان يدفع الزبون مقابل 100 دولار. التومان وليس الريال.']];
  const FIELDS2 = [['fundingPct', 'عمولة شحن المحفظة %', 'اكتب 0 لإلغاء العمولة.'], ['exchangePct', 'عمولة تحويل العملات %', 'اكتب 0 لإلغاء العمولة.'], ['minUSD', 'أقل مبلغ للعملية (بالدولار)', ''], ['maxUSD', 'أكبر مبلغ للعملية (بالدولار)', ''], ['validHours', 'مدة صلاحية الأسعار (ساعات)', 'بعدها تتوقف التحويلات تلقائياً حتى تنشر أسعاراً جديدة. من 1 إلى 168.']];
  const fmtNum = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(n);
  const fmtDate = iso => { try { return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (_) { return ''; } };
  async function api(path, body) {
    const r = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Miri-Admin': '1' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (_) { /* empty */ }
    return { ok: r.ok, status: r.status, j };
  }
  const errText = j => (j && j.error && (j.error.message || j.error.code)) || 'حدث خطأ. حاول مرة أخرى.';
  const pairLine = d => { let r = d.rate, left; if (d.from === 'USD') left = '100 USD = ' + fmtNum(r * 100) + ' ' + d.to; else if (d.to === 'USD') left = fmtNum(100 / r) + ' ' + d.from + ' = 100 USD'; else { let b = 1; while (r < 1 && b < 1e6) { b *= 1000; r *= 1000; } left = fmtNum(b) + ' ' + d.from + ' = ' + fmtNum(Math.round(r * 1e6) / 1e6) + ' ' + d.to; } return left; };

  function loginView(msg) {
    const u = h('input', { id: 'u', autocomplete: 'username', value: 'admin' }), p = h('input', { id: 'p', type: 'password', autocomplete: 'current-password' }), out = h('p', { class: 'err', role: 'alert' }, msg || '');
    const go = h('button', { type: 'submit' }, 'دخول');
    const f = h('form', null, h('h1', null, 'لوحة إدارة أسعار الصرف'), h('p', { class: 'muted' }, 'للمسؤول فقط.'), h('label', { for: 'u' }, 'اسم المستخدم'), u, h('label', { for: 'p' }, 'كلمة المرور'), p, out, go);
    f.onsubmit = async e => { e.preventDefault(); go.disabled = true; out.textContent = ''; const r = await api('login', { username: u.value, password: p.value }); go.disabled = false; if (r.ok) { p.value = ''; boot(); } else out.textContent = r.status === 503 ? 'الدخول غير مُعدّ على الخادم بعد. راجع إعدادات Render.' : r.status === 429 ? 'محاولات كثيرة خاطئة. انتظر 15 دقيقة.' : r.status === 401 ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : errText(r.j); };
    app.replaceChildren(h('section', { class: 'card' }, f));
  }


  // ---- Stage 3A: customers (search + account status) and the sandbox mailbox ----
  const ST = { pending_verification: 'بانتظار التفعيل', active: 'نشط', restricted: 'مقيّد', suspended: 'موقوف', closed: 'مغلق' };
  function customersCard() {
    const q = h('input', { id: 'cq', type: 'text', autocomplete: 'off', placeholder: 'بحث: بريد أو اسم أو رقم العميل' }), list = h('div'), msg = h('p', { role: 'status' }), find = h('button', { type: 'button' }, 'بحث');
    async function load() {
      const r = await api('customers?limit=25&q=' + encodeURIComponent(q.value.trim()));
      if (r.status === 401) return loginView('انتهت الجلسة.');
      if (!r.ok) { list.replaceChildren(h('p', { class: 'err' }, r.status === 503 ? 'حسابات العملاء غير مفعّلة بعد على الخادم (راجع إعدادات Render).' : errText(r.j))); return; }
      list.replaceChildren(...(r.j.customers.length ? r.j.customers.map(row) : [h('p', { class: 'muted' }, 'لا يوجد عملاء.')]));
    }
    function row(c) {
      const sel = h('select', { 'aria-label': 'الحالة' }); ['active', 'restricted', 'suspended', 'closed'].forEach(s => { const o = h('option', { value: s }, ST[s]); sel.append(o); }); sel.value = c.status === 'pending_verification' ? 'active' : c.status;
      const why = h('input', { type: 'text', maxlength: '300', placeholder: 'السبب (مطلوب عند التقييد أو الإيقاف)' }), go = h('button', { type: 'button', class: 'ghost' }, 'تطبيق');
      go.onclick = async () => {
        if (!confirm('تغيير حالة حساب ' + c.email + ' إلى: ' + ST[sel.value] + '؟')) return; go.disabled = true;
        const r2 = await api('customers/status', { customerId: c.id, status: sel.value, reason: why.value });
        go.disabled = false; msg.className = r2.ok ? 'banner good' : 'banner bad'; msg.textContent = r2.ok ? 'تم تغيير الحالة (وسُجّل في سجل التدقيق).' : (r2.j && r2.j.error && r2.j.error.fields ? 'تحقق من الحقول: السبب مطلوب عند التقييد أو الإيقاف.' : errText(r2.j)); if (r2.ok) load();
      };
      return h('div', { class: 'card' }, h('div', { class: 'row' }, h('strong', null, c.fullName), h('span', { class: 'ltr' }, c.customerNo)), h('div', { class: 'muted' }, h('span', { class: 'ltr' }, c.email), ' · ' + ST[c.status] + (c.emailVerified ? ' · البريد مفعّل' : ' · البريد غير مفعّل')), h('div', { class: 'grid' }, sel, why, go));
    }
    find.onclick = load; q.onkeydown = e => { if (e.key === 'Enter') load(); };
    load();
    return h('section', { class: 'card' }, h('h2', null, 'العملاء (تجريبي)'), h('div', { class: 'row' }, q, find), msg, list);
  }
  function mailboxCard() {
    const list = h('div'), reload = h('button', { type: 'button', class: 'ghost' }, 'تحديث');
    async function load() {
      const r = await api('sandbox/outbox?limit=10'); if (!r.ok) { list.replaceChildren(h('p', { class: 'muted' }, r.status === 503 ? 'غير مفعّل بعد.' : errText(r.j))); return; }
      list.replaceChildren(...(r.j.messages.length ? r.j.messages.map(m => { const url = (String(m.body).split('\n').find(l => /^https:\/\//.test(l)) || '').trim(); return h('div', { class: 'card' }, h('strong', null, m.subject), h('div', { class: 'muted' }, h('span', { class: 'ltr' }, m.to_email), ' · ' + fmtDate(m.at)), url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'ltr' }, url)) : null); }) : [h('p', { class: 'muted' }, 'لا توجد رسائل بعد.')]));
    }
    reload.onclick = load; load();
    return h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', null, 'صندوق البريد التجريبي'), reload), h('p', { class: 'help' }, 'روابط التفعيل واستعادة كلمة المرور تظهر هنا في النسخة التجريبية فقط. لا تُرسل رسائل حقيقية.'), list);
  }

  async function mainView(user) {
    const r = await api('rates'); if (r.status === 401) return loginView('انتهت الجلسة. سجّل الدخول من جديد.'); if (!r.ok) return loginView(errText(r.j));
    const d = r.j, cur = d.current, inputs = {}, errBox = {};
    const status = h('div', { class: 'banner ' + (d.status === 'ok' ? 'good' : 'warn'), role: 'status' },
      d.status === 'ok' ? 'الأسعار الحالية سارية. آخر تحديث: ' + fmtDate(cur.updatedAt) + ' بواسطة ' + cur.updatedBy + '. تنتهي: ' + fmtDate(cur.validUntil) : d.status === 'expired' ? 'الأسعار منتهية. التحويلات متوقفة عند الزبائن حتى تنشر أسعاراً جديدة.' : 'لم يتم نشر أسعار بعد. التحويلات متوقفة عند الزبائن.');
    const store = d.storage.durable ? null : h('div', { class: 'banner bad', role: 'alert' }, 'تنبيه: التخزين الحالي مؤقت وقد تضيع الأسعار عند إعادة تشغيل Render. اربط Upstash Redis (انظر التعليمات).');
    const def = { fundingPct: '0', exchangePct: '0', minUSD: '1', maxUSD: '10000', validHours: '24' };
    const val = k => cur ? ({ buyIQD: cur.buy.IQD, sellIQD: cur.sell.IQD, buyIRT: cur.buy.IRT, sellIRT: cur.sell.IRT, fundingPct: cur.fees.fundingPct, exchangePct: cur.fees.exchangePct, minUSD: cur.limits.minUSD, maxUSD: cur.limits.maxUSD, validHours: cur.hours || 24 })[k] : (def[k] || '');
    const fieldEl = ([k, label, help]) => { inputs[k] = h('input', { id: 'f_' + k, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: String(val(k)) }); errBox[k] = h('p', { class: 'err', role: 'alert' }); return h('div', null, h('label', { for: 'f_' + k }, label), inputs[k], help ? h('p', { class: 'help' }, help) : null, errBox[k]); };
    const preview = h('div', { 'aria-live': 'polite' }), saveMsg = h('p', { role: 'status' }), save = h('button', { type: 'button' }, 'حفظ ونشر لجميع الزبائن');
    const read = () => { const o = {}; Object.keys(inputs).forEach(k => { o[k] = inputs[k].value; }); return o; };
    const showErrors = list => { Object.values(errBox).forEach(b => { b.textContent = ''; }); (list || []).forEach(e => { if (errBox[e.field]) errBox[e.field].textContent = MSG[e.code] || MSG.invalid; }); };
    let timer = 0, seq = 0;
    async function doPreview() {
      const my = ++seq, r2 = await api('preview', read()); if (!r2.ok || my !== seq) return; /* ignore out-of-date answers */ const j = r2.j; showErrors(j.errors.concat(j.warnings || []));
      preview.replaceChildren(h('h2', null, 'أسعار التحويل المحسوبة تلقائياً'));
      if (!j.ok) { preview.append(h('p', { class: 'muted' }, 'صحّح الأخطاء أعلاه لتظهر الأسعار.')); return; }
      const t = h('table'); j.derived.forEach(x => t.append(h('tr', null, h('th', null, h('span', { class: 'ltr' }, x.from + ' → ' + x.to)), h('td', null, h('span', { class: 'ltr' }, pairLine(x))))));
      preview.append(t, h('p', { class: 'help' }, 'أي تحويل ذهاباً وإياباً يعطي الزبون أقل مما بدأ به (شراء ≤ بيع)، فلا يمكن الربح من التكرار.'));
    }
    async function publish(extra) {
      const r2 = await api('rates', Object.assign(read(), extra || {}));
      if (r2.ok) { saveMsg.className = 'banner good'; saveMsg.textContent = 'تم الحفظ والنشر لجميع الزبائن.'; return mainView(user); }
      if (r2.status === 401) return loginView('انتهت الجلسة.');
      const f = r2.j && r2.j.error && r2.j.error.fields;
      if (f) { showErrors(f); if (f.every(e => e.code === 'largeChange') && confirm('التغيير أكبر من 10% عن السعر الحالي. هل أنت متأكد أنه ليس خطأ في الكتابة؟')) return publish({ confirmLargeChange: true }); saveMsg.className = 'banner bad'; saveMsg.textContent = 'لم يتم الحفظ. صحّح الحقول المعلّمة.'; return; }
      saveMsg.className = 'banner bad'; saveMsg.textContent = errText(r2.j);
    }
    save.onclick = async () => { if (!confirm('نشر هذه الأسعار لجميع الزبائن الآن؟')) return; save.disabled = true; await publish(); save.disabled = false; };
    const hist = h('div', { class: 'hist' });
    api('history?limit=30').then(hr => { if (!hr.ok) return; const t = h('table', null, h('tr', null, ['التاريخ', 'المسؤول', 'الدينار شراء/بيع', 'التومان شراء/بيع', 'عمولة شحن/تحويل'].map(x => h('th', null, x))));
      hr.j.history.forEach(e => { const a = e.after; t.append(h('tr', null, h('td', null, fmtDate(e.at)), h('td', null, e.by), h('td', null, h('span', { class: 'ltr' }, fmtNum(a.buy.IQD) + ' / ' + fmtNum(a.sell.IQD))), h('td', null, h('span', { class: 'ltr' }, fmtNum(a.buy.IRT) + ' / ' + fmtNum(a.sell.IRT))), h('td', null, h('span', { class: 'ltr' }, a.fees.fundingPct + '% / ' + a.fees.exchangePct + '%')))); });
      hist.replaceChildren(hr.j.history.length ? t : h('p', { class: 'muted' }, 'لا يوجد سجل بعد.')); });
    const out = h('button', { class: 'ghost', type: 'button' }, 'تسجيل الخروج'); out.onclick = async () => { await api('logout', {}); loginView(''); };
    app.replaceChildren(...[
      h('div', { class: 'row' }, h('h1', null, 'إدارة أسعار الصرف'), h('div', null, h('span', { class: 'muted' }, user + ' '), out)),
      store, status,
      h('section', { class: 'card' }, h('h2', null, 'الأسعار (لكل 100 دولار)'), h('p', { class: 'help' }, 'يجب أن يكون سعر الشراء أقل من أو يساوي سعر البيع.'), h('div', { class: 'grid' }, FIELDS.map(fieldEl))),
      h('section', { class: 'card' }, h('h2', null, 'العمولات والحدود'), h('div', { class: 'grid' }, FIELDS2.map(fieldEl))),
      h('section', { class: 'card' }, preview, h('div', { class: 'row' }, save), saveMsg),
      h('section', { class: 'card' }, h('h2', null, 'سجل تغييرات الأسعار'), hist),
      customersCard(), mailboxCard()].filter(Boolean)); // filter: a null child would be printed as the text "null"
    Object.values(inputs).forEach(i => { i.oninput = () => { clearTimeout(timer); timer = setTimeout(doPreview, 450); }; }); // attached after the fields exist
    doPreview();
  }
  async function boot() { const me = await api('me'); if (me.ok) return mainView(me.j.user); if (me.status === 503) return loginView('الدخول غير مُعدّ على الخادم بعد. راجع إعدادات Render.'); loginView(''); }
  boot();
})();
