const $ = id => document.getElementById(id);
const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const link = (label, url) => { const a = make('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
const empty = text => make('div', 'empty', text);
let state, stream, workerSignature = '', reviewSignature = '', tab = 'live';
const elapsed = at => { if (!at) return 'Starting'; const seconds = Math.max(0, (Date.now() - new Date(at)) / 1000); return seconds < 60 ? `${Math.floor(seconds)}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`; };
async function api(path, payload) {
  const res = await fetch(path, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {});
  const data = await res.json(); if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status }); return data;
}
function showTab(value) {
  tab = value; for (const name of ['live', 'decisions', 'finished']) $(`${name}-view`).hidden = name !== value;
  for (const button of document.querySelectorAll('[data-tab]')) button.classList.toggle('selected', button.dataset.tab === value);
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));
function renderWorker(task, i) {
  const card = make('article', 'worker'); const top = make('div', 'worker-top');
  top.append(make('span', '', `WORKER ${String(i + 1).padStart(2, '0')}`), make('span', task.status === 'working' ? 'badge' : 'badge warn', task.status === 'working' ? '● Working' : 'Needs attention'));
  card.append(top, make('h3', '', task.title), make('p', '', task.activity.message || task.activity.action || 'The session is active. Waiting for its next progress update.'));
  const bottom = make('div', 'worker-bottom'); const duration = make('span', 'elapsed'); duration.dataset.started = task.startedAt || '';
  bottom.append(make('span', '', task.activity.action || 'Task in progress'), duration); card.append(bottom); return card;
}
function taskRow(task) {
  const row = make('div', 'row'), title = make('div', 'row-title', task.title);
  title.append(make('small', '', task.status === 'queued' ? 'Ready for an available worker' : task.exitCode === 0 ? 'Session ended; PR checks determine completion' : `Session exited ${task.exitCode ?? 'without a result'}`));
  row.append(title, make('span', '', task.endedAt ? `${elapsed(task.endedAt)} ago` : 'Queued')); return row;
}
function cleanSummary(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^#{1,6}\s*(What|Changes|Evidence|Checklist|Closes|Affects)\s*$/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 650);
}
function reviewCard(pr) {
  const card = make('article', 'review'); card.dataset.id = pr.id;
  const preview = make('div', 'preview'), main = make('div', 'media-main'), picker = make('div', 'media-picker'), download = link('Download original', '#'); download.className = 'download';
  const selectMedia = (item, index) => {
    main.replaceChildren(); const media = make(item.type === 'video' ? 'video' : 'img'); media.src = item.url;
    if (item.type === 'video') { media.controls = true; media.preload = 'metadata'; media.playsInline = true; } else { media.alt = item.label; media.loading = 'lazy'; }
    main.append(media); download.href = item.url; download.textContent = `↓ Download ${item.type === 'video' ? 'clip' : 'still'}`;
    [...picker.children].forEach((b, i) => b.classList.toggle('chosen', i === index));
  };
  if (pr.media.length) {
    pr.media.forEach((item, i) => { const button = make('button', '', `${item.type === 'video' ? '▶ ' : ''}${item.label}`); button.addEventListener('click', () => selectMedia(item, i)); picker.append(button); });
    selectMedia(pr.media[0], 0);
  } else { main.append(make('p', '', 'No preview media attached yet.\nOpen the PR to inspect its evidence before approving.')); download.hidden = true; }
  preview.append(main, picker, download);
  const content = make('div', 'review-content'), meta = make('div', 'review-meta');
  meta.append(make('span', 'badge warn', 'Your decision'), link(`#${pr.number}`, pr.url), make('code', '', pr.head.slice(0, 7)));
  const details = make('details'), full = make('pre', '', pr.body); details.append(make('summary', '', 'Full description and recent notes'), full);
  for (const comment of pr.comments) details.append(make('pre', '', comment.body));
  const checks = make('div', 'check-list'); for (const check of pr.checks) checks.append(make('span', /FAILURE|ERROR|CANCELLED/.test(check.state) ? 'failed' : check.state === 'SUCCESS' ? 'passed' : '', `${check.name}: ${check.state.toLowerCase()}`));
  const inputId = `notes-${pr.repo.replaceAll('/', '-')}-${pr.number}`, label = make('label', '', 'Your notes'), notes = make('textarea'); label.htmlFor = inputId; notes.id = inputId; notes.placeholder = 'What works? What should change?';
  const draftKey = `loop-notes:${pr.id}:${pr.head}`;
  notes.value = localStorage.getItem(draftKey) || ''; notes.addEventListener('input', () => localStorage.setItem(draftKey, notes.value));
  const actions = make('div', 'actions'), status = make('div', 'send-status'); status.setAttribute('role', 'status');
  for (const [action, title, cls] of [['ship', 'Approve & ship', 'primary'], ['revise', 'Request changes', 'secondary'], ['hold', 'Keep on hold', '']]) {
    const button = make('button', cls, title);
    button.addEventListener('click', async () => {
      if (action !== 'ship' && !notes.value.trim()) { status.textContent = 'Add a note so the agent knows what to do.'; status.className = 'send-status error'; notes.focus(); return; }
      const buttons = [...actions.children]; buttons.forEach(b => b.disabled = true); status.className = 'send-status'; status.textContent = 'Sending your decision…';
      const requestKey = `loop-request:${pr.id}:${pr.head}`;
      const payload = { repo: pr.repo, number: pr.number, head: pr.head, action, notes: notes.value };
      let saved; try { saved = JSON.parse(localStorage.getItem(requestKey)); } catch { /* A malformed saved draft must not prevent a new submission. */ }
      const same = saved && JSON.stringify(saved.payload) === JSON.stringify(payload);
      const id = same ? saved.id : crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(requestKey, JSON.stringify({ id, payload }));
      try {
        const result = await api('/api/feedback', { ...payload, id }); status.replaceChildren(make('span', '', result.message + ' '), link('View comment', result.url));
        localStorage.removeItem(draftKey); localStorage.removeItem(requestKey);
      } catch (error) { status.textContent = error.message; status.className = 'send-status error'; }
      finally { buttons.forEach(b => b.disabled = false); }
    }); actions.append(button);
  }
  const last = state.feedback?.find(f => `${f.repo}#${f.number}` === pr.id && f.head === pr.head);
  if (last) status.textContent = `${last.action === 'ship' ? 'Approval' : last.action === 'revise' ? 'Revision request' : 'Hold'} sent ${elapsed(last.at)} ago. Waiting for the workflow to process it.`;
  content.append(meta, make('h3', '', pr.title), make('div', 'summary', cleanSummary(pr.body)), details, checks, label, notes, actions, status); card.append(preview, content); return card;
}
function render(next) {
  state = next; const queue = state.queue; const decisions = state.prs.filter(p => p.status === 'decision'); const merged = state.prs.filter(p => p.status === 'merged');
  $('active-count').textContent = queue.running.filter(t => t.status === 'working').length; $('live-badge').textContent = queue.running.length;
  $('queued-count').textContent = queue.pending.length; $('decision-count').textContent = decisions.length; $('decision-badge').textContent = decisions.length; $('merged-count').textContent = merged.length;
  $('overview').textContent = queue.paused ? 'The queue is paused. Existing work and your decisions are still here.' : `${queue.running.length} work item${queue.running.length === 1 ? ' is' : 's are'} in progress. ${decisions.length ? 'Your decisions are ready in the inbox.' : 'We will bring decisions here when work needs your eyes.'}`;
  const warnings = [state.githubError, state.queueError].filter(Boolean); $('notice').hidden = !warnings.length; $('notice').textContent = warnings.join(' ');
  const signature = JSON.stringify(queue.running);
  if (signature !== workerSignature) { workerSignature = signature; $('workers').replaceChildren(...(queue.running.length ? queue.running.map(renderWorker) : [empty('No active workers. The coordinator will pick up useful work as slots become available.')])); }
  $('pending').replaceChildren(...(queue.pending.length ? queue.pending.map(taskRow) : [empty('No tasks waiting. The coordinator checks the backlog automatically.')]));
  $('recent').replaceChildren(...(queue.recent.length ? queue.recent.slice(0, 5).map(taskRow) : [empty('Session results will appear here.')]));
  $('pending-label').textContent = `${queue.pending.length} queued`; $('coordinator').textContent = queue.coordinator || 'The coordinator is inspecting issues and PRs.';
  const reviewKey = JSON.stringify(decisions.map(p => [p.id, p.head, p.media, p.body]));
  if (reviewKey !== reviewSignature) { reviewSignature = reviewKey; $('decisions').replaceChildren(...(decisions.length ? decisions.map(reviewCard) : [empty('You are all caught up. Work needing your decision will appear here with its evidence.')])); }
  $('outcomes').replaceChildren(...state.prs.filter(p => p.status !== 'decision').map(pr => {
    const row = make('div', 'row'), title = make('div', 'row-title'); title.append(link(`#${pr.number} ${pr.title}`, pr.url), make('small', '', `${pr.repo.split('/').at(-1)} · ${pr.head.slice(0, 7)} · ${pr.checks.filter(c => c.state === 'SUCCESS').length}/${pr.checks.length} checks passed`));
    row.append(title, make('span', '', pr.status === 'merged' ? 'Merged ✓' : pr.checks.some(c => /FAILURE|ERROR/.test(c.state)) ? 'Checks need attention' : 'Waiting on checks')); return row;
  })); updateClocks();
}
function updateClocks() {
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  for (const el of document.querySelectorAll('[data-started]')) el.textContent = elapsed(el.dataset.started);
  if (state) $('github-age').textContent = state.githubAt ? `GitHub updated ${elapsed(state.githubAt)} ago` : 'Loading GitHub';
}
function connect() {
  stream?.close(); stream = new EventSource('/api/events');
  stream.onopen = () => { $('connection-dot').className = 'live'; $('connection-label').textContent = 'Live'; };
  stream.onmessage = event => render(JSON.parse(event.data));
  stream.onerror = () => { $('connection-dot').className = ''; $('connection-label').textContent = 'Reconnecting'; };
}
async function boot() {
  try { const data = await api('/api/state'); $('login').hidden = true; $('dashboard').hidden = false; render(data); connect(); }
  catch (error) { $('login').hidden = false; $('dashboard').hidden = true; if (error.status !== 401) $('login-error').textContent = error.message; }
}
$('login-form').addEventListener('submit', async event => { event.preventDefault(); try { await api('/api/session', { token: $('key').value }); $('key').value = ''; await boot(); } catch (error) { $('login-error').textContent = error.message; } });
const token = new URLSearchParams(location.hash.slice(1)).get('key');
if (token) { history.replaceState(null, '', location.pathname); try { await api('/api/session', { token }); } catch (error) { $('login-error').textContent = error.message; } }
setInterval(updateClocks, 1000); await boot();
