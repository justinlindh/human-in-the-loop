import { B } from '../sim/balance.js';
import { STANDUP_EXCHANGES } from '../data/standup.js';

// Match the complete event so synthetic or restored events cannot inherit another meeting's subject.
export function standupContext(state, lines) {
  const context = state.flags?.standupConversation;
  return context && JSON.stringify(context.lines) === JSON.stringify(lines) ? structuredClone(context) : null;
}

export function standupRevision(context, state) {
  if (!context) return null;
  const person = state.staff.find(p => p.id === context.personId);
  if (context.topic === 'outage') {
    const outage = state.outage, product = state.products.find(p => p.id === context.subjectId && !p.killed);
    if (!outage || !product || product.name !== context.name || outage.productId !== context.subjectId ||
        (outage.kind ?? null) !== context.kind || state.week - (outage.weeks ?? 0) !== context.startedWeek ||
        (state.flags.outageSeq ?? 0) !== (context.occurrence ?? 0)) return 'The incident changed. Let us check the latest update.';
  }
  if (context.topic === 'project') {
    const project = state.projects.find(p => p.id === context.subjectId);
    if (!project || project.name !== context.name || person?.assignment.type !== 'project' || person.assignment.targetId !== context.subjectId) return 'The work queue changed. Let us check the latest plan.';
  }
  if (context.topic === 'oversight' && person?.assignment.type !== 'oversight') return 'The assignments changed. Let us check the latest plan.';
  return null;
}

export function standupText(line, context, state) {
  if (context?.topic !== 'project') return line.text;
  const project = state.projects.find(p => p.id === context.subjectId);
  const index = context.lines.findIndex(l => l.staffId === line.staffId && l.text === line.text);
  const template = STANDUP_EXCHANGES.find(e => e.id === context.script)?.lines[index];
  return project && template ? template.replaceAll('{project}', project.name).replaceAll('{pct}', String(Math.floor(100 * project.progress / project.pointsNeeded))) : line.text;
}

// A turn owns its reading hold only after show accepts it. Status can wait for arrival or drop a leaver.
export function createStandupSpeech(lines) {
  let index = 0, wait = 0;
  return {
    interrupt() {
      if (wait > 0) { index--; wait = 0; }
    },
    step(dt, status, show) {
      if (dt <= 0) return;
      wait = Math.max(0, wait - dt);
      if (wait > 0) return;
      while (index < lines.length) {
        const line = lines[index], ready = status(line);
        if (ready === 'drop') { index++; continue; }
        if (ready !== 'play') return;
        const seconds = show(line);
        if (!(seconds > 0)) return;
        index++;
        wait = seconds + B.standupSpeechGap;
        return;
      }
    },
    get index() { return index; },
    get current() { return wait > 0 ? lines[index - 1] : null; },
    get done() { return index === lines.length && wait === 0; },
  };
}
