// Cases for scripts/lib/gl.js. Exit 0 when all pass.
import assert from 'node:assert/strict';
import { glMode, glArgs, rendererMatches, SOFTWARE_GL_ARGS, GPU_GL_ARGS } from './gl.js';

const cases = [
  ['defaults to the GPU', () => assert.equal(glMode({ argv: [], env: {} }), 'gpu')],
  ['HITL_GL=software picks software', () => assert.equal(glMode({ argv: [], env: { HITL_GL: 'software' } }), 'software')],
  ['--software beats HITL_GL=gpu', () => assert.equal(glMode({ argv: ['--software'], env: { HITL_GL: 'gpu' } }), 'software')],
  ['--gpu beats HITL_GL=software', () => assert.equal(glMode({ argv: ['--gpu'], env: { HITL_GL: 'software' } }), 'gpu')],
  ['an unknown HITL_GL falls back', () => assert.equal(glMode({ argv: [], env: { HITL_GL: 'fast' }, fallback: 'software' }), 'software')],
  ['each mode has its launch flags', () => { assert.equal(glArgs('software'), SOFTWARE_GL_ARGS); assert.equal(glArgs('gpu'), GPU_GL_ARGS); }],
  ['a hardware renderer satisfies the GPU', () => assert.ok(rendererMatches('gpu', 'ANGLE (NVIDIA, Vulkan 1.4 (NVIDIA GeForce RTX 5090), NVIDIA)'))],
  ['SwiftShader does not satisfy the GPU', () => assert.ok(!rendererMatches('gpu', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))],
  ['llvmpipe does not satisfy the GPU', () => assert.ok(!rendererMatches('gpu', 'llvmpipe (LLVM 19.1.7, 256 bits)'))],
  ['no WebGL2 does not satisfy the GPU', () => { assert.ok(!rendererMatches('gpu', null)); assert.ok(!rendererMatches('gpu', '')); }],
  ['software accepts any renderer', () => assert.ok(rendererMatches('software', 'SwiftShader'))],
];
let fails = 0;
for (const [name, fn] of cases) {
  try { fn(); } catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(fails ? `gl: ${fails} failing` : 'gl: all cases pass');
process.exit(fails ? 1 : 0);
