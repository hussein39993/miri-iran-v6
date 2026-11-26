'use strict';
// Diagnostic helper: if any script fails to load or throws, a red bar shows WHICH file and WHAT error.
// It only reads errors; it never changes how the site works. Safe to delete later.
(function () {
  const seen = new Set();
  function show(msg) {
    if (seen.has(msg) || seen.size > 4) return; seen.add(msg);
    const put = () => {
      let bar = document.getElementById('miri-diag');
      if (!bar) {
        bar = document.createElement('div'); bar.id = 'miri-diag'; bar.setAttribute('role', 'alert'); bar.dir = 'ltr';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#b00020;color:#fff;font:13px/1.4 monospace;padding:8px 12px;max-height:35vh;overflow:auto';
        const x = document.createElement('button'); x.type = 'button'; x.textContent = 'x'; x.style.cssText = 'float:right;margin-left:8px';
        x.onclick = () => bar.remove(); bar.append(x); document.body.append(bar);
      }
      const p = document.createElement('div'); p.textContent = msg; bar.append(p);
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  window.addEventListener('error', e => {
    const t = e.target;
    if (t && t !== window && t.tagName === 'SCRIPT') show('Script failed to load: ' + (t.getAttribute('src') || '?') + '  (file missing or wrong folder)');
    else if (e.message) show('JavaScript error: ' + e.message + (e.filename ? '  @ ' + e.filename.split('/').slice(-2).join('/') + ':' + e.lineno : ''));
  }, true);
  window.addEventListener('unhandledrejection', e => show('Unhandled promise error: ' + (e.reason && e.reason.message || e.reason)));
})();
