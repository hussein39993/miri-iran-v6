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

  // ======================================================================================================
  // Mobile Recharge (SIM top-up) — PREVIEW ONLY. No recharge, payment, wallet deduction or supplier call happens here.
  // All operator prefixes / amounts / supplier data live in the tables below so they can be corrected without touching the UI code.
  // ======================================================================================================
  const RC = (function () {
    const OPS = { // logo: put a verified image path here (e.g. 'img/ops/asiacell.svg') to show the real logo; empty = neutral monogram badge.
      mci: { n: { ar: 'همراه أول', fa: 'همراه اول', en: 'Hamrah-e Aval (MCI)' }, color: '#0b6fc2', mono: 'MCI', logo: '' },
      irancell: { n: { ar: 'إيرانسل', fa: 'ایرانسل', en: 'Irancell' }, color: '#c99700', mono: 'IC', logo: '' },
      rightel: { n: { ar: 'رايتل', fa: 'رایتل', en: 'Rightel' }, color: '#7a1fa2', mono: 'RT', logo: '' },
      shatel: { n: { ar: 'شاتل موبايل', fa: 'شاتل موبایل', en: 'Shatel Mobile' }, color: '#2a7f62', mono: 'SM', logo: '' },
      taliya: { n: { ar: 'تاليا', fa: 'تالیا', en: 'Taliya' }, color: '#a34a28', mono: 'TL', logo: '' },
      otherIR: { n: { ar: 'مشغّل إيراني آخر', fa: 'سایر اپراتورهای ایران', en: 'Other Iranian operator' }, color: '#5b6572', mono: '?', logo: '' },
      asiacell: { n: { ar: 'آسياسيل', fa: 'آسیاسل', en: 'Asiacell' }, color: '#d1122f', mono: 'AC', logo: '' },
      zain: { n: { ar: 'زين العراق', fa: 'زین عراق', en: 'Zain Iraq' }, color: '#2b2f36', mono: 'ZN', logo: '' },
      korek: { n: { ar: 'كورك', fa: 'کورک', en: 'Korek' }, color: '#0a8f6a', mono: 'KR', logo: '' },
      otherIQ: { n: { ar: 'مشغّل عراقي آخر', fa: 'سایر اپراتورهای عراق', en: 'Other Iraqi operator' }, color: '#5b6572', mono: '?', logo: '' }
    };
    const COUNTRIES = {
      IR: { n: { ar: 'إيران', fa: 'ایران', en: 'Iran' }, cur: 'IRT', curName: { ar: 'التومان الإيراني', fa: 'تومان ایران', en: 'Iranian toman' }, curShort: { ar: 'تومان', fa: 'تومان', en: 'toman' },
        presets: [50000, 100000, 150000, 200000], ops: ['mci', 'irancell', 'rightel', 'shatel', 'taliya', 'otherIR'], other: 'otherIR' },
      IQ: { n: { ar: 'العراق', fa: 'عراق', en: 'Iraq' }, cur: 'IQD', curName: { ar: 'الدينار العراقي (IQD)', fa: 'دینار عراقی (IQD)', en: 'Iraqi dinar (IQD)' }, curShort: { ar: 'د.ع', fa: 'دینار', en: 'IQD' },
        presets: [5000, 10000, 15000, 25000, 30000, 40000, 50000, 100000], ops: ['asiacell', 'zain', 'korek', 'otherIQ'], other: 'otherIQ' }
    };
    // National-format prefixes (leading 0). Longest match wins. Based on the commonly published numbering plans; because of number
    // portability and re-allocations the result is only a LIKELY operator — verify against CRA (Iran) / CMC (Iraq) before relying on it.
    const PREFIXES = {
      IR: { '091': 'mci', '0990': 'mci', '0991': 'mci', '0994': 'mci',
        '0930': 'irancell', '0933': 'irancell', '0935': 'irancell', '0936': 'irancell', '0937': 'irancell', '0938': 'irancell', '0939': 'irancell',
        '0901': 'irancell', '0902': 'irancell', '0903': 'irancell', '0904': 'irancell', '0905': 'irancell', '0941': 'irancell',
        '0920': 'rightel', '0921': 'rightel', '0922': 'rightel', '0998': 'shatel', '0932': 'taliya',
        '0931': 'otherIR', '0934': 'otherIR', '0999': 'otherIR' },
      IQ: { '077': 'asiacell', '078': 'zain', '079': 'zain', '075': 'korek', '074': 'otherIQ' }
    };
    // Supplier-verified data. EMPTY on purpose: no supplier API / denomination table has been provided, so nothing is "verified".
    // Shape when you get one:  VERIFIED.asiacell = { amounts: [5000, 10000], custom: { min: 5000, max: 200000, step: 1000 } /* or null */ };
    const VERIFIED = {};
    const FEES = null; // verified fees/taxes, e.g. { IQ: { fee: 0 }, ... } — null = unknown.

    const RT = {
      phone: { ar: 'رقم الهاتف المحمول', fa: 'شماره موبایل', en: 'Mobile number' },
      phoneHint: { ar: 'محلي أو دولي: 07xx… / +964 7xx… / 09xx… / +98 9xx…', fa: 'محلی یا بین‌المللی: 09xx… / +98 9xx… / 07xx… / +964 7xx…', en: 'Local or international: 07xx… / +964 7xx… / 09xx… / +98 9xx…' },
      country: { ar: 'الدولة', fa: 'کشور', en: 'Country' },
      operator: { ar: 'المشغّل', fa: 'اپراتور', en: 'Operator' },
      opChoose: { ar: 'اختر المشغّل', fa: 'اپراتور را انتخاب کنید', en: 'Choose operator' },
      opAuto: { ar: 'تم التعرّف عليه تلقائيًا من البادئة (محتمل — غير مؤكَّد، يمكنك التصحيح)', fa: 'به‌صورت خودکار از پیش‌شماره تشخیص داده شد (احتمالی، تأییدنشده — می‌توانید اصلاح کنید)', en: 'Auto-detected from the prefix (likely, not verified — you can correct it)' },
      opManual: { ar: 'اختيار يدوي', fa: 'انتخاب دستی', en: 'Selected manually' },
      opUnknown: { ar: 'تعذّر تحديد المشغّل من البادئة — اختره يدويًا', fa: 'اپراتور از روی پیش‌شماره مشخص نشد — دستی انتخاب کنید', en: 'Operator not recognised from the prefix — please choose it' },
      opPending: { ar: 'أكمل إدخال البادئة لتحديد المشغّل', fa: 'برای تشخیص اپراتور پیش‌شماره را کامل کنید', en: 'Keep typing the prefix to detect the operator' },
      currency: { ar: 'العملة', fa: 'واحد پول', en: 'Currency' },
      amount: { ar: 'مبلغ الشحن', fa: 'مبلغ شارژ', en: 'Recharge amount' },
      other: { ar: 'مبلغ آخر', fa: 'مبلغ دلخواه', en: 'Other amount' },
      otherLabel: { ar: 'أدخل المبلغ (أرقام فقط)', fa: 'مبلغ را وارد کنید (فقط عدد)', en: 'Enter amount (digits only)' },
      amtNote: { ar: 'هذه المبالغ خيارات واجهة فقط؛ لم يؤكّد أي مورّد توفّرها لدى هذا المشغّل.', fa: 'این مبالغ فقط گزینه‌های رابط کاربری هستند؛ هیچ تأمین‌کننده‌ای موجود بودن آن‌ها را برای این اپراتور تأیید نکرده است.', en: 'These amounts are interface options only; no supplier has confirmed they are available for this operator.' },
      amtPick: { ar: 'أدخل رقمًا صحيحًا لعرض المبالغ', fa: 'برای نمایش مبالغ شماره را وارد کنید', en: 'Enter a number to see the amounts' },
      notAvail: { ar: 'غير متاح', fa: 'ناموجود', en: 'Not available' },
      custUnverified: { ar: 'مبلغ غير مؤكَّد من المورّد — للمعاينة فقط.', fa: 'مبلغ توسط تأمین‌کننده تأیید نشده — فقط پیش‌نمایش.', en: 'Amount not confirmed by a supplier — preview only.' },
      svcType: { ar: 'نوع الخدمة', fa: 'نوع سرویس', en: 'Service type' },
      svcVal: { ar: 'شحن رصيد الهاتف (SIM)', fa: 'شارژ سیم‌کارت', en: 'Mobile SIM top-up' },
      fees: { ar: 'الرسوم والضرائب', fa: 'کارمزد و مالیات', en: 'Fees & taxes' },
      feesUnknown: { ar: 'غير مؤكَّدة', fa: 'تأیید نشده', en: 'Not confirmed' },
      total: { ar: 'المبلغ النهائي', fa: 'مبلغ نهایی', en: 'Final amount' },
      totalUnknown: { ar: 'لم يُؤكَّد المبلغ النهائي بعد', fa: 'مبلغ نهایی هنوز تأیید نشده', en: 'Final amount not confirmed yet' },
      preview: { ar: 'معاينة الشحن', fa: 'پیش‌نمایش شارژ', en: 'Recharge preview' },
      previewOnly: { ar: 'معاينة فقط — لا يتم أي شحن أو دفع أو خصم من المحفظة.', fa: 'فقط پیش‌نمایش — هیچ شارژ، پرداخت یا کسر از کیف پول انجام نمی‌شود.', en: 'Preview only — no recharge, payment or wallet deduction is made.' },
      unavailBtn: { ar: 'الشحن الفعلي غير متاح بعد', fa: 'شارژ واقعی هنوز فعال نیست', en: 'Real recharge not available yet' },
      mismatch: { ar: 'تم تحديد العملة تلقائيًا حسب بلد الرقم ولا يمكن تغييرها.', fa: 'واحد پول به‌صورت خودکار بر اساس کشور شماره تعیین می‌شود و قابل تغییر نیست.', en: 'The currency is set automatically from the number’s country and cannot be changed.' },
      likely: { ar: 'محتمل، غير مؤكَّد', fa: 'احتمالی، تأییدنشده', en: 'likely, not verified' },
      detected: { ar: 'تم التعرّف', fa: 'تشخیص داده شد', en: 'Detected' },
      // errors
      phoneEmpty: { ar: 'أدخل رقم الهاتف', fa: 'شماره موبایل را وارد کنید', en: 'Enter the mobile number' },
      phoneChars: { ar: 'يُسمح بالأرقام فقط (مع + أو 00 في البداية)', fa: 'فقط عدد مجاز است (با + یا 00 در ابتدا)', en: 'Digits only are allowed (optionally starting with + or 00)' },
      phoneUnknown: { ar: 'الرقم ليس رقم جوال إيرانيًا (09…/+98) ولا عراقيًا (07…/+964)', fa: 'شماره، موبایل ایران (09…/‎+98) یا عراق (07…/‎+964) نیست', en: 'Not an Iranian (09… / +98) or Iraqi (07… / +964) mobile number' },
      phoneShort: { ar: 'الرقم غير مكتمل (يجب 11 رقمًا بالصيغة المحلية)', fa: 'شماره کامل نیست (در قالب محلی باید ۱۱ رقم باشد)', en: 'Number is incomplete (11 digits in local format)' },
      phoneLong: { ar: 'الرقم أطول من المسموح', fa: 'شماره بلندتر از حد مجاز است', en: 'Number is too long' },
      opRequired: { ar: 'اختر المشغّل', fa: 'اپراتور را انتخاب کنید', en: 'Choose the operator' },
      amtChoose: { ar: 'اختر مبلغًا', fa: 'یک مبلغ انتخاب کنید', en: 'Choose an amount' },
      amtEmpty: { ar: 'أدخل المبلغ', fa: 'مبلغ را وارد کنید', en: 'Enter an amount' },
      amtNegative: { ar: 'لا يُقبل مبلغ سالب', fa: 'مبلغ منفی پذیرفته نیست', en: 'Negative amounts are not accepted' },
      amtZero: { ar: 'يجب أن يكون المبلغ أكبر من صفر', fa: 'مبلغ باید بیشتر از صفر باشد', en: 'The amount must be greater than zero' },
      amtFraction: { ar: 'لا تُقبل الكسور — أدخل عددًا صحيحًا', fa: 'اعشار پذیرفته نیست — عدد صحیح وارد کنید', en: 'Fractions are not accepted — enter a whole number' },
      amtNonNumeric: { ar: 'أدخل أرقامًا فقط (عربية أو فارسية أو إنجليزية)', fa: 'فقط عدد وارد کنید (عربی، فارسی یا انگلیسی)', en: 'Enter digits only (Arabic, Persian or English)' },
      amtNotAllowed: { ar: 'هذا المبلغ غير مسموح به لهذا المشغّل حسب جدول المورّد', fa: 'این مبلغ طبق جدول تأمین‌کننده برای این اپراتور مجاز نیست', en: 'This amount is not allowed for this operator according to the supplier table' },
      amtAbove: { ar: (m, c) => 'المبلغ أعلى من الحد المعروض (' + m + ' ' + c + '). المبالغ الأعلى تُقبل فقط إذا أكّدها المورّد.', fa: (m, c) => 'مبلغ بیشتر از سقف نمایش‌داده‌شده (' + m + ' ' + c + ') است. مبالغ بالاتر فقط با تأیید تأمین‌کننده پذیرفته می‌شود.', en: (m, c) => 'Above the listed maximum (' + m + ' ' + c + '). Higher amounts are accepted only if a supplier confirms them.' },
      amtStep: { ar: (s, c) => 'يجب أن يكون المبلغ من مضاعفات ' + s + ' ' + c, fa: (s, c) => 'مبلغ باید مضربی از ' + s + ' ' + c + ' باشد', en: (s, c) => 'The amount must be a multiple of ' + s + ' ' + c },
      amtRange: { ar: (a, b, c) => 'المبلغ المسموح بين ' + a + ' و ' + b + ' ' + c, fa: (a, b, c) => 'مبلغ مجاز بین ' + a + ' و ' + b + ' ' + c + ' است', en: (a, b, c) => 'Allowed range is ' + a + ' to ' + b + ' ' + c }
    };
    const tx = (k, ...a) => { const e = RT[k]; const v = e && (e[S.lang] || e.en); return typeof v === 'function' ? v(...a) : v; };
    const nm = o => o[S.lang] || o.en;

    const norm = s => String(s == null ? '' : s).replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x06F0);
    const lookup = (c, nat) => { let best = '', id = null; for (const k of Object.keys(PREFIXES[c])) if (nat.startsWith(k) && k.length > best.length) { best = k; id = PREFIXES[c][k]; } return id; };

    function analyze(raw) {
      let s = norm(raw).replace(/[\s\-().,\u200c\u200e\u200f\u066c]/g, '');
      if (!s) return { status: 'empty', err: 'phoneEmpty' };
      let intl = false;
      if (s[0] === '+') { intl = true; s = s.slice(1); } else if (s.startsWith('00')) { intl = true; s = s.slice(2); }
      if (/\D/.test(s)) return { status: 'invalid', err: 'phoneChars' };
      let c = null, nsn = '';
      if (intl) {
        if (s.startsWith('964')) { c = 'IQ'; nsn = s.slice(3); }
        else if (s.startsWith('98')) { c = 'IR'; nsn = s.slice(2); }
        else if (s === '' || '964'.startsWith(s) || '98'.startsWith(s)) return { status: 'partial', err: 'phoneShort' };
        else return { status: 'invalid', err: 'phoneUnknown' };
        if (nsn[0] === '0') nsn = nsn.slice(1);
      } else if (s[0] === '0') {
        nsn = s.slice(1);
        if (!nsn) return { status: 'partial', err: 'phoneShort' };
        c = nsn[0] === '9' ? 'IR' : nsn[0] === '7' ? 'IQ' : null;
        if (!c) return { status: 'invalid', err: 'phoneUnknown' };
      } else if (s.startsWith('964')) { c = 'IQ'; nsn = s.slice(3); }
      else if (s.startsWith('98')) { c = 'IR'; nsn = s.slice(2); }
      else if (s === '96') return { status: 'partial', err: 'phoneShort' };
      else if (s[0] === '9') { c = 'IR'; nsn = s; }
      else if (s[0] === '7') { c = 'IQ'; nsn = s; }
      else return { status: 'invalid', err: 'phoneUnknown' };
      if (nsn && nsn[0] !== (c === 'IR' ? '9' : '7')) return { status: 'invalid', err: 'phoneUnknown' };
      if (nsn.length > 10) return { status: 'invalid', country: c, err: 'phoneLong' };
      const national = nsn ? '0' + nsn : '';
      const opId = national ? lookup(c, national) : null;
      return { status: nsn.length === 10 ? 'ok' : 'partial', err: nsn.length === 10 ? null : 'phoneShort', country: c, national, opId };
    }
    function fmtPhone(a) { const n = a.national.slice(1), cc = a.country === 'IR' ? '+98 ' : '+964 '; return cc + n.slice(0, 3) + ' ' + n.slice(3, 6) + ' ' + n.slice(6); }
    const verifiedFor = opId => (opId && VERIFIED[opId]) || null;
    const presetOk = (opId, v) => { const e = verifiedFor(opId); return !e || !e.amounts || e.amounts.includes(v); };

    function validateAmount(raw, country, opId) {
      const C = COUNTRIES[country], cur = nm(C.curShort), fmtN = v => num(String(v));
      let s = norm(raw).replace(/[\s,\u066c\u200c\u200e\u200f]/g, '');
      if (!s) return { ok: false, err: 'amtEmpty' };
      if (/^[-\u2212]/.test(s)) return { ok: false, err: 'amtNegative' };
      if (/^\d*[.\u066b]\d*$/.test(s) && /\d/.test(s)) return { ok: false, err: 'amtFraction' };
      if (!/^\d+$/.test(s)) return { ok: false, err: 'amtNonNumeric' };
      const v = Number(s);
      if (v === 0) return { ok: false, err: 'amtZero' };
      if (!Number.isSafeInteger(v)) return { ok: false, err: 'amtNonNumeric' };
      const e = verifiedFor(opId), max = Math.max(...C.presets);
      if (e) {
        const cu = e.custom;
        if (cu) {
          if (v < cu.min || v > cu.max) return { ok: false, msg: tx('amtRange', fmtN(cu.min), fmtN(cu.max), cur) };
          if (cu.step && v % cu.step) return { ok: false, msg: tx('amtStep', fmtN(cu.step), cur) };
        } else if (!(e.amounts || []).includes(v)) return { ok: false, err: 'amtNotAllowed' };
        return { ok: true, value: v, verified: true };
      }
      if (v > max) return { ok: false, msg: tx('amtAbove', fmtN(max), cur) };
      return { ok: true, value: v, verified: false };
    }
    return { OPS, COUNTRIES, PREFIXES, VERIFIED, FEES, tx, nm, analyze, fmtPhone, validateAmount, presetOk, verifiedFor,
      is: (svc, spec) => { const a = Array.from(spec || ''); return (a.includes('h') && a.includes('k')) || /^(recharge|topup|top-up|sim)/i.test(String(svc)); } };
  })();
  (function injectRcCss() {
    if (document.getElementById('miri-recharge-css')) return;
    const c = document.createElement('style'); c.id = 'miri-recharge-css';
    c.textContent = '.rc .rc-det{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin:.5rem 0;padding:.6rem .75rem;border:1px solid rgba(128,128,128,.35);border-radius:12px}'
      + '.rc .rc-logo{width:44px;height:44px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.8rem;flex:none;object-fit:contain}'
      + '.rc .rc-detv{flex:1;min-width:150px}.rc .rc-detv div{margin:.1rem 0}'
      + '.rc .rc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:.5rem;margin:.4rem 0}'
      + '.rc .rc-amt{min-height:48px;padding:.5rem .4rem;border:2px solid rgba(128,128,128,.4);border-radius:12px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:center;line-height:1.25}'
      + '.rc .rc-amt small{display:block;opacity:.75;font-size:.75em}'
      + '.rc .rc-amt[aria-checked=true]{border-color:#0a7d3b;box-shadow:0 0 0 2px rgba(10,125,59,.25);font-weight:700}'
      + '.rc .rc-amt:disabled{opacity:.45;cursor:not-allowed;text-decoration:line-through}'
      + '.rc .rc-msg{margin:.25rem 0;font-size:.9em}.rc .rc-warn{color:#b45f00}.rc [aria-invalid=true]{border-color:#c0261f}'
      + '.rc .rc-prev{margin-top:.75rem;padding:.6rem .75rem;border:1px dashed rgba(128,128,128,.5);border-radius:12px}'
      + '.rc .rc-prev h3{margin:.1rem 0 .4rem;font-size:1rem}';
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
    const isRecharge = RC.is(service, MI.SERVICES.find(x => x.id === service).spec);
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
    // ---- Mobile Recharge step UI (preview only; no financial action is ever started from here) ----
    function rechargeStep(body, s) {
      const rc = st.rc || (st.rc = { raw: '', manualOp: null, sel: null, customRaw: '', lastCountry: '', lastDet: null, showErr: false });
      const cur = C => RC.nm(C.curShort), errMsg = r => r.msg || RC.tx(r.err), vis = (n, on) => { n.style.display = on ? '' : 'none'; };
      const getState = () => {
        const a = RC.analyze(rc.raw), C = a.country ? RC.COUNTRIES[a.country] : null, op = C ? (rc.manualOp || a.opId || '') : '';
        let amt = null;
        if (C && rc.sel === 'custom') amt = RC.validateAmount(rc.customRaw, a.country, op);
        else if (C && rc.sel) { const v = Number(rc.sel); amt = RC.presetOk(op, v) ? { ok: true, value: v, verified: !!RC.verifiedFor(op) } : { ok: false, err: 'amtNotAllowed' }; }
        return { a, C, op, amt };
      };
      const logoNode = op => {
        const o = op && RC.OPS[op];
        if (o && o.logo) { const i = el('img', undefined, 'rc-logo', { alt: RC.nm(o.n), src: o.logo }); return i; }
        const b = el('span', o ? o.mono : '📱', 'rc-logo', { 'aria-hidden': 'true' }); b.style.background = o ? o.color : '#5b6572'; return b;
      };
      function previewNode(g) {
        const { a, C, op, amt } = g, d = el('dl', undefined, 'sum');
        const row = (k, v, ltr) => d.append(el('dt', k), el('dd', v, '', ltr ? { dir: 'ltr' } : undefined));
        row(RC.tx('phone'), a.status === 'ok' ? RC.fmtPhone(a) : '-', true);
        row(RC.tx('country'), C ? RC.nm(C.n) : '-');
        row(RC.tx('operator'), op ? RC.nm(RC.OPS[op].n) + ' — ' + (rc.manualOp ? RC.tx('opManual') : RC.tx('detected') + ' (' + RC.tx('likely') + ')') : '-');
        row(RC.tx('amount'), amt && amt.ok ? num(String(amt.value)) + ' ' + cur(C) + (amt.verified ? '' : ' *') : '-');
        row(RC.tx('currency'), C ? RC.nm(C.curName) : '-');
        row(RC.tx('svcType'), RC.tx('svcVal'));
        row(RC.tx('fees'), RC.FEES ? '-' : RC.tx('feesUnknown'));
        row(RC.tx('total'), RC.tx('totalUnknown'));
        return d;
      }
      if (s === 'review') {
        const g = getState();
        if (g.a.status !== 'ok' || !g.op || !(g.amt && g.amt.ok)) { st.i = 0; draw(); return; }
        body.append(el('h2', t('reviewTitle')), previewNode(g));
        if (!g.amt.verified) body.append(el('p', '* ' + RC.tx('custUnverified'), 'note warn'));
        body.append(el('p', RC.tx('previewOnly'), 'note warn'));
        const n = nav(null), b = el('button', RC.tx('unavailBtn'), 'cta'); b.type = 'button'; b.disabled = true; n.append(b); body.append(n); return;
      }
      const root = el('div', undefined, 'rc');
      const fp = el('div', undefined, 'field'), lp = el('label', RC.tx('phone')), ip = el('input');
      ip.id = 'rc_phone'; ip.type = 'tel'; ip.inputMode = 'tel'; ip.autocomplete = 'tel'; ip.dir = 'ltr'; ip.placeholder = '07xx xxx xxxx | 09xx xxx xxxx'; ip.value = rc.raw; lp.htmlFor = ip.id; ip.setAttribute('aria-describedby', 'rc_phone_err');
      const ep = el('p', '', 'err', { 'aria-live': 'polite', id: 'rc_phone_err' });
      fp.append(lp, ip, el('p', RC.tx('phoneHint'), 'apt-hint'), ep);
      const det = el('div', undefined, 'rc-det'), logoHost = el('span'), dv = el('div', undefined, 'rc-detv'), dCountry = el('div'), dCur = el('div');
      dv.append(dCountry, dCur); det.append(logoHost, dv);
      const opWrap = el('div', undefined, 'field'), ol = el('label', RC.tx('operator')), osel = el('select'), onote = el('p', '', 'apt-hint', { 'aria-live': 'polite' }), eop = el('p', '', 'err', { 'aria-live': 'polite' });
      osel.id = 'rc_op'; ol.htmlFor = osel.id; opWrap.append(ol, osel, onote, eop);
      const amtHead = el('strong', RC.tx('amount')), grid = el('div', undefined, 'rc-grid', { role: 'radiogroup', 'aria-label': RC.tx('amount') }), amtNote = el('p', RC.tx('amtNote'), 'apt-hint');
      const cw = el('div', undefined, 'field'), cl = el('label', RC.tx('otherLabel')), ci = el('input'), cmsg = el('p', '', 'rc-msg rc-warn', { 'aria-live': 'polite' });
      ci.id = 'rc_custom'; ci.type = 'text'; ci.inputMode = 'numeric'; ci.autocomplete = 'off'; ci.dir = 'ltr'; ci.value = rc.customRaw; cl.htmlFor = ci.id; cw.append(cl, ci, cmsg);
      const eamt = el('p', '', 'err', { 'aria-live': 'polite' }), prev = el('div', undefined, 'rc-prev');
      root.append(fp, det, opWrap, amtHead, grid, amtNote, cw, eamt, prev); body.append(root);
      let optsFor = null, gridKey = null, btns = [];

      function update() {
        let g = getState();
        const ck = g.a.country || '';
        if (ck !== rc.lastCountry) { rc.sel = null; rc.customRaw = ''; rc.manualOp = null; rc.lastCountry = ck; ci.value = ''; g = getState(); } // new country: old amount/currency/operator choice is dropped
        if ((g.a.opId || null) !== rc.lastDet) { rc.lastDet = g.a.opId || null; if (rc.manualOp) { rc.manualOp = null; g = getState(); } }
        const { a, C, op } = g, defin = ['phoneChars', 'phoneUnknown', 'phoneLong'].includes(a.err);
        const pe = a.status !== 'ok' && (defin || rc.showErr) ? RC.tx(a.err) : '';
        ep.textContent = pe; if (pe) ip.setAttribute('aria-invalid', 'true'); else ip.removeAttribute('aria-invalid');
        [det, opWrap, amtHead, grid, amtNote, prev].forEach(n => vis(n, !!C));
        if (!C) { vis(cw, false); eamt.textContent = ''; return; }
        dCountry.textContent = RC.tx('country') + ': ' + RC.nm(C.n); dCur.textContent = RC.tx('currency') + ': ' + RC.nm(C.curName);
        logoHost.replaceChildren(logoNode(op));
        if (optsFor !== ck) { optsFor = ck; osel.replaceChildren(); [['', RC.tx('opChoose')], ...C.ops.map(id => [id, RC.nm(RC.OPS[id].n)])].forEach(([v, l]) => { const o = el('option', l); o.value = v; osel.append(o); }); }
        osel.value = op;
        const pre = Math.max(0, (a.national || '').length) >= (a.country === 'IR' ? 4 : 3);
        onote.textContent = rc.manualOp ? RC.tx('opManual') : a.opId ? RC.tx('opAuto') : pre ? RC.tx('opUnknown') : RC.tx('opPending');
        const oe = rc.showErr && !op ? RC.tx('opRequired') : ''; eop.textContent = oe; if (oe) osel.setAttribute('aria-invalid', 'true'); else osel.removeAttribute('aria-invalid');
        if (gridKey !== ck + '|' + op) {
          gridKey = ck + '|' + op; grid.replaceChildren(); btns = [];
          const mk = (v, label, sub, off) => {
            const b = el('button', undefined, 'rc-amt', { role: 'radio' }); b.type = 'button'; b.dataset.v = v; b.disabled = !!off;
            b.append(document.createTextNode(label)); if (sub) b.append(el('small', sub));
            b.onclick = () => { rc.sel = v; update(); if (v === 'custom') ci.focus(); }; grid.append(b); btns.push(b);
          };
          C.presets.forEach(v => mk(String(v), num(String(v)), RC.presetOk(op, v) ? cur(C) : RC.tx('notAvail'), !RC.presetOk(op, v)));
          mk('custom', RC.tx('other'), '', false);
        }
        btns.forEach(b => b.setAttribute('aria-checked', String(rc.sel === b.dataset.v)));
        vis(cw, rc.sel === 'custom');
        if (rc.sel === 'custom') ci.placeholder = RC.nm(C.curShort);
        let em = '';
        if (!rc.sel) em = rc.showErr ? RC.tx('amtChoose') : '';
        else if (rc.sel === 'custom') em = !g.amt.ok && (rc.showErr || rc.customRaw.trim()) ? errMsg(g.amt) : '';
        else if (!g.amt.ok) em = errMsg(g.amt);
        eamt.textContent = em; if (em && rc.sel === 'custom') ci.setAttribute('aria-invalid', 'true'); else ci.removeAttribute('aria-invalid');
        cmsg.textContent = rc.sel === 'custom' && g.amt.ok && !g.amt.verified ? RC.tx('custUnverified') : '';
        prev.replaceChildren(el('h3', RC.tx('preview')), previewNode(g), el('p', (g.amt && g.amt.ok && !g.amt.verified ? '* ' + RC.tx('custUnverified') + ' ' : '') + RC.tx('previewOnly'), 'rc-msg rc-warn'));
      }
      ip.oninput = () => { rc.raw = ip.value; update(); };
      ci.oninput = () => { rc.customRaw = ci.value; update(); };
      osel.onchange = () => { const a = RC.analyze(rc.raw); rc.manualOp = osel.value && osel.value !== a.opId ? osel.value : null; update(); };
      update();
      body.append(nav(() => {
        rc.showErr = true; update();
        const g = getState();
        if (g.a.status !== 'ok') { ip.focus(); return; }
        if (!g.op) { osel.focus(); return; }
        if (!g.amt || !g.amt.ok) { (rc.sel === 'custom' ? ci : btns[0]).focus(); return; }
        st.errs = {}; st.i++; draw();
      }, t('next')));
    }
    function draw() {
      (st.combos || []).forEach(c => c.destroy()); st.combos = [];
      box.replaceChildren(progress());
      const s = steps[st.i], body = el('section', undefined, 'step');
      box.append(body);
      if (isRecharge && (s === 'search' || s === 'form' || s === 'review')) { rechargeStep(body, s); return; }
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
  window.Wizard = { run, defs, check, recharge: RC };
})();
