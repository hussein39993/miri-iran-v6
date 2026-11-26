'use strict';
// Read-only flight/airport API client. No provider credentials are ever sent from the browser.
// Exposes window.LiveFlights = { airports, search, displayed, normalize, filter, label, apiBase }.
(function () {
  const RENDER = 'https://miri-iran-v6.onrender.com';
  const host = typeof location !== 'undefined' ? location.hostname : '';
  // Same-origin when served by the Render server itself or locally; Render URL for GitHub Pages / anything else.
  const API = (host === 'miri-iran-v6.onrender.com' || host === 'localhost' || host === '127.0.0.1') ? '' : RENDER;
  const TIMEOUT_MS = 65000; // Render free instances can need ~1 minute to wake up.

  // Arabic display names (the backend only returns English + Persian). Display labels only; unknown codes fall back to Persian.
  const AR = {
    THR:'طهران',MHD:'مشهد',IFN:'أصفهان',KIH:'كيش',AWZ:'الأهواز',SYZ:'شيراز',TBZ:'تبريز',KSH:'كرمانشاه',HDM:'همدان',PGU:'عسلوية',
    BND:'بندر عباس',KER:'كرمان',GSM:'قشم',NSH:'نوشهر',ADU:'أردبيل',BUZ:'بوشهر',SRY:'ساري',IST:'إسطنبول',DXB:'دبي',EVN:'يريفان',
    BKK:'بانكوك',KUL:'كوالالمبور',NJF:'النجف',BGW:'بغداد',RAS:'رشت',DEF:'دزفول',EBL:'أربيل',AZD:'يزد',OMH:'أرومية',MRX:'ماهشهر',
    ABD:'عبادان',JWN:'زنجان',CQD:'شهركرد',GBT:'جرجان',ISU:'السليمانية',AYT:'أنطاليا',BJV:'بودروم',BSR:'البصرة',TBS:'تبليسي',
    BEY:'بيروت',ZAH:'زاهدان',BJB:'بجنورد',IIL:'إيلام',ESB:'أنقرة',KWI:'الكويت',KHD:'خرم آباد',ZBR:'جابهار',ACZ:'زابل',TCX:'طبس',
    CAN:'غوانغتشو',IHR:'إيرانشهر',BXR:'بم',BDH:'بندر لنجة',KNR:'جم',KHK:'خارك',RZR:'رامسر',RJN:'رفسنجان',SDG:'سنندج',AFZ:'سبزوار',
    SYJ:'سيرجان',GCH:'كچساران',LRR:'لار',LFM:'لامرد',YES:'ياسوج',XBJ:'بيرجند',ECN:'أرجان',GZP:'ألانيا',AJK:'أراك',KBL:'كابول',
    HEA:'هرات',MZR:'مزار شريف',KDH:'قندهار',ACP:'مراغه',FRU:'بيشكيك',PVG:'شنغهاي',PEK:'بكين',CMB:'كولومبو',GZW:'قزوين',HAM:'هامبورغ',
    DEL:'دلهي',BAH:'البحرين',KHY:'خوي',DAM:'دمشق',DYU:'دوشانبي',SHJ:'الشارقة',RUD:'شاهرود',JYR:'جيرفت',GYD:'باكو',ADB:'إزمير',
    KKS:'كاشان',ASF:'أستراخان',VKO:'موسكو (فنوكوفو)',VAR:'فارنا',LED:'سانت بطرسبرغ',BUS:'باتومي',ALA:'ألماتي',KLM:'كلاله',
    DNZ:'أنطاليا (دنيزلي)',MCT:'مسقط',MXP:'ميلانو',CGN:'كولونيا',AMS:'أمستردام',VIE:'فيينا',FCO:'روما',KHI:'كراتشي',CDG:'باريس',
    LHR:'لندن (هيثرو)',FRA:'فرانكفورت',DUS:'دوسلدورف',MUC:'ميونخ',IMQ:'ماكو',LHE:'لاهور',BRU:'بروكسل',XNH:'الناصرية',DPS:'بالي',
    AMM:'عمّان',ISB:'إسلام آباد',BEG:'بلغراد',JAR:'جهرم',PFQ:'بارس آباد مغان',DOH:'الدوحة',BOM:'مومباي',IEV:'كييف',ARN:'ستوكهولم',
    LCA:'لارنكا',GOT:'غوتنبرغ',KZN:'قازان',PYK:'كرج',BCN:'برشلونة',SNX:'سمنان',TTQ:'شانديز',UGT:'طرقبة',TAS:'طشقند',OHS:'صحار',
    JSK:'جاسك',SZF:'سامسون',BHK:'بخارى',SXI:'سيري',AKW:'آغاجاري',VAN:'وان',CAI:'القاهرة',BER:'برلين',LGW:'لندن (غاتويك)',ALP:'حلب',
    MED:'المدينة المنورة',JED:'جدة',DLM:'دالامان',SVO:'موسكو (شيريميتييفو)',SAW:'إسطنبول (صبيحة)',NAJ:'نخجوان',TZX:'طرابزون',
    ISE:'أنطاليا (إسبارطة)',SCO:'أكتاو',RMI:'ريميني',DME:'موسكو (دوموديدوفو)',KIK:'كركوك',HKT:'بوكيت',DWC:'دبي (آل مكتوم)',SKD:'سمرقند',
    AUH:'أبوظبي',GND:'گناباد',SAR:'سراوان',TQZ:'سقز',AER:'سوتشي',SZX:'شنتشن',DMM:'الدمام',MIR:'المنستير (تونس)',UET:'كويتا'
  };

  // Normalise Arabic / Persian / Latin text so that ي/ی, ك/ک, أ/إ/آ/ا, ة/ه, diacritics, ZWNJ and "_" never block a match.
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640\u200c\u200d\u200e\u200f]/g, '')
      .replace(/[يیى]/g, 'ي').replace(/[كک]/g, 'ك').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[_\-.,()]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalize(list) {
    const seen = new Set(), out = [];
    for (const a of list || []) {
      const code = String(a && a.code || '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code) || seen.has(code)) continue;
      seen.add(code);
      const en = String(a.nameEn || '').replace(/_/g, ' ').trim(), fa = String(a.nameFa || '').trim(), ar = String(a.nameAr || AR[code] || '').trim();
      out.push({ code, en, fa, ar, key: norm([code, en, fa, ar, a.nameEn].join(' ')) });
    }
    return out;
  }

  function label(a, lang) {
    const first = lang === 'ar' ? (a.ar || a.fa || a.en) : lang === 'fa' ? (a.fa || a.en) : (a.en || a.fa);
    const second = lang === 'en' ? a.fa : a.en;
    return [first, second && second !== first ? second : ''].filter(Boolean).join(' · ') + ' (' + a.code + ')';
  }

  // Every word typed must appear somewhere in the airport's name(s) or code. Better matches come first.
  function filter(list, query) {
    const q = norm(query);
    if (!q) return list.slice();
    const words = q.split(' '), scored = [];
    for (const a of list) {
      if (!words.every(w => a.key.includes(w))) continue;
      const names = [a.en, a.fa, a.ar].map(norm);
      const score = a.code.toLowerCase() === q ? 0 : names.some(n => n === q) ? 1 : names.some(n => n.startsWith(q)) ? 2 : a.code.toLowerCase().startsWith(q) ? 3 : 4;
      scored.push([score, a]);
    }
    return scored.sort((x, y) => x[0] - y[0]).map(x => x[1]);
  }

  async function request(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(API + path, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options && options.headers) } });
    } catch (e) {
      clearTimeout(timer);
      const err = new Error(e && e.name === 'AbortError'
        ? 'The server did not answer in time (it may be waking up). Please try again.'
        : 'Could not reach the server. Check your internet connection, or the server may be starting up / blocked by CORS.');
      err.code = e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK'; throw err;
    }
    clearTimeout(timer);
    let body = null;
    try { body = await response.json(); } catch (_) { /* non-JSON answer (for example a proxy error page) */ }
    if (!response.ok) {
      const err = new Error((body && body.error && body.error.message) || 'Server answered HTTP ' + response.status);
      err.code = (body && body.error && body.error.code) || 'HTTP_' + response.status; err.status = response.status; throw err;
    }
    if (body === null) { const err = new Error('The server answer was not valid JSON.'); err.code = 'BAD_JSON'; throw err; }
    return body;
  }

  let cache = null;
  function airports() {
    if (cache) return cache;
    cache = request('/api/airports').then(r => {
      const list = normalize(r.airports);
      if (!list.length) throw new Error('The server returned no usable airports.');
      return { source: r.source || 'unknown', fictional: r.fictional === true, airports: list };
    }).catch(e => { cache = null; throw e; }); // failed loads are never cached, so "retry" really retries
    return cache;
  }

  async function search(f) {
    return request('/api/flights/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      from: f.from, to: f.to, date: f.date, trip: f.trip,
      ...(f.trip === 'round' ? { returnDate: f.ret } : {}),
      adults: Number(f.adults), children: Number(f.children), infants: Number(f.infants),
      cabin: f.cabin === '1' ? 'business' : 'economy'
    }) });
  }

  const displayed = r => ({
    id: r.id, fictional: false, title: (r.airline || 'Airline') + (r.flightNumber ? ' · ' + r.flightNumber : ''),
    price: r.price && Number.isFinite(Number(r.price.amountToman)) ? Number(r.price.amountToman) : null, // never invent a price
    rows: { depAirport: r.from, arrAirport: r.to, dep: r.departure || '-', arr: r.arrival || '-',
      duration: r.durationMinutes == null ? '-' : (Math.floor(r.durationMinutes / 60) + ':' + String(r.durationMinutes % 60).padStart(2, '0')),
      stops: r.stops, baggage: r.baggage || '-', fare: r.cabinLabel || r.cabin || '-',
      cancel: (r.cancellationRules || []).map(x => x.description || x.percent + '%').join('; ') || '-' },
    details: r
  });

  const api = { airports, search, displayed, normalize, filter, label, norm, apiBase: API };
  if (typeof window !== 'undefined') window.LiveFlights = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
