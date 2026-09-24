import { createMockSim } from './dev/mockSim.js';

const params = new URLSearchParams(location.search);
const mock = params.get('mock');

if (mock) {
  const sim = createMockSim({ scenario: mock, seed: Number(params.get('seed') ?? 7) });
  const s = sim.state;
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:24px;font:14px JetBrains Mono,monospace;color:#2a2630;pointer-events:auto';
  pre.textContent = [
    `Human in the Loop (mock: ${mock})`,
    `week ${s.week}  stage ${s.officeStage}  cash $${Math.round(s.cash)}`,
    `staff ${s.staff.length}  products ${s.products.length}  projects ${s.projects.length}`,
  ].join('\n');
  document.getElementById('ui').appendChild(pre);
}

requestAnimationFrame(() => { window.__HITL_READY = true; });
