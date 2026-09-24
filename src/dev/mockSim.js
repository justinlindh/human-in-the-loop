// Contract-shaped fake simulation so render and UI can be built before the real sim exists.
// Deterministic per scenario; emits every event type on a fixed cadence.

const FUNCTIONS = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
const ROLES = ['engineer', 'designer', 'marketer', 'support', 'security', 'sales'];
const DEFAULT_ASSIGNMENT = { engineer: 'maintenance', designer: 'idle', marketer: 'marketing', support: 'support', security: 'security', sales: 'sales' };
const FIRST = ['Ada', 'Bao', 'Chidi', 'Dana', 'Emeka', 'Farah', 'Gus', 'Hana', 'Ines', 'Jun', 'Kai', 'Leila', 'Mateo', 'Nia', 'Omar', 'Priya', 'Quinn', 'Rafa', 'Sana', 'Tomas', 'Uma', 'Vik', 'Wren', 'Xiu', 'Yara', 'Zeke', 'Aiko', 'Bram', 'Cleo', 'Dev'];
const LAST = ['Abara', 'Becker', 'Chen', 'Diallo', 'Eriksen', 'Fonseca', 'Garcia', 'Haddad', 'Ito', 'Kaur', 'Mensah', 'Nakamura', 'Okafor', 'Petrov', 'Rossi', 'Santos', 'Tanaka', 'Vargas', 'Walsh', 'Yilmaz'];
const SHIRTS = ['#4f8cff', '#ff7eb6', '#ffb020', '#34c38f', '#e5484d', '#9b6bff', '#f2efe6', '#2f3a4a', '#7fc8c0', '#d98c5f'];
const HAIR = ['#2b1d16', '#4a3222', '#7a4b2a', '#c68b4e', '#e8c170', '#b8b8b8', '#1c1c24', '#a3442f'];
const PANTS = ['#2e3440', '#4b5563', '#6b4f3a', '#1f3b5c', '#8a7f6a', '#3b3b46'];
const ACCESSORIES = ['none', 'none', 'none', 'glasses', 'headphones', 'beanie', 'cap'];
const TRAITS = ['craftsperson', 'hype_machine', 'paranoid', 'mentor', 'night_owl', 'vibe_coder', 'loyal', 'tinkerer', 'pragmatist', 'old_guard'];
const CHATTER = {
  ok: ['Shipped it. Feels good.', 'Tests green on first try. Suspicious.', 'Who brought donuts'],
  coasting: ['Just approving the agent PRs again', 'Do I even write code anymore', 'I miss hard problems'],
  burnout: ['I cannot look at another diff', 'Updating my LinkedIn. For fun.', 'I used to love this job'],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCENARIOS = {
  garage: { stage: 0, staff: 2, products: 0, auto: 0 },
  floor: { stage: 1, staff: 10, products: 3, auto: 0.25 },
  hq: { stage: 2, staff: 28, products: 8, auto: 0.5 },
  incident: { stage: 1, staff: 10, products: 3, auto: 0.75, incident: true },
  night: { stage: 1, staff: 10, products: 3, auto: 0.25, night: true },
  ending: { stage: 1, staff: 8, products: 3, auto: 0.5, ending: true },
};

const PRODUCT_DEFS = [
  ['Inboxer', 'email', 'summarizer', 'chatgbt'], ['Deskbot', 'support', 'agent', 'claudius'],
  ['Plannr', 'pm', 'workflow', 'gemenai'], ['Jotly', 'notes', 'copilot', 'chatgbt'],
  ['Dealflow', 'crm', 'agent', 'claudius'], ['Chartwise', 'analytics', 'copilot', 'gemenai'],
  ['Pixelpal', 'design', 'copilot', 'deepsleep'], ['Shipyard', 'devtools', 'agent', 'claudius'],
];
const MOCK_ITEMS = [
  [['espresso', 1], ['plant_wall', 1]],
  [['espresso', 2], ['plant_wall', 2], ['whiteboard_wall', 1], ['server_rack', 2], ['nap_pod', 1], ['monitoring_wall', 1]],
  [['espresso', 3], ['plant_wall', 3], ['whiteboard_wall', 2], ['server_rack', 3], ['nap_pod', 2], ['monitoring_wall', 3], ['arcade', 2], ['library', 2], ['standing_desk', 3], ['trophy_case', 2], ['arcade', 1], ['plant_wall', 1]],
];
const GRIDS = [{ w: 9, h: 7 }, { w: 15, h: 12 }, { w: 21, h: 16 }];
// A valid layout: desk columns with aisles, then shop items along the back and left walls.
function mockPlaced(stage, staffCount) {
  const g = GRIDS[stage];
  const placed = [];
  let n = 1;
  const tryPlace = (itemId, level, spots) => {
    for (const [x, y, rot] of spots) {
      const item = { itemId, x, y, rot };
      if (!placementProblem(stage, item, placed)) { placed.push({ id: `f${n++}`, level, ...item }); return true; }
    }
    return false;
  };
  const deskSpots = [];
  for (let y = 2; y + 1 < g.h - 1; y += 3) for (let x = 2; x < g.w - 1; x += 2) deskSpots.push([x, y, 0]);
  for (let i = 0; i < Math.max(2, staffCount); i++) if (!tryPlace('desk', 1, deskSpots)) break;
  const wallSpots = [];
  for (let x = 0; x < g.w; x++) wallSpots.push([x, 0, 0]);
  for (let y = 1; y < g.h; y++) wallSpots.push([0, y, 1]);
  for (let y = 1; y < g.h; y++) for (let x = 1; x < g.w; x++) wallSpots.push([x, y, 0]);
  for (const [itemId, level] of MOCK_ITEMS[stage]) tryPlace(itemId, level, wallSpots);
  return placed;
}
// Placement rules for the mock's build mode: footprints at rot 0, level-1 prices, doors, blocked tiles.
const MOCK_SHAPES = {
  desk: { w: 1, h: 2 }, meeting_table: { w: 3, h: 2 }, whiteboard: { w: 2, h: 1 }, coffee_corner: { w: 2, h: 1 }, plant: { w: 1, h: 1 },
  bookshelf: { w: 2, h: 1 }, plant_wall: { w: 2, h: 1 }, nap_pod: { w: 1, h: 2 }, whiteboard_wall: { w: 3, h: 1 }, library: { w: 2, h: 2 },
  monitoring_wall: { w: 3, h: 1 }, espresso: { w: 2, h: 1 }, standing_desk: { w: 2, h: 1 }, server_rack: { w: 2, h: 1 }, trophy_case: { w: 2, h: 1 },
};
const MOCK_PRICES = { desk: 800, meeting_table: 3000, whiteboard: 400, coffee_corner: 1200, plant: 150, bookshelf: 500 };
const DOORS = [{ x: 4, y: 6 }, { x: 7, y: 11 }, { x: 10, y: 15 }];
const BLOCKED = [[[8, 0]], [[5, 4], [9, 4], [5, 8], [9, 8]], [[6, 5], [14, 5], [6, 10], [14, 10]]];
const priceOf = (itemId, level = 1) => (MOCK_PRICES[itemId] ?? 3000) * 3 ** (level - 1);
function tilesOf({ itemId, x, y, rot }) {
  const f = MOCK_SHAPES[itemId] ?? { w: 1, h: 1 };
  const [w, h] = rot % 2 ? [f.h, f.w] : [f.w, f.h];
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j]);
  return out;
}

