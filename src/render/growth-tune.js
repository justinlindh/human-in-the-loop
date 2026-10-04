// Office growth beats (growth-office.js): timings, caps and the pump and clap poses. Render-only,
// so the sim never reads them.
export const GROWTH = {
  smallSeconds: 0.85, mediumSeconds: 1.8, settleSeconds: 0.5, queueMax: 8, maxAge: 6,
  liveMax: 3, lowMax: 1, gap: 0.22, fastGap: 0.9, coworkerMax: 2, nearby: 2.5,
  labelY: 1.65, rise: 0.2, ringRadius: 0.48, ringOpacity: 0.22, ringY: 0.025, ringInner: 0.8, ringSegments: 32, iconPixels: 18, iconGap: 4,
  pumpSwing: 0.15, pumpLift: 0.18, pumpHop: 0.1, standAngle: 2.6, pumpRate: 9, clapAngle: 0.46, clapSwing: 0.08, clapReach: 1.85, clapRate: 14, turnLimit: 0.85,
};

// A notable deal (sync.js dealBell): the seller's hand thrown up at the desk and rung like a sales
// bell, and the nearest seated coworkers turning to clap. The pose itself is DEAL_POSE in character.js.
export const DEAL = { seconds: 2.6, clapSeconds: 1.8, clapDelay: 0.35, nearby: 3, coworkerMax: 2, turnLimit: 1.3, pumpRate: 7 };
