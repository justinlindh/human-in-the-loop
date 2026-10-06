// The offline download's small status pill and the update prompt (see src/dev/pwa.js). Plain DOM, no
// dependency on the game's own UI, so it also shows over the title screen.
const CSS = `
#hitl-offline{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);transform:translateX(-50%);z-index:60;max-width:calc(100vw - 24px);pointer-events:none;font:600 13px/1.3 'Fredoka',system-ui,sans-serif;color:#fffaf0}
#hitl-offline .pill{display:none;background:#2a2630;border-radius:14px;padding:8px 12px;box-shadow:0 2px 10px rgba(0,0,0,.3);min-width:200px}
#hitl-offline .pill.on{display:block}
#hitl-offline .bar{height:4px;border-radius:2px;background:#4b4553;margin-top:6px;overflow:hidden}
#hitl-offline .bar i{display:block;height:100%;background:#35c48b;width:0}
#hitl-update{position:fixed;inset:0;z-index:70;display:none;align-items:flex-end;justify-content:center;padding:16px;background:rgba(42,38,48,.35);font:600 15px/1.35 'Fredoka',system-ui,sans-serif}
#hitl-update.on{display:flex}
#hitl-update .card{background:#fffaf0;color:#2a2630;border-radius:18px;padding:16px;max-width:360px;width:100%;box-shadow:0 6px 24px rgba(0,0,0,.35)}
#hitl-update .row{display:flex;gap:10px;margin-top:14px}
#hitl-update button{flex:1;min-height:44px;border:0;border-radius:12px;font:inherit;background:#e4d9c4;color:#2a2630}
#hitl-update button.go{background:#35c48b;color:#0c2b1f}
`;

const mb = (n) => `${Math.max(1, Math.round(n / 1e6))} MB`;

export function mountOfflineUi(offline, { doc = globalThis.document } = {}) {
  if (!doc?.body || doc.getElementById('hitl-offline')) return;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.append(style);
  const root = doc.createElement('div');
  root.id = 'hitl-offline';
  root.innerHTML = '<div class="pill" role="status"><span class="msg"></span><div class="bar"><i></i></div></div>';
  doc.body.append(root);
  const pill = root.querySelector('.pill');
  const msg = root.querySelector('.msg');
  const fill = root.querySelector('i');
  const prompt = doc.createElement('div');
  prompt.id = 'hitl-update';
  prompt.innerHTML = '<div class="card" role="dialog" aria-label="Update"><div>A new version is ready. Restart to update?</div><div class="row"><button class="later" type="button">Later</button><button class="go" type="button">Restart now</button></div></div>';
  doc.body.append(prompt);
  prompt.querySelector('.later').onclick = () => offline.dismissUpdate();
  prompt.querySelector('.go').onclick = () => offline.applyUpdate();

  let hideTimer = 0;
  const show = (text, pct) => {
    msg.textContent = text;
    fill.style.width = pct == null ? '0' : `${pct}%`;
    fill.parentElement.style.display = pct == null ? 'none' : '';
    pill.classList.add('on');
  };
  offline.subscribe((s) => {
    clearTimeout(hideTimer);
    prompt.classList.toggle('on', !!s.updateReady && s.state === 'ready');
    if (s.state === 'downloading') {
      const pct = s.total ? Math.min(100, Math.floor((s.done / s.total) * 100)) : 0;
      show(`${s.newVersion ? 'Downloading the update' : 'Downloading for offline'}: ${pct}% of ${mb(s.total)}`, pct);
    } else if (s.state === 'ready' && s.justFinished && !s.updateReady) {
      show('Ready to play offline', null);
      hideTimer = setTimeout(() => pill.classList.remove('on'), 5000);
    } else if (s.state === 'paused' || s.state === 'error') {
      show(s.error, null);
      hideTimer = setTimeout(() => pill.classList.remove('on'), 6000);
    } else pill.classList.remove('on');
  });
}
