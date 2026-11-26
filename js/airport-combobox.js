/*! Miri Iran V6 - Task 1: searchable airport combobox.
 *  - No dependencies, no inline styles (CSP friendly), all API text is inserted with textContent.
 *  - Loads airports from the existing GET /api/airports endpoint (Charter724 via the Render backend).
 *  - Does NOT touch flight search, results, booking, payment or wallet code.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.MiriAirportCombobox = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var DEFAULT_API = 'https://miri-iran-v6.onrender.com';
  var MAX_ITEMS = 200;
  var LOAD_TIMEOUT_MS = 75000; // Render's free plan can need about a minute to wake up
  var uid = 0;

  var TEXT = {
    ar: { loading: 'جارٍ تحميل المطارات…', empty: 'لا توجد مطارات مطابقة', error: 'تعذّر تحميل قائمة المطارات', retry: 'إعادة المحاولة', clear: 'مسح', taken: 'محدد في الحقل الآخر', results: function (n) { return n + ' نتيجة'; }, required: 'اختر مطاراً من القائمة' },
    fa: { loading: 'در حال بارگذاری فرودگاه‌ها…', empty: 'فرودگاهی پیدا نشد', error: 'بارگذاری فهرست فرودگاه‌ها ناموفق بود', retry: 'تلاش دوباره', clear: 'پاک کردن', taken: 'در فیلد دیگر انتخاب شده', results: function (n) { return n + ' نتیجه'; }, required: 'یک فرودگاه از فهرست انتخاب کنید' },
    en: { loading: 'Loading airports…', empty: 'No matching airports', error: 'Could not load the airport list', retry: 'Try again', clear: 'Clear', taken: 'Already chosen in the other field', results: function (n) { return n + (n === 1 ? ' result' : ' results'); }, required: 'Choose an airport from the list' }
  };

  // ---------- Text normalisation (Arabic / Persian / Latin) ----------
  // Keyboards differ: Iraqi (Arabic) keyboards have no پ چ ژ گ, so those fold to ب ج ز ک for matching only.
  function normalize(s) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFKD'); } catch (e) { /* very old browsers */ }
    s = s
      .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '') // diacritics, tatweel, bidi marks
      .replace(/[\u06f0-\u06f9]/g, function (d) { return String(d.charCodeAt(0) - 0x06f0); })
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')   // آ أ إ ٱ -> ا
      .replace(/[\u064a\u0649\u0626\u06cc]/g, '\u06cc')   // ي ى ئ ی -> ی
      .replace(/[\u0643\u06a9]/g, '\u06a9')               // ك ک -> ک
      .replace(/[\u0629\u06c0\u06d5]/g, '\u0647')         // ة ۀ ە -> ه
      .replace(/\u0624/g, '\u0648')                       // ؤ -> و
      .replace(/\u067e/g, '\u0628').replace(/\u0686/g, '\u062c').replace(/\u0698/g, '\u0632').replace(/\u06af/g, '\u06a9') // پ چ ژ گ -> ب ج ز ک
      .replace(/[\u200c\u200d]/g, ' ')                    // ZWNJ / ZWJ -> space
      .replace(/[()\[\]{}\-\u2013\u2014_.,;:\/\\|'"`]+/g, ' ')
      .toLowerCase();
    return s.replace(/\s+/g, ' ').trim();
  }

  function script(t) { return /[\u0600-\u06ff]/.test(t) ? 'arabic' : (/[a-z]/i.test(t) ? 'latin' : 'other'); }
  function keyLang(k) { var m = /(?:^|[^a-zA-Z])(fa|ar|en)$/i.exec(k) || /[a-z](Fa|Ar|En|FA|AR|EN)$/.exec(k); return m ? m[1].toLowerCase() : ''; }
  var SKIP_KEY = /^(id|uuid|url|link|type|lat|lng|lon|latitude|longitude|tz|timezone|slug|order|rank|active|enabled|visible)$|id$|code$|^iata|^icao|^sort/i;

  // Accepts the airport object as the backend sends it. Only a 3-character code is required; every other text field is searchable.
  function normalizeAirport(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var code = String(raw.code || raw.iata || raw.iataCode || raw.IATA || raw.airportCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(code)) return null;
    var labels = [];
    var add = function (key, v) { if (typeof v === 'string' && /[A-Za-z\u0600-\u06ff]/.test(v) && v.trim().toUpperCase() !== code && !SKIP_KEY.test(key)) labels.push({ key: key, text: v.trim() }); };
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach(function (k2) { add(k + '_' + k2, v[k2]); });
      else add(k, v);
    });
    return { code: code, labels: labels, raw: raw };
  }

  function pickName(labels, lang) {
    var best = null, bestScore = -Infinity;
    labels.forEach(function (l, i) {
      var s = 0, sc = script(l.text);
      if (/name|title|label/i.test(l.key)) s += 2;
      if (keyLang(l.key) === lang) s += 4;
      if (lang === 'en' ? sc === 'latin' : sc === 'arabic') s += 3;
      if (/city|town|province|country/i.test(l.key)) s -= 1;
      s -= i * 0.001;
      if (s > bestScore) { bestScore = s; best = l; }
    });
    return best ? best.text : '';
  }

  function decorate(a, lang) {
    var name = pickName(a.labels, lang) || a.code, seen = {}, others = [];
    seen[normalize(name)] = 1;
    a.labels.forEach(function (l) { var n = normalize(l.text); if (n && !seen[n]) { seen[n] = 1; others.push(l.text); } });
    a.name = name; a.secondary = others.slice(0, 2).join(' \u00b7 ');
    a.display = name + ' (' + a.code + ')';
    a.haystack = a.labels.map(function (l) { return normalize(l.text); }).filter(Boolean);
    a.hay = a.haystack.join(' | ') + ' | ' + a.code.toLowerCase();
    return a;
  }

  function scoreOf(a, q, tokens) {
    var code = a.code.toLowerCase();
    if (q === code) return 1000;
    if (q.length >= 1 && q.length <= 3 && code.indexOf(q) === 0) return 800;
    var best = 0, i;
    for (i = 0; i < a.haystack.length; i++) {
      var t = a.haystack[i], s = 0;
      if (t === q) s = 700; else if (t.indexOf(q) === 0) s = 600; else if ((' ' + t).indexOf(' ' + q) !== -1) s = 500; else if (t.indexOf(q) !== -1) s = 300;
      if (s > best) best = s;
    }
    if (!best && tokens.length > 1 && tokens.every(function (tk) { return a.hay.indexOf(tk) !== -1; })) best = 150;
    return best;
  }

  function search(list, query) {
    var q = normalize(query);
    if (!q) return list.slice(0, MAX_ITEMS);
    var tokens = q.split(' ');
    return list.map(function (a, i) { return { a: a, s: scoreOf(a, q, tokens), i: i }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (x, y) { return y.s - x.s || x.i - y.i; })
      .slice(0, MAX_ITEMS).map(function (x) { return x.a; });
  }

  // ---------- Loading (GET /api/airports, one shared request) ----------
  var cache = {};
  function loadAirports(opts) {
    opts = opts || {};
    var base = String(opts.apiBase != null ? opts.apiBase : (root.MIRI_API_BASE || DEFAULT_API)).replace(/\/+$/, '');
    if (!opts.fetch && cache[base]) return cache[base];
    var f = opts.fetch || (root.fetch && root.fetch.bind(root));
    if (!f) return Promise.reject(new Error('NO_FETCH'));
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer;
    var init = { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }; if (ctl) init.signal = ctl.signal;
    var timeout = new Promise(function (_, rej) { timer = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error('TIMEOUT')); }, opts.timeoutMs || LOAD_TIMEOUT_MS); });
    var p = Promise.race([f(base + '/api/airports', init), timeout]).then(function (res) {
      if (!res.ok) throw new Error('HTTP_' + res.status);
      return res.json();
    }).then(function (j) {
      clearTimeout(timer);
      var raw = Array.isArray(j) ? j : (j && j.airports), seen = {}, out = [];
      if (!Array.isArray(raw)) throw new Error('BAD_RESPONSE');
      raw.forEach(function (r) { var a = normalizeAirport(r); if (a && !seen[a.code]) { seen[a.code] = 1; out.push(a); } });
      if (!out.length) throw new Error('EMPTY_LIST');
      return { airports: out, source: j && j.source, fictional: j && j.fictional };
    });
    p = p.catch(function (e) { clearTimeout(timer); if (cache[base] === p) delete cache[base]; throw e; });
    if (!opts.fetch) cache[base] = p;
    return p;
  }

  // ---------- One combobox ----------
  function mount(host, opts) {
    opts = opts || {};
    var lang = opts.lang || (root.document && root.document.documentElement.getAttribute('lang') || 'ar').slice(0, 2).toLowerCase();
    var T = TEXT[lang] || TEXT.ar, id = 'mac' + (++uid), doc = host.ownerDocument;
    var st = { airports: [], selected: null, open: false, active: -1, items: [], dirty: false, loading: true, error: false, inList: false };
    var el = function (tag, cls, attrs) { var n = doc.createElement(tag); if (cls) n.className = cls; if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; };

    var wrap = el('div', 'mac'), label = null;
    if (opts.label) { label = el('label', 'mac-label', { 'for': id + '-input' }); label.textContent = opts.label; wrap.appendChild(label); }
    var field = el('div', 'mac-field'), input = el('input', 'mac-input', {
      id: id + '-input', type: 'text', role: 'combobox', dir: 'auto', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      inputmode: 'search', enterkeyhint: 'done', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': id + '-list', 'aria-haspopup': 'listbox'
    });
    if (opts.placeholder) input.setAttribute('placeholder', opts.placeholder);
    if (!opts.label && opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);
    var clearBtn = el('button', 'mac-clear', { type: 'button', 'aria-label': T.clear, tabindex: '-1' }); clearBtn.hidden = true; clearBtn.textContent = '\u00d7';
    var list = el('ul', 'mac-list', { id: id + '-list', role: 'listbox', tabindex: '-1' }); list.hidden = true; if (opts.label) list.setAttribute('aria-labelledby', id + '-label'); else if (opts.ariaLabel) list.setAttribute('aria-label', opts.ariaLabel);
    if (label) label.id = id + '-label';
    var status = el('div', 'mac-sr', { role: 'status', 'aria-live': 'polite' });
    var hidden = el('input', null, { type: 'hidden' }); if (opts.name) hidden.setAttribute('name', opts.name);
    field.appendChild(input); field.appendChild(clearBtn);
    wrap.appendChild(field); wrap.appendChild(list); wrap.appendChild(status); wrap.appendChild(hidden);
    host.appendChild(wrap);

    var excluded = function () { var x = opts.getExcluded && opts.getExcluded(); return x ? String(x).toUpperCase() : ''; };
    var query = function () { return st.dirty ? input.value : ''; };

    function emit() {
      var code = st.selected ? st.selected.code : '';
      hidden.value = code; clearBtn.hidden = !input.value; input.removeAttribute('aria-invalid');
      var ev; try { ev = new root.CustomEvent('airportchange', { bubbles: true, detail: { code: code, airport: st.selected ? st.selected.raw : null, field: opts.name || '' } }); } catch (e) { ev = null; }
      if (ev) host.dispatchEvent(ev);
      if (opts.onChange) opts.onChange(code, st.selected ? st.selected.raw : null);
    }

    function compute() {
      var ex = excluded();
      st.items = search(st.airports, query()).map(function (a) { return { a: a, disabled: !!ex && a.code === ex }; });
    }
    function firstEnabled(from, dir) { var n = st.items.length, i; for (i = 0; i < n; i++) { var k = ((from + dir * i) % n + n) % n; if (!st.items[k].disabled) return k; } return -1; }

    function render() {
      list.textContent = '';
      if (st.loading || st.error || !st.items.length) {
        var li = el('li', 'mac-msg', { role: 'presentation' });
        if (st.loading) li.textContent = T.loading;
        else if (st.error) {
          var s = el('span'); s.textContent = T.error + ' '; li.appendChild(s);
          var b = el('button', 'mac-retry', { type: 'button' }); b.textContent = T.retry; li.appendChild(b);
        } else li.textContent = T.empty;
        list.appendChild(li); input.removeAttribute('aria-activedescendant');
      } else {
        var frag = doc.createDocumentFragment();
        st.items.forEach(function (it, i) {
          var o = el('li', 'mac-opt', { id: id + '-o' + i, role: 'option', 'aria-selected': i === st.active ? 'true' : 'false', 'data-code': it.a.code });
          if (it.disabled) { o.setAttribute('aria-disabled', 'true'); o.classList.add('mac-opt--off'); }
          var txt = el('span', 'mac-opt-text'), n1 = el('span', 'mac-opt-name'), n2 = el('span', 'mac-opt-sub');
          n1.textContent = it.a.name; txt.appendChild(n1);
          var sub = it.disabled ? T.taken : it.a.secondary; if (sub) { n2.textContent = sub; txt.appendChild(n2); }
          var c = el('bdi', 'mac-opt-code', { dir: 'ltr' }); c.textContent = it.a.code;
          o.appendChild(txt); o.appendChild(c); frag.appendChild(o);
        });
        list.appendChild(frag);
        if (st.active >= 0) input.setAttribute('aria-activedescendant', id + '-o' + st.active); else input.removeAttribute('aria-activedescendant');
        var act = st.active >= 0 && list.children[st.active]; if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
      }
      list.hidden = !st.open; input.setAttribute('aria-expanded', st.open ? 'true' : 'false');
      if (st.open && st.error) status.textContent = T.error;
      else if (st.open && !st.loading) status.textContent = st.items.length ? T.results(st.items.filter(function (x) { return !x.disabled; }).length) : T.empty;
    }

    function openList(activeSel) {
      compute(); st.open = true;
      st.active = activeSel && st.selected ? st.items.findIndex(function (x) { return x.a.code === st.selected.code; }) : (st.dirty ? firstEnabled(0, 1) : -1);
      render();
    }
    function closeList() { if (!st.open) return; st.open = false; st.active = -1; render(); status.textContent = ''; }

    function choose(a) {
      var ex = excluded(); if (!a || (ex && a.code === ex)) return false;
      st.selected = a; st.dirty = false; input.value = a.display; st.open = false; st.active = -1; render(); emit(); return true;
    }
    function clear(silent) {
      var had = !!st.selected; st.selected = null; st.dirty = false; input.value = ''; st.open = false; st.active = -1; render();
      if (!silent || had) emit();
    }
    function revert() { st.dirty = false; input.value = st.selected ? st.selected.display : ''; clearBtn.hidden = !input.value; }

    function commitOrRevert() {
      if (!st.dirty) { closeList(); return; }
      var txt = input.value.trim(), n = normalize(txt), ex = excluded(), pick = null;
      if (n) {
        var res = search(st.airports, txt).filter(function (a) { return !(ex && a.code === ex); });
        var exact = res.filter(function (a) { return a.code.toLowerCase() === n; })[0];
        pick = exact || (res.length === 1 ? res[0] : null);
      }
      if (pick) choose(pick); else { st.open = false; revert(); render(); }
    }

    // ----- events -----
    input.addEventListener('input', function () {
      st.dirty = true;
      if (st.selected) { st.selected = null; hidden.value = ''; emit(); } // text changed: the old code must never be sent
      clearBtn.hidden = !input.value; openList(false);
    });
    input.addEventListener('focus', function () {
      if (st.selected) setTimeout(function () { try { input.select(); } catch (e) { /* ignore */ } }, 0);
      openList(true);
    });
    input.addEventListener('click', function () { if (!st.open) openList(true); });
    input.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return; // IME in progress
      var k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        var dir = k === 'ArrowDown' ? 1 : -1;
        if (!st.open) { openList(true); if (st.active < 0) { st.active = firstEnabled(dir === 1 ? 0 : st.items.length - 1, dir); render(); } return; }
        if (!st.items.length) return;
        st.active = st.active < 0 ? firstEnabled(dir === 1 ? 0 : st.items.length - 1, dir) : firstEnabled(st.active + dir, dir); render();
      } else if (k === 'Enter') {
        if (st.open && st.active >= 0 && st.items[st.active]) { e.preventDefault(); choose(st.items[st.active].disabled ? null : st.items[st.active].a); }
      } else if (k === 'Escape') {
        if (st.open) { e.preventDefault(); e.stopPropagation(); closeList(); } else if (input.value) { e.preventDefault(); clear(); }
      } else if (k === 'Tab') { /* blur handler commits */ }
    });
    list.addEventListener('pointerdown', function () { st.inList = true; });
    var releaseList = function () { setTimeout(function () { st.inList = false; }, 400); };
    list.addEventListener('pointerup', releaseList); list.addEventListener('pointercancel', releaseList);
    list.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the input
    list.addEventListener('click', function (e) {
      var t = e.target, retry = t.closest && t.closest('.mac-retry');
      if (retry) { if (opts.onRetry) opts.onRetry(); return; }
      var li = t.closest && t.closest('.mac-opt'); st.inList = false; if (!li) return;
      var i = Array.prototype.indexOf.call(list.children, li); if (st.items[i] && !st.items[i].disabled) choose(st.items[i].a);
    });
    clearBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    clearBtn.addEventListener('click', function () { clear(); input.focus(); });
    wrap.addEventListener('focusout', function (e) {
      if (st.inList) { st.inList = false; return; }
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      commitOrRevert();
    });
    var onDocDown = function (e) { if (!wrap.contains(e.target)) { st.inList = false; if (st.open) { commitOrRevert(); } } };
    doc.addEventListener('pointerdown', onDocDown, true);

    var api = {
      host: host, input: input, hidden: hidden,
      get value() { return st.selected ? st.selected.code : ''; },
      get airport() { return st.selected ? st.selected.raw : null; },
      get isOpen() { return st.open; },
      setAirports: function (arr) { st.airports = arr.map(function (a) { return decorate(a, lang); }); st.loading = false; st.error = false; if (st.selected) { var c = st.selected.code; st.selected = st.airports.filter(function (a) { return a.code === c; })[0] || null; if (st.selected) input.value = st.selected.display; } if (st.open) compute(); render(); },
      setLoading: function () { st.loading = true; st.error = false; render(); },
      setError: function () { st.loading = false; st.error = true; render(); },
      setValue: function (code) { code = String(code || '').toUpperCase(); if (!code) { clear(); return true; } var a = st.airports.filter(function (x) { return x.code === code; })[0]; return a ? choose(a) : false; },
      clear: clear, refresh: function () { if (st.open) { compute(); render(); } },
      validate: function () { var ok = !!st.selected; if (!ok) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); return ok; },
      message: T.required,
      focus: function () { input.focus(); },
      destroy: function () { doc.removeEventListener('pointerdown', onDocDown, true); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
    render();
    return api;
  }

  // ---------- Departure + arrival pair ----------
  function createPair(cfg) {
    cfg = cfg || {};
    var lang = cfg.lang, pair = { from: null, to: null, source: null, fictional: null };
    function opts(which, other) {
      var o = {}; Object.keys(cfg[which] || {}).forEach(function (k) { o[k] = cfg[which][k]; });
      o.lang = lang; o.onRetry = function () { load(); };
      o.getExcluded = function () { return pair[other] ? pair[other].value : ''; };
      var userChange = o.onChange; o.onChange = function (code, a) { if (pair[other]) pair[other].refresh(); if (userChange) userChange(code, a); if (cfg.onChange) cfg.onChange(pair.getCodes()); };
      return o;
    }
    pair.from = mount(cfg.fromHost, opts('from', 'to'));
    pair.to = mount(cfg.toHost, opts('to', 'from'));
    function load() {
      pair.from.setLoading(); pair.to.setLoading();
      return loadAirports({ apiBase: cfg.apiBase, fetch: cfg.fetch }).then(function (r) {
        pair.source = r.source; pair.fictional = r.fictional;
        pair.from.setAirports(r.airports); pair.to.setAirports(r.airports); return r;
      }, function (e) { pair.from.setError(); pair.to.setError(); throw e; });
    }
    pair.ready = load().catch(function () { return null; });
    pair.reload = load;
    pair.getCodes = function () { return { from: pair.from.value, to: pair.to.value }; };
    // Call before sending the existing search request: true only when both fields hold a real, different airport.
    pair.validate = function () {
      var a = pair.from.validate(), b = pair.to.validate();
      if (!a) pair.from.focus(); else if (!b) pair.to.focus();
      return a && b && pair.from.value !== pair.to.value;
    };
    pair.destroy = function () { pair.from.destroy(); pair.to.destroy(); };
    return pair;
  }

  return { mount: mount, createPair: createPair, loadAirports: loadAirports, normalize: normalize, normalizeAirport: normalizeAirport, search: search, _decorate: decorate };
});
