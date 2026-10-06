// Inlined into the build's index.html (scripts/vite-pwa.mjs). It arms only on a page the worker answered
// from a downloaded set (the response carries a Server-Timing entry named hitl-set; scripts/pwa/
// sw.template.js). Such a page that has been visible for a few seconds without reporting ready, or that
// reports a boot error, tells the worker it stalled and reloads: the worker then serves the next load from
// the network, and the one after from the previous complete build. If the page still does not come up, a
// visible "Loading failed" card with a Retry button replaces the blank screen. Time spent hidden does not
// count, so a page left in the background never trips it. Plain script, no dependency on the game's
// modules, which may be the thing that failed.
(function () {
  var sw = navigator.serviceWorker;
  if (!sw || !sw.controller) return;
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  var timings = (nav && nav.serverTiming) || [];
  var armed = false;
  for (var i = 0; i < timings.length; i++) if (timings[i].name === 'hitl-set') armed = true;
  if (!armed) return;
  var WAIT_MS = 8000;
  var TICK_MS = 500;
  var AUTO = 2;
  var KEY = 'hitl.bootRetries';
  var card = null;
  var visible = 0;
  function failed() { return !window.__HITL_READY || !!window.__HITL_BOOT_ERROR; }
  function retries() { try { return Number(sessionStorage.getItem(KEY)) || 0; } catch (e) { return AUTO; } }
  function setRetries(n) { try { if (n) sessionStorage.setItem(KEY, String(n)); else sessionStorage.removeItem(KEY); } catch (e) { /* no storage: no automatic retry */ } }
  // The worker is told before the page goes: its answer, or a short wait, whichever comes first.
  function stalled(then) {
    var done = false;
    function go() { if (!done) { done = true; then(); } }
    try {
      var ch = new MessageChannel();
      ch.port1.onmessage = go;
      sw.controller.postMessage({ type: 'stalled' }, [ch.port2]);
    } catch (e) { go(); return; }
    setTimeout(go, 1500);
  }
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
    btn.onclick = function () { stalled(function () { location.reload(); }); };
    card.appendChild(msg);
    card.appendChild(btn);
    document.body.appendChild(card);
  }
  var tripped = false;
  var giveUp = false;
  var poll = setInterval(function () {
    if (!failed()) {
      if (card) { card.remove(); card = null; }
      setRetries(0);
      clearInterval(poll);
      return;
    }
    if (document.visibilityState === 'visible') visible += TICK_MS;
    if (giveUp) show();
    if (visible < WAIT_MS || tripped) return;
    tripped = true;
    if (retries() < AUTO) { setRetries(retries() + 1); stalled(function () { location.reload(); }); return; }
    stalled(function () { giveUp = true; show(); });
  }, TICK_MS);
})();
