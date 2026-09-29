import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { instrumentCharacter, controlPerkDelay } from './instrument.mjs';

// Native imports preserve the game's update code; only presentation construction is redirected.
export function installLoader({ initialPerkDelay } = {}) {
  const root = new URL('../../', import.meta.url);
  const presentation = new URL('./presentation.mjs', import.meta.url).href;
  const nativeThree = import.meta.resolve('three');
  return registerHooks({
    resolve(specifier, context, next) {
      if (specifier === './post.js' && context.parentURL === new URL('src/render/index.js', root).href) return { url: presentation, shortCircuit: true };
      if (specifier === 'three' && context.parentURL === new URL('src/render/index.js', root).href) {
        return { url: 'scene-engine:three', shortCircuit: true };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'scene-engine:three') return { format: 'module', shortCircuit: true,
        source: `export * from ${JSON.stringify(nativeThree)}; export { WebGLRenderer } from ${JSON.stringify(presentation)};` };
      if (url.startsWith(new URL('src/', root).href) && url.endsWith('.js')) {
        let source = readFileSync(new URL(url), 'utf8');
        if (url === new URL('src/render/character.js', root).href) source = instrumentCharacter(source);
        if (initialPerkDelay != null && url === new URL('src/render/perks.js', root).href) source = controlPerkDelay(source, initialPerkDelay);
        return { format: 'module', shortCircuit: true, source: `import.meta.env = { BASE_URL: '/', DEV: true };\n${source}` };
      }
      return next(url, context);
    },
  });
}