// Returns a reason string if `item` cannot sit at its tiles among `others`, else null.
function placementProblem(stage, item, others) {
  const g = GRIDS[stage];
  const key = ([x, y]) => `${x},${y}`;
  const mine = tilesOf(item);
  if (mine.some(([x, y]) => x < 0 || y < 0 || x >= g.w || y >= g.h)) return 'Out of bounds';
  const taken = new Set([...BLOCKED[stage].map(key), key([DOORS[stage].x, DOORS[stage].y])]);
  for (const o of others) for (const t of tilesOf(o)) taken.add(key(t));
  if (mine.some((t) => taken.has(key(t)))) return 'Blocked';
  for (const t of mine) taken.add(key(t));
  // Every desk needs a free tile beside it that can be reached from the door.
  const seen = new Set([key([DOORS[stage].x, DOORS[stage].y])]);
  const queue = [[DOORS[stage].x, DOORS[stage].y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [x + dx, y + dy];
      if (n[0] < 0 || n[1] < 0 || n[0] >= g.w || n[1] >= g.h || seen.has(key(n)) || taken.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  for (const d of [...others, item].filter((o) => o.itemId === 'desk')) {
    const beside = tilesOf(d).flatMap(([x, y]) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]);
    if (!beside.some((t) => seen.has(key(t)))) return 'Would block the path to a desk';
  }
  return null;
}

const SAID = {
  aside: ['Okay. Okay okay okay.', 'Who moved my mug?', 'That build was fast. Suspicious.', 'Coffee. Now.', 'Huh. It works.'],
  exchanges: [
    ['Got a sec to look at this diff?', 'Sure. Oh. Oh no.', 'Yeah. That is why I asked.'],
    ['Lunch?', 'Tacos?', 'Tacos.'],
    ['Did the agent write this?', 'Parts of it. The weird parts.', 'I can tell.'],
  ],
};
const REACTIONS = ['🎉', '😂', '💀', '🫡', '🔥', '👀', '🙏'];
const PRICES = { email: 10, support: 60, pm: 25, notes: 12, crm: 70, analytics: 55, design: 30, devtools: 35 };

export function createMockSim({ scenario = 'floor', seed = 7 } = {}) {
  const cfg = SCENARIOS[scenario] ?? SCENARIOS.floor;
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  let nextId = 1;
  const id = (p) => `${p}${nextId++}`;

  // First names come off a shuffled deck, so nobody shares one until all of them are in use.
  let deck = [];
  const firstName = () => {
    if (!deck.length) { deck = [...FIRST]; for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
    return deck.pop();
  };
  const person = (role, seniority, founder = false) => {
    const moodRoll = r();
    const meaning = founder ? 80 : moodRoll < 0.15 ? int(5, 14) : moodRoll < 0.35 ? int(18, 34) : int(45, 95);
    const mood = meaning < 15 ? 'burnout' : meaning < 35 ? 'coasting' : 'ok';
    const level = seniority === 'junior' ? int(1, 3) : seniority === 'mid' ? int(5, 8) : int(10, 14);
    return {
      id: id('s'), name: `${firstName()} ${pick(LAST)}`, role, seniority, level, xp: int(0, 50),
      skills: { features: int(20, 90), polish: int(20, 90), reliability: int(20, 90), novelty: int(20, 90) },
      speed: 0.8 + Math.round(r() * 40) / 100, meaning, stamina: int(40, 100), knowledge: int(10, 90),
      traits: r() < 0.6 ? [pick(TRAITS)] : [],
      assignment: { type: DEFAULT_ASSIGNMENT[role], targetId: null },
      mood, burnoutWeeks: mood === 'burnout' ? int(1, 3) : 0, sabbaticalWeeksLeft: 0,
      salary: { junior: 900, mid: 1600, senior: 2600 }[seniority], hiredWeek: 0, founder,
      path: null, pathPending: false, legend: false,
      record: { mentorWeeks: int(0, 30), catches: int(0, 4), hardProblemWeeks: int(0, 25) },
      appearance: {
        skin: int(0, 5), hair: int(0, 7), hairColor: pick(HAIR), shirt: pick(SHIRTS), pants: pick(PANTS),
        accessory: pick(ACCESSORIES), build: int(0, 2),
      },
    };
  };

  const staff = [person('engineer', 'senior', true), person('designer', 'mid', true)];
  const roleCycle = ['engineer', 'engineer', 'designer', 'marketer', 'support', 'engineer', 'security', 'sales'];
  while (staff.length < cfg.staff) {
    staff.push(person(roleCycle[staff.length % roleCycle.length], pick(['junior', 'junior', 'mid', 'senior'])));
  }

  const products = [];
  for (let i = 0; i < cfg.products; i++) {
    const [name, category, angle, model] = PRODUCT_DEFS[i];
    const customers = int(800, 30000);
    products.push({
      id: id('p'), name, category, angle, model, modelVersion: 1, version: int(1, 3), size: 'medium',
      stats: { features: int(60, 200), polish: int(40, 150), reliability: int(40, 160), novelty: int(20, 90) },
      score: Math.round((5 + r() * 4.5) * 10) / 10,
      reviews: ['TechCrunchy', 'The Vergence', 'Hacker Olds', 'Wired-ish'].map((outlet) => ({ outlet, score: int(5, 10), quote: 'Finally, AI that earns its keep.' })),
      customers, mrr: customers * PRICES[category], hype: int(5, 60), novelty: int(2, 9), health: int(55, 100), baseHealth: 90,
      uptime: 1, launchedWeek: int(0, 60), copyAtWeek: 200, copied: false, wrapperHit: false,
      ownerId: null, migrationDueWeek: i === 1 ? 90 : null, killed: false,
    });
  }

  const projects = cfg.staff > 2 ? [{
    id: id('j'), kind: 'new', name: 'Legalese', category: 'support', angle: 'voice', model: 'claudius', size: 'medium',
    pointsNeeded: 280, progress: 120, stats: { features: 50, polish: 30, reliability: 30, novelty: 10 }, productId: null, startedWeek: 60, bankedHype: 5,
  }] : [{
    id: id('j'), kind: 'new', name: 'Inboxer', category: 'email', angle: 'summarizer', model: 'chatgbt', size: 'small',
    pointsNeeded: 110, progress: 30, stats: { features: 14, polish: 8, reliability: 6, novelty: 2 }, productId: null, startedWeek: 0, bankedHype: 0,
  }];

  // Put some people on the project, a mentor pair, an overseer, a hard problem, one on sabbatical.
  const eng = staff.filter((p) => p.role === 'engineer' || p.role === 'designer');
  eng.slice(0, Math.max(2, Math.ceil(eng.length / 2))).forEach((p) => { p.assignment = { type: 'project', targetId: projects[0].id }; });
  const junior = staff.find((p) => p.seniority === 'junior');
  const mentor = staff.find((p) => p.seniority !== 'junior' && !p.founder && p.role === 'engineer');
  if (junior && mentor) mentor.assignment = { type: 'mentor', targetId: junior.id };
  const spare = staff.filter((p) => !p.founder && p.assignment.type !== 'project' && p.assignment.type !== 'mentor');
  if (spare[0] && cfg.auto > 0) spare[0].assignment = { type: 'oversight', targetId: null };
  const senior = staff.find((p) => p.seniority === 'senior' && !p.founder);
  if (senior) senior.assignment = { type: 'hardProblem', targetId: null };
  const seniors = staff.filter((p) => p.seniority === 'senior');
  const PATHS = { engineer: 'ai_wrangler', designer: 'ux_lead', marketer: 'growth_lead', support: 'support_lead', security: 'red_team_lead', sales: 'enterprise_ae' };
  seniors.forEach((p, i) => { if (i % 3 === 2) p.pathPending = true; else p.path = PATHS[p.role]; });
  if (seniors[0] && cfg.stage === 2) { seniors[0].legend = true; seniors[0].level = 20; }
  if (spare[1] && cfg.stage >= 1) { spare[1].assignment = { type: 'sabbatical', targetId: null }; spare[1].mood = 'away'; spare[1].sabbaticalWeeksLeft = 3; }

  const week = { garage: 3, floor: 110, hq: 420, incident: 150, night: 110, ending: 779 }[scenario] ?? 110;
  const history = [];
  for (let w = Math.max(0, week - 120); w < week; w++) {
    const t = w / Math.max(1, week);
    history.push({
      week: w, cash: 90000 + 400000 * t, mrr: Math.round(products.reduce((s, p) => s + p.mrr, 0) * t),
      customers: Math.round(products.reduce((s, p) => s + p.customers, 0) * t), brand: 5 + 40 * t, debt: 10 + 30 * t, ik: 60 - 10 * t,
      juniors: staff.filter((p) => p.seniority === 'junior').length, mids: staff.filter((p) => p.seniority === 'mid').length,
      seniors: staff.filter((p) => p.seniority === 'senior').length, avgMeaning: 60 - 10 * t, incidents: Math.floor(4 * t),
    });
  }

  const state = {
    version: 1, seed, rng: { s: seed }, companyName: 'Loopworks', week, nextId,
    cash: [60000, 240000, 3100000, 180000, 240000, 900000][Object.keys(SCENARIOS).indexOf(scenario)] ?? 240000,
    brand: [5, 34, 71, 28, 34, 55][Object.keys(SCENARIOS).indexOf(scenario)] ?? 34,
    institutionalKnowledge: cfg.incident ? 18 : 62, comprehensionDebt: cfg.incident ? 78 : 24,
    officeStage: cfg.stage,
    staff, candidates: [person('engineer', 'junior'), person('designer', 'mid'), person('engineer', 'senior'), person('support', 'junior'), person('marketer', 'mid')],
    candidatesWeek: week - 1,
    projects, products,
    automation: Object.fromEntries(FUNCTIONS.map((f) => [f, { level: cfg.auto, model: f === 'engineering' ? 'claudius' : 'chatgbt' }])),
    policies: cfg.stage >= 1 ? { pair: true } : {},
    campaigns: products.length ? [{ id: id('c'), channel: 'content', productId: products[0].id, projectId: null, weeksLeft: 4 }] : [],
    security: { auditBoost: 8, tooling: cfg.stage >= 1 },
    ops: { supportShortfall: cfg.incident ? 0.4 : 0.05, maintenanceShortfall: cfg.incident ? 0.6 : 0.1, maintenanceCapacity: 30, oversightRequired: 40 * cfg.auto * 2, oversightProvided: 20 },
    market: {
      categories: Object.fromEntries(Object.keys(PRICES).map((c) => [c, { incumbentStrength: 500, clones: int(0, 3) }])),
      trend: 'agents_hot', trendWeeksLeft: 12,
      unlockedCategories: ['notes', 'email', 'pm', 'support', 'crm', 'analytics'], unlockedAngles: ['copilot', 'summarizer', 'workflow', 'agent', 'native'],
    },
    models: Object.fromEntries(['claudius', 'chatgbt', 'gemenai', 'grokk', 'llamarama', 'deepsleep', 'mistrale'].map((m, i) => [m, { version: 1 + (i % 3), capability: 70 + i, costMult: 1, available: true, deprecated: false }])),
    discoveredCombos: { 'email:summarizer': 1.45, 'support:agent': 1.5 },
    office: { stage: cfg.stage, placed: mockPlaced(cfg.stage, staff.length) },
    era: { id: ['classic', 'chatgbt', 'agents', 'agents', 'chatgbt', 'consolidation'][Object.keys(SCENARIOS).indexOf(scenario)] ?? 'chatgbt', since: Math.max(0, week - 20) },
    eraSchedule: { chatgbt: 170, agents: 320, consolidation: 530 },
    unlocks: cfg.stage === 0 ? {} : { marketing: 20, ops: 40, research: 60, models: 170, automation: 170, paths: 80, standups: 90 },
    goals: { place_desks: { done: true, week: 0 }, first_launch: { done: cfg.stage > 0, week: cfg.stage > 0 ? 12 : null }, office_floor: { done: cfg.stage > 0, week: cfg.stage > 0 ? 60 : null }, hq: { done: cfg.stage > 1, week: cfg.stage > 1 ? 300 : null }, ipo: { done: false, week: null } },
    founding: { founders: ['engineer', 'designer'], funding: 'bootstrapped', logoColor: '#ffb020', tagline: 'Build software. Keep the humans.' },
    modifiers: cfg.stage >= 1 ? [{ id: 'x1', key: 'output', value: -0.1, label: 'Four-day week trial', untilWeek: week + 5, source: 'four_day_week' }, { id: 'x2', key: 'meaningRecovery', value: 0.5, label: 'Four-day week trial', untilWeek: week + 5, source: 'four_day_week' }] : [],
    scheduled: cfg.stage >= 1 ? [{ id: 'q1', week: week + 5, kind: 'event', payload: { eventId: 'four_day_week_review' } }] : [],
    research: { done: cfg.stage === 0 ? [] : cfg.stage === 1 ? ['eval_harness', 'ci_cd'] : ['eval_harness', 'agent_sandbox', 'ci_cd', 'observability', 'docs_culture'] },
    outage: cfg.incident && products[0] ? { productId: products[0].id, kind: 'db_wipe', severity: 4, weeks: 2, unrecoverable: true } : null,
    incidentLog: cfg.incident ? [{ week: week - 2, kind: 'db_wipe', productId: products[0].id, caught: false, severity: 4 }] : [],
    lowCashWeeks: 0,
    pendingDecision: cfg.incident ? {
      eventId: 'agent_db_wipe', title: 'The agent dropped the production database',
      text: 'Your engineering agent decided the users table was "unused". Nobody on staff knows how the backup restore works.',
      subjectId: products[0].id,
      choices: [{ label: 'Roll back and eat the cost', hint: 'Cash hit, customers stay' }, { label: 'Blame the vendor', hint: 'Brand risk' }, { label: 'Public postmortem', hint: 'Honest. Painful. Respected.' }],
    } : null,
    flags: cfg.night ? { mockTime: 'night' } : {},
    stats: { hires: staff.length, juniorsHired: 3, resignations: 1, incidents: 4, caught: 2, breaches: 1, launches: products.length, awards: 0, peakMrr: products.reduce((s, p) => s + p.mrr, 0) },
    history,
    gameOver: cfg.ending ? {
      won: true, reason: 'leader', score: 48210,
      epilogue: ['Three of your former juniors now run teams of their own.', 'Nobody remembers who wrote the billing service. It still works. Nobody touches it.', 'Loopworks is still hiring.'],
    } : null,
  };

  let chatSeq = 0;
  function chat(channel, person, text, replyTo = null, bot = null) {
    const avg = state.staff.reduce((a, p) => a + p.meaning, 0) / Math.max(1, state.staff.length);
    const reactions = {};
    const n = Math.floor((avg / 100) * 4 * r());
    for (let i = 0; i < n; i++) { const e = pick(REACTIONS); reactions[e] = (reactions[e] ?? 0) + int(1, 4); }
    return { type: 'chat', id: `m${++chatSeq}`, channel, from: bot ?? person.name, fromId: bot ? null : person.id, text, replyTo, reactions };
  }

  let saySeq = 0;
  const say = (person, text, to = null, replyTo = null) => ({ type: 'say', id: `v${++saySeq}`, week: state.week, staffId: person.id, text, toId: to?.id ?? null, replyTo });

  let ticks = 0;
  let gameOverEmitted = false;

  function tick() {
    const events = [];
    if (state.gameOver) {
      if (!gameOverEmitted) { gameOverEmitted = true; events.push({ type: 'gameOver' }); }
      return events;
    }
    if (state.pendingDecision) return events;
    ticks++;
    state.week++;
    for (const p of state.staff) {
      if (p.mood === 'away') continue;
      p.meaning = Math.max(0, Math.min(100, p.meaning + (r() - 0.5) * 6));
      p.mood = p.meaning < 15 ? 'burnout' : p.meaning < 35 ? 'coasting' : 'ok';
    }
    for (const pr of state.products) {
      pr.customers = Math.max(0, Math.round(pr.customers * (1 + (r() - 0.45) * 0.04)));
      pr.mrr = pr.customers * PRICES[pr.category];
    }
    for (const j of state.projects) j.progress = Math.min(j.pointsNeeded, j.progress + 6);
    state.cash += Math.round(state.products.reduce((s, p) => s + p.mrr, 0) * 12 / 52 - state.staff.length * 1600);

    const workers = state.staff.filter((p) => p.assignment.type === 'project');
    const tones = ['features', 'polish', 'reliability', 'novelty'];
    // Player-facing stat names, as the real sim labels them.
    const LABEL = { features: 'Features', polish: 'Polish', reliability: 'Reliability', novelty: 'Freshness' };
    workers.slice(0, 3).forEach((p, i) => events.push({ type: 'bubble', staffId: p.id, text: `+${int(2, 9)} ${LABEL[tones[(ticks + i) % 4]]}`, tone: tones[(ticks + i) % 4] }));
    const talker = pick(state.staff);
    const post = chat('general', talker, pick(CHATTER[talker.mood] ?? CHATTER.ok));
    events.push(post);
    if (ticks % 2 === 0) {
      const replier = pick(state.staff.filter((p) => p !== talker)) ?? talker;
      events.push(chat('general', replier, pick(['same', 'this is fine', 'you taught me everything I know', 'lunch?', '+1']), post.id));
    }
    // Spoken lines: one aside a week, and a short exchange between two people every third week.
    const here = state.staff.filter((p) => p.mood !== 'away' && p.assignment.type !== 'sabbatical');
    if (here.length) events.push(say(pick(here), pick(SAID.aside)));
    if (ticks % 3 === 0 && here.length >= 2) {
      const a = pick(here);
      const b = pick(here.filter((p) => p !== a));
      const [open, reply, close] = pick(SAID.exchanges);
      const first = say(a, open, b);
      const second = say(b, reply, a, first.id);
      events.push(first, second, say(a, close, b, second.id));
    }
    if (ticks % 4 === 0) events.push(chat('random', pick(state.staff), pick(['who took the good mug', 'the office dog is in the server room again', 'coffee machine is making the noise again'])));

    const any = () => pick(state.staff);
    if (ticks % 3 === 0) events.push({ type: 'toast', text: pick(['Trend: Agents Are Hot', 'Content campaign finished', 'New candidates available']), tone: pick(['info', 'good', 'warn']) });
    if (ticks % 5 === 0) events.push({ type: 'celebrate', staffId: any().id });
    if (ticks % 7 === 0 && state.products.length) {
      const pr = pick(state.products);
      const caught = ticks % 14 === 0;
      events.push({ type: 'incident', kind: pick(['db_wipe', 'runaway_spend', 'credential_stuffing', 'mass_email']), productId: pr.id, caught, severity: int(1, 5) });
      events.push(chat('incidents', null, `SEV${int(1, 3)}: ${pr.name} is having a moment`, null, '@pagerbot'));
    }
    if (ticks % 10 === 0) {
      const pr = state.products[0];
      if (pr) { events.push({ type: 'launch', productId: pr.id }); events.push(chat('wins', null, `${pr.name} v${pr.version} is live!`, null, '@shipbot')); }
    }
    if (ticks % 11 === 0) {
      const c = state.candidates.shift();
      if (c) { state.staff.push(c); events.push({ type: 'hire', staffId: c.id }); state.candidates.push(person(pick(ROLES), 'junior')); }
    }
    if (ticks % 13 === 0) {
      const leaver = state.staff.find((p) => !p.founder && (p.mood === 'burnout' || p.mood === 'coasting')) ?? state.staff.find((p) => !p.founder);
      if (leaver) {
        state.staff = state.staff.filter((p) => p !== leaver);
        for (const p of state.staff) if (p.assignment.targetId === leaver.id) p.assignment = { type: DEFAULT_ASSIGNMENT[p.role], targetId: null };
        events.push({ type: 'resign', staffId: leaver.id, name: leaver.name });
      }
    }
    if (ticks % 17 === 0) {
      state.pendingDecision = {
        eventId: 'senior_grumble', title: 'A senior engineer has concerns',
        text: `${any().name} asks: "Is my job just reviewing robot PRs now?"`, subjectId: null,
        choices: [{ label: 'Give them a hard problem', hint: 'Meaning up, less output' }, { label: 'Talk it through', hint: 'Small cost' }, { label: 'Ignore it', hint: 'Meaning down' }],
      };
      events.push({ type: 'decision' });
    }
    if (ticks % 6 === 0) {
      const present = state.staff.filter((p) => p.mood !== 'away').slice(0, 4);
      const lines = present.map((p) => ({ staffId: p.id, text: p.mood === 'burnout' ? '' : p.mood === 'coasting' ? 'Same as yesterday.' : pick(['Legalese is at 60%. Polish pass today.', 'Pairing on billing.', 'Blocked on the flaky test.', 'Shipping the onboarding fix.']) }));
      const mode = ticks % 12 === 0 ? 'async' : 'daily';
      events.push({ type: 'standup', mode, lines });
      if (mode === 'async') for (const l of lines.filter((x) => x.text)) events.push(chat('standup', state.staff.find((x) => x.id === l.staffId), l.text));
    }
    if (ticks % 19 === 0) events.push({ type: 'unlock', key: pick(['marketing', 'ops', 'research', 'standups']) });
    if (ticks % 21 === 0) events.push({ type: 'goal', goalId: 'first_launch' });
    if (ticks % 31 === 0) events.push({ type: 'era', eraId: 'agents' });
    if (ticks % 23 === 0) events.push({ type: 'award', text: 'Product of the Year: Deskbot' });
    if (ticks % 29 === 0) events.push({ type: 'officeUpgrade', stage: state.officeStage });
    state.history.push({ ...state.history[state.history.length - 1] ?? {}, week: state.week });
    if (state.history.length > 800) state.history.shift();
    return events;
  }

  function dispatch(action) {
    if (action.type === 'resolveDecision') {
      if (!state.pendingDecision) return { ok: false, reason: 'No decision pending', events: [] };
      state.pendingDecision = null;
      return { ok: true, events: [{ type: 'toast', text: 'Decision made.', tone: 'info' }] };
    }
    if (action.type === 'assign') {
      const p = state.staff.find((s) => s.id === action.staffId);
      if (!p) return { ok: false, reason: 'No such staff member', events: [] };
      p.assignment = { ...action.assignment };
      return { ok: true, events: [] };
    }
    if (action.type === 'hire') {
      const i = state.candidates.findIndex((c) => c.id === action.candidateId);
      if (i < 0) return { ok: false, reason: 'No such candidate', events: [] };
      const [c] = state.candidates.splice(i, 1);
      state.staff.push(c);
      return { ok: true, events: [{ type: 'hire', staffId: c.id }] };
    }
    if (action.type === 'setAutomation') {
      if (!state.automation[action.fn]) return { ok: false, reason: 'Unknown function', events: [] };
      state.automation[action.fn] = { level: action.level, model: action.model ?? state.automation[action.fn].model };
      return { ok: true, events: [] };
    }
    if (action.type === 'setPolicy') {
      if (action.on) state.policies[action.id] = true; else delete state.policies[action.id];
      return { ok: true, events: [] };
    }
    if (action.type === 'placeItem' || action.type === 'moveItem') {
      const placed = state.office.placed;
      const cur = action.type === 'moveItem' ? placed.find((o) => o.id === action.id) : null;
      if (action.type === 'moveItem' && !cur) return { ok: false, reason: 'No such item', events: [] };
      const item = { itemId: cur?.itemId ?? action.itemId, x: action.x, y: action.y, rot: ((action.rot ?? 0) % 4 + 4) % 4 };
      const problem = placementProblem(state.officeStage, item, placed.filter((o) => o !== cur));
      if (problem) return { ok: false, reason: problem, events: [] };
      if (cur) { Object.assign(cur, item); return { ok: true, events: [] }; }
      const cost = priceOf(item.itemId);
      if (state.cash < cost) return { ok: false, reason: 'Not enough cash', events: [] };
      state.cash -= cost;
      const n = Math.max(0, ...placed.map((o) => Number(o.id.slice(1)) || 0)) + 1;
      const newItem = { id: `f${n}`, level: 1, ...item };
      placed.push(newItem);
      return { ok: true, id: newItem.id, events: [] };
    }
    if (action.type === 'upgradeItem') {
      const it = state.office.placed.find((o) => o.id === action.id);
      if (!it) return { ok: false, reason: 'No such item', events: [] };
      if (MOCK_PRICES[it.itemId] !== undefined || it.level >= 3) return { ok: false, reason: 'Already max level', events: [] };
      const cost = priceOf(it.itemId, it.level + 1);
      if (state.cash < cost) return { ok: false, reason: 'Not enough cash', events: [] };
      state.cash -= cost;
      it.level++;
      return { ok: true, events: [] };
    }
    if (action.type === 'sellItem') {
      const i = state.office.placed.findIndex((o) => o.id === action.id);
      if (i < 0) return { ok: false, reason: 'No such item', events: [] };
      const [it] = state.office.placed.splice(i, 1);
      let spent = 0;
      for (let l = 1; l <= it.level; l++) spent += priceOf(it.itemId, l);
      state.cash += Math.round(spent / 2);
      return { ok: true, events: [] };
    }
    return { ok: false, reason: `The mock sim does not implement ${action.type}`, events: [] };
  }

  return { state, tick, dispatch };
}

export const MOCK_SCENARIOS = Object.keys(SCENARIOS);
