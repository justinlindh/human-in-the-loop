// Flying-camera keys per shot of the printer homage (see shots.json), in metres on a flat field.
// The printer stands at the origin; +y is up. Each shot is { pos, look, fov } at its start and its end;
// the fly camera eases between them over the shot. A key with `rel: 'K'|'T'|'S'|'G' (the three's centre)`
// gives pos and look as offsets (x, y absolute, z) from that figure's track at the key's time. K, T and S stand-in tracks are in standins.js.
export const CAMERAS = {
  0: { a: { pos: [0.9, 0.45, 1.2], look: [0, 0.25, 0], fov: 38 }, b: { pos: [0.7, 0.4, 0.9], look: [0, 0.25, 0], fov: 38 } },
  1: { a: { rel: 'T', pos: [0.3, 0.35, 0.75], look: [0, 0.55, 0], fov: 60 }, b: { rel: 'T', pos: [0.3, 0.4, 0.75], look: [0, 0.9, 0], fov: 60 } },
  2: { a: { rel: 'S', pos: [3.0, 0.3, -1.1], look: [0, 0.9, 0], fov: 55 }, b: { rel: 'S', pos: [2.6, 0.3, -1.0], look: [0, 0.9, 0], fov: 55 } },
  3: { a: { rel: 'G', pos: [3.0, 0.9, -1.1], look: [0, 0.7, 0], fov: 42 }, b: { rel: 'G', pos: [3.0, 0.9, -1.1], look: [0, 0.7, 0], fov: 42 } },
  4: { a: { pos: [-0.2, 0.5, 2.6], look: [-1.0, 0.6, 0.8], fov: 40 }, b: { pos: [0.6, 0.5, 2.2], look: [-1.2, 0.6, 0.7], fov: 40 } },
  5: { a: { pos: [-0.8, 0.25, 1.4], look: [0, 0.2, 0.2], fov: 50 }, b: { pos: [0.2, 0.25, 1.4], look: [0, 0.2, 0.2], fov: 50 } },
  6: { a: { pos: [0, 1.2, -6.5], look: [0, 0.7, 0.5], fov: 36 }, b: { pos: [0, 1.1, -6.0], look: [0, 0.7, 0.5], fov: 36 } },
  7: { a: { pos: [1.3, 1.2, 1.0], look: [0, 0.15, 0], fov: 45 }, b: { pos: [0.4, 1.2, 1.5], look: [0, 0.15, 0], fov: 45 } },
  8: { a: { pos: [0.6, 0.3, 0.7], look: [0, 0.1, 0], fov: 55 }, b: { pos: [0.55, 0.32, 0.75], look: [0, 0.1, 0], fov: 55 } },
  9: { a: { pos: [0.3, 0.85, -0.8], look: [1.3, 0.75, 0.9], fov: 34 }, b: { pos: [0.5, 0.85, -0.7], look: [1.3, 0.75, 0.9], fov: 34 } },
  10: { a: { pos: [-0.4, 0.3, 1.0], look: [0, 0.1, 0], fov: 50 }, b: { pos: [-0.4, 0.3, 1.0], look: [0, 0.1, 0], fov: 50 } },
  11: { a: { pos: [-3, 0.5, -2.5], look: [0, 0.7, 0.4], fov: 40 }, b: { pos: [-2.3, 0.5, -2.0], look: [0, 0.7, 0.4], fov: 40 } },
  12: { a: { pos: [0.9, 0.4, 0.2], look: [0, 0.2, 0], fov: 40 }, b: { pos: [0.9, 0.4, 0.2], look: [0, 0.2, 0], fov: 40 } },
  13: { a: { pos: [0.5, 0.8, -3.5], look: [0, 0.7, 0.3], fov: 38 }, b: { pos: [0.4, 0.8, -2.8], look: [0, 0.7, 0.3], fov: 38 } },
  14: { a: { pos: [0.2, 0.9, 0.7], look: [0, 0.15, 0], fov: 38 }, b: { pos: [0.1, 0.8, 0.6], look: [0, 0.15, 0], fov: 38 } },
  15: { a: { pos: [1.4, 0.3, 0.2], look: [0.3, 1.1, -1.4], fov: 36 }, b: { pos: [1.0, 0.3, -0.2], look: [0.3, 1.1, -1.4], fov: 36 } },
  16: { a: { pos: [1.5, 1.5, 1.5], look: [0, 0, 0], fov: 45 }, b: { pos: [1.2, 2.2, 1.3], look: [0, 0, 0], fov: 45 } },
  17: { a: { pos: [2, 1.0, -6], look: [0, 0.7, 0.3], fov: 34 }, b: { pos: [2, 1.0, -6], look: [0, 0.7, 0.3], fov: 34 } },
  18: { a: { pos: [-0.5, 0.2, 0.8], look: [0, 0.1, 0], fov: 50 }, b: { pos: [-0.5, 0.2, 0.8], look: [0, 0.1, 0], fov: 50 } },
  19: { a: { pos: [0, 1.1, -6], look: [0, 0.7, 0.3], fov: 34 }, b: { pos: [0, 1.2, -6.6], look: [0, 0.7, 0.3], fov: 34 } },
};
