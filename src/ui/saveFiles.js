// Saves as files: download a save's text, and pick a file to import. Loading and validation live in
// the save module (controls.importSave); this only moves text between the browser and the player.
import { h } from './dom.js';

// Bigger than any real save by far; stops a wrong pick (a video) from being read into memory.
export const MAX_SAVE_BYTES = 8 * 1024 * 1024;

export function saveFileName(name, id) {
  const safe = String(name ?? 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
  return `${safe}${id ? `-${id}` : ''}.hitl.json`;
}

// Saves the raw text through a temporary link; no dialog.
export function downloadSave(text, name, id) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: saveFileName(name, id) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Opens the file picker. Resolves { text } for a chosen file, { reason } when it can't be read, or
// null when the player closes the picker without choosing.
export function pickSaveFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.style.display = 'none';
    let done = false;
    const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) { finish(null); return; }
      if (f.size > MAX_SAVE_BYTES) { finish({ reason: 'That file is far too big to be a save' }); return; }
      f.text().then((text) => finish({ text }), () => finish({ reason: 'Could not read that file' }));
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}
