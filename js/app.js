'use strict';
// Router + language/theme. Business logic lives in core.js/providers.js; UI in wizard.js/views.js.
(function () {
  const { S, LANGS, t, el, svg, store } = UI;
  const NAV = [['home', 'nav_home', '#/home'], ['offers', 'nav_offers', '#/offers'], ['bookings', 'nav_bookings', '#/bookings'], ['wallet', 'nav_wallet', '#/s/wallet'], ['profile', 'nav_profile', '#/profile']];
  let cleanup = () => { };
  const saved = store.get('lang');
  S.lang = LANGS[saved] ? saved : 'ar';
  S.theme = store.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function route() {
    cleanup(); cleanup = () => { };
    const h = location.hash.replace(/^#\/?/, '') || 'home', [a, b] = h.split('/');
    const view = document.getElementById('view'); view.replaceChildren();
    if (a === 's') cleanup = Views.service(view, b) || cleanup;
    else if (Views[a] && a !== 'service') Views[a](view);
    else Views.home(view);
    document.querySelectorAll('.navbar a').forEach(x => x.toggleAttribute('aria-current', x.getAttribute('href') === '#/' + h));
    window.scrollTo(0, 0);
  }
  function chrome() {
    const L = LANGS[S.lang];
    document.documentElement.lang = S.lang; document.documentElement.dir = L.dir; document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.title = t('brand') + ' | ' + t('slogan'); document.getElementById('lang').value = S.lang;
    for (const id of ['bottom', 'deskNav']) {
      const nav = document.getElementById(id); nav.replaceChildren();
      NAV.forEach(([i, k, h]) => { const a = el('a'); a.href = h; a.append(svg(i), el('span', t(k))); nav.append(a); });
    }
  }
  document.getElementById('lang').onchange = e => { S.lang = e.target.value; store.set('lang', S.lang); chrome(); route(); };
  document.getElementById('themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; store.set('theme', S.theme); chrome(); };
  window.addEventListener('hashchange', route);
  chrome(); route();
})();
