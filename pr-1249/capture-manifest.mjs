const setup = `(async () => {
  const H = window.__HITL, R = window.__hitlRender, S = H.state;
  H.setSpeed(0);
  const { createCharacter } = await import('/src/render/character.js');
  const { ROLE_COLORS } = await import('/src/render/palette.js');
  const { TEE_PRINTS } = await import('/src/render/wardrobe.js');
  R.scene.traverse(o => { if (o.userData.staffId) o.parent.visible = false; });
  const people = TEE_PRINTS.map((print, i) => {
    const role = Object.keys(ROLE_COLORS)[i % 6];
    const c = createCharacter({ build: i % 3, skin: i % 6, hair: i % 8, hairColor: '#4a3222', shirt: '#4f8cff', pants: '#2e3440', wardrobeVariant: 3, eraPrint: print }, ROLE_COLORS[role], { role, seed: print, wardrobe: 'web2' });
    c.root.position.set((i - 3.5) * 0.85, 0, 4.5);
    c.root.rotation.y = Math.PI / 4;
    c.setShadows(false); c.update(0);
    R.scene.add(c.root);
    return c;
  });
  window.attirePeople = people;
  window.attireSample = () => people.map(c => ({ wardrobe: c.root.userData.wardrobe, joints: c.joints() }));
})()`;

export const ITEMS = [
  ...['day', 'night'].map(time => ({
    id: `tees-game-camera-${time}`, title: `All tees in the office at the default game camera, ${time}, Low`,
    query: `mock=floor&eras&eraArt=web2&time=${time}&speed=0`, seconds: 0.1, warmup: 0.1,
    still: true, screenshots: [0], setup, size: '1920x1080',
  })),
  {
    id: 'wardrobe-motion', title: 'Clothing stays attached through walk, seated typing and celebration',
    query: 'mock=floor&eras&eraArt=web2&time=day&speed=0', seconds: 15, warmup: 0.1,
    hideUi: true, camera: [{ at: 0, target: [0, 4.5], zoom: 2.2 }],
    setup: `(async () => { await ${setup.replace('wardrobeVariant: 3', 'wardrobeVariant: i % 4')};
      const R = window.__hitlRender;
      const render = R.render.bind(R);
      let t = 0;
      R.render = (dt, opts) => { t += dt; for (const c of window.attirePeople) c.update(dt); return render(dt, opts); };
    })()`,
    actions: [
      { at: 0, js: "attirePeople.forEach(c => { c.setWardrobe('preinternet'); c.setAnim('walk'); });" },
      { at: 3, js: "attirePeople.forEach(c => { c.setWardrobe('dotcom'); c.setAnim('typing'); });" },
      { at: 6, js: "attirePeople.forEach(c => { c.setWardrobe('web2'); c.setAnim('celebrate'); });" },
      { at: 9, js: "attirePeople.forEach(c => { c.setWardrobe(null); c.setAnim('facepalm'); });" },
      { at: 12, js: "attirePeople.forEach(c => { c.setWardrobe('web2'); c.setAnim('idle'); });" },
    ], screenshots: [1, 4, 7, 10, 13], size: '1920x1080', fps: 30,
  },
];
