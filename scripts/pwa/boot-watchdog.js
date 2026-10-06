// Inlined into the build's index.html (scripts/vite-pwa.mjs). A page the worker served that has not
// reported ready after a few seconds, or reports a boot error, reloads itself: the worker counts the
// unconfirmed launch, so the first reload goes to the network and the second to the previous complete
// build. If the page still has not come up after that, a visible "Loading failed" card with a Retry
// button replaces the blank screen. Plain script, no dependency on the game's modules, which may be the
// thing that failed.
(function () {
  var sw = navigator.serviceWorker;
  if (!sw || !sw.controller) return;
  var WAIT_MS = 8000;
  var AUTO = 2;
  var KEY = 'hitl.bootRetries';
  var card = null;
  function failed() { return !window.__HITL_READY || !!window.__HITL_BOOT_ERROR; }
  function retries() { try { return Number(sessionStorage.getItem(KEY)) || 0; } catch (e) { return AUTO; } }
  function setRetries(n) { try { if (n) sessionStorage.setItem(KEY, String(n)); else sessionStorage.removeItem(KEY); } catch (e) { /* no storage: no automatic retry */ } }
  function show() {
    if (card || !document.body) return;
    card = document.createElement('div');
    card.id = 'hitl-boot-failed';
    card.setAttribute('role', 'alert');
    card.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#2a2630;color:#fffaf0;font:600 17px/1.3 system-ui,sans-serif;text-align:center;padding:24px';
    var msg = document.createElement('div');
    msg.textContent = 'Loading failed.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Retry';
    btn.style.cssText = 'min-height:48px;min-width:140px;border:0;border-radius:12px;background:#35c48b;color:#0c2b1f;font:inherit';
    btn.onclick = function () { location.reload(); };
    card.appendChild(msg);
    card.appendChild(btn);
    document.body.appendChild(card);
  }
  setTimeout(function () {
    if (!failed()) { setRetries(0); return; }
    if (retries() < AUTO) { setRetries(retries() + 1); location.reload(); return; }
    // A game that was only slow takes the card away once it is up.
    var poll = setInterval(function () {
      if (failed()) { show(); return; }
      if (card) { card.remove(); card = null; }
      setRetries(0);
      clearInterval(poll);
    }, 500);
  }, WAIT_MS);
})();
