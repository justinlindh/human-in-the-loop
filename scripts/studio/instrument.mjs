// Read-only character handles let the prototype call joints() without a second rig definition.
export function instrumentCharacter(source) {
  const declaration = 'export function createCharacter(';
  if (source.split(declaration).length !== 2) throw new Error('scene-engine: character factory signature changed');
  return source.replace(declaration, 'function sceneEngineCharacter(') + `
export function createCharacter(...args) {
  const character = sceneEngineCharacter(...args);
  (globalThis.__sceneCharacters ??= new WeakMap()).set(character.root, character);
  return character;
}
`;
}

export function controlPerkDelay(source, delay) {
  const declaration = 'let clock = rnd(2, 4);';
  if (source.split(declaration).length !== 2 || !Number.isFinite(delay) || delay < 0) throw new Error('scene-engine: invalid perk delay control');
  return source.replace(declaration, `let clock = ${delay};`);
}
