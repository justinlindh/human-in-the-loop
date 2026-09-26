const $ = id => document.getElementById(id);
const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const link = (label, url) => { const a = make('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
const empty = text => make('div', 'empty', text);
let state, stream, reconnectTimer, workerSignature = '', tab = 'live';
const reviewViews = new Map();
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
  const working = task.status === 'working', last = task.activity.message || task.activity.action;
  top.append(make('span', '', `WORKER ${String(i + 1).padStart(2, '0')}`), make('span', working ? 'badge' : 'badge warn', working ? '● Working' : 'Interrupted'));
  card.append(top, make('h3', '', task.title), make('p', '', working ? last || 'The session is active. Waiting for its next progress update.' : last ? `Last reported: ${last}` : 'The session stopped without a completion result.'));
  const bottom = make('div', 'worker-bottom'); const duration = make('span', 'elapsed');
  if (working) duration.dataset.started = task.startedAt || '';
  else duration.textContent = task.updatedAt ? `Last update ${elapsed(task.updatedAt)} ago` : 'No recent update';
  bottom.append(make('span', '', working ? task.activity.action || 'Task in progress' : 'Worker is not running'), duration); card.append(bottom); return card;
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
  let selectedUrl, mediaKey;
  const selectMedia = (item, index) => {
    selectedUrl = item.url;
    main.replaceChildren(); const media = make(item.type === 'video' ? 'video' : 'img'); media.src = item.url;
    if (item.type === 'video') { media.controls = true; media.preload = 'metadata'; media.playsInline = true; } else { media.alt = item.label; media.loading = 'lazy'; }
    main.append(media); download.href = item.url; download.textContent = `↓ Download ${item.type === 'video' ? 'clip' : 'still'}`;
    [...picker.children].forEach((b, i) => b.classList.toggle('chosen', i === index));
  };
  const updateMedia = () => {
    const key = JSON.stringify(pr.media); if (key === mediaKey) return; mediaKey = key;
    picker.replaceChildren(...pr.media.map((item, i) => {
      const button = make('button', item.url === selectedUrl ? 'chosen' : '', `${item.type === 'video' ? '▶ ' : ''}${item.label}`);
      button.addEventListener('click', () => selectMedia(item, i)); return button;
    }));
    download.hidden = !pr.media.length;
    if (pr.media.length) {
      if (!pr.media.some(item => item.url === selectedUrl)) selectMedia(pr.media[0], 0);
    } else { selectedUrl = null; main.replaceChildren(make('p', '', 'No preview media attached yet.\nOpen the PR to inspect its evidence before approving.')); }
  };
  preview.append(main, picker, download);
  const content = make('div', 'review-content'), meta = make('div', 'review-meta');
  meta.append(make('span', 'badge warn', 'Your decision'), link(`#${pr.number}`, pr.url), make('code', '', pr.head.slice(0, 7)));
  const details = make('details'), full = make('pre'), comments = make('div'); details.append(make('summary', '', 'Full description and recent notes'), full, comments);
  const checks = make('div', 'check-list'), title = make('h3'), summary = make('div', 'summary');
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
  let detailKey, deliveryKey;
  const update = next => {
    pr = next; updateMedia();
    const key = JSON.stringify([pr.title, pr.body, pr.comments, pr.checks]);
    if (key !== detailKey) {
      detailKey = key; title.textContent = pr.title; full.textContent = pr.body; summary.textContent = cleanSummary(pr.body);
      comments.replaceChildren(...pr.comments.map(comment => make('pre', '', comment.body)));
      checks.replaceChildren(...pr.checks.map(check => make('span', /FAILURE|ERROR|CANCELLED/.test(check.state) ? 'failed' : check.state === 'SUCCESS' ? 'passed' : '', `${check.name}: ${check.state.toLowerCase()}`)));
    }
    const last = state.feedback?.find(f => `${f.repo}#${f.number}` === pr.id && f.head === pr.head);
    if (last && last.id !== deliveryKey) {
      deliveryKey = last.id; status.className = 'send-status';
      status.replaceChildren(make('span', '', `${last.action === 'ship' ? 'Approval' : last.action === 'revise' ? 'Revision request' : 'Hold'} sent. The workflow and checks control completion. `), link('View comment', last.url));
    }
  };
  content.append(meta, title, summary, details, checks, label, notes, actions, status); card.append(preview, content); update(pr);
  return { card, update, head: pr.head };
}
function render(next) {
  state = next; const queue = state.queue; const decisions = state.prs.filter(p => p.status === 'decision'); const merged = state.prs.filter(p => p.status === 'merged');
  const working = queue.running.filter(t => t.status === 'working').length, interrupted = queue.running.length - working;
  $('active-count').textContent = working; $('live-badge').textContent = working;
  $('queued-count').textContent = queue.pending.length; $('decision-count').textContent = decisions.length; $('decision-badge').textContent = decisions.length; $('merged-count').textContent = merged.length;
  $('overview').textContent = queue.paused ? 'The queue is paused. Existing work and your decisions are still here.' : `${working} work item${working === 1 ? ' is' : 's are'} in progress. ${interrupted ? `${interrupted} interrupted session${interrupted === 1 ? ' needs' : 's need'} attention. ` : ''}${decisions.length ? 'Your decisions are ready in the inbox.' : 'We will bring decisions here when work needs your eyes.'}`;
  const warnings = [state.githubError, state.queueError].filter(Boolean); $('notice').hidden = !warnings.length; $('notice').textContent = warnings.join(' ');
  const signature = JSON.stringify(queue.running);
  if (signature !== workerSignature) { workerSignature = signature; $('workers').replaceChildren(...(queue.running.length ? queue.running.map(renderWorker) : [empty('No active workers. The coordinator will pick up useful work as slots become available.')])); }
  $('pending').replaceChildren(...(queue.pending.length ? queue.pending.map(taskRow) : [empty('No tasks waiting. The coordinator checks the backlog automatically.')]));
  $('recent').replaceChildren(...(queue.recent.length ? queue.recent.slice(0, 5).map(taskRow) : [empty('Session results will appear here.')]));
  $('pending-label').textContent = `${queue.pending.length} queued`; $('coordinator').textContent = queue.coordinator || 'The coordinator is inspecting issues and PRs.';
  for (const [id, view] of reviewViews) if (!decisions.some(pr => pr.id === id)) { view.card.remove(); reviewViews.delete(id); }
  for (const child of $('decisions').children) if (!child.dataset.id) child.remove();
  decisions.forEach((pr, index) => {
    let view = reviewViews.get(pr.id);
    if (!view || view.head !== pr.head) {
      view?.card.remove(); view = reviewCard(pr); reviewViews.set(pr.id, view);
    } else view.update(pr);
    if ($('decisions').children[index] !== view.card) $('decisions').insertBefore(view.card, $('decisions').children[index] || null);
  });
  if (!decisions.length) $('decisions').append(empty('You are all caught up. Work needing your decision will appear here with its evidence.'));
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
  clearTimeout(reconnectTimer); stream?.close(); stream = new EventSource('/api/events');
  const current = stream;
  stream.onopen = () => { $('connection-dot').className = 'live'; $('connection-label').textContent = 'Live'; };
  stream.onmessage = event => render(JSON.parse(event.data));
  stream.onerror = async () => {
    $('connection-dot').className = ''; $('connection-label').textContent = 'Reconnecting';
    try { await api('/api/state'); }
    catch (error) {
      if (stream !== current) return;
      if (error.status === 401) {
        current.close(); clearTimeout(reconnectTimer); $('login').hidden = false; $('dashboard').hidden = true;
        $('login-error').textContent = 'Sign in again to reconnect. Your unsent notes are saved.'; return;
      }
    }
    if (stream === current && current.readyState === EventSource.CLOSED) reconnectTimer = setTimeout(connect, 1000);
  };
}
async function boot() {
  try { const data = await api('/api/state'); $('login').hidden = true; $('dashboard').hidden = false; render(data); connect(); }
  catch (error) { $('login').hidden = false; $('dashboard').hidden = true; if (error.status !== 401) $('login-error').textContent = error.message; }
}
$('login-form').addEventListener('submit', async event => { event.preventDefault(); try { await api('/api/session', { token: $('key').value }); $('key').value = ''; await boot(); } catch (error) { $('login-error').textContent = error.message; } });
const token = new URLSearchParams(location.hash.slice(1)).get('key');
if (token) { history.replaceState(null, '', location.pathname); try { await api('/api/session', { token }); } catch (error) { $('login-error').textContent = error.message; } }
setInterval(updateClocks, 1000); await boot();
