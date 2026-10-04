import { test, expect } from 'claude-code/testing'

// A fake host under the plugin: a session in /w, git answering from a table, ps listing one wait-for.sh
// whose working directory is the worktree, and Bash answering "ran" for anything the guards pass.
type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ok = (stdout = ''): Run => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const no: Run = { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

function host(on: any, { tracked = [] as string[], watcher = false } = {}) {
  on('session.cwd', () => '/w')
  on('process.run', (_$: unknown, e: { argv: string[] }) => {
    const a = e.argv.join(' ')
    if (a === 'git rev-parse --show-toplevel') return ok('/w\n')
    if (a === 'git rev-parse --absolute-git-dir') return ok('/w/.git\n')
    if (a.startsWith('git ls-files')) { const p = e.argv[e.argv.length - 1]; return tracked.includes(p) ? ok(`${p}\n`) : no }
    if (a.startsWith('git rev-parse --verify')) return ok('abc\n')
    if (a.startsWith('ps ')) return ok(watcher ? ' 4242 bash scripts/wait-for.sh 1316 --merged\n 77 vim\n' : ' 77 vim\n')
    return no
  })
  on('fs.read', (_$: unknown, e: { path: string }) => {
    if (e.path.endsWith('lanes.txt')) return 'tools    blender/checks/ scripts/tools/\nart      src/render/\n'
    throw new Error('no such file')
  })
  on('fs.stat', (_$: unknown, e: { path: string }) => {
    if (e.path === '/proc/4242/cwd') return { kind: 'dir', size: 0, isSymlink: true, realPath: '/w' }
    throw new Error('no such file')
  })
  on('fs.list', () => { throw new Error('no such dir') })
  on('tool.call', { tool: 'Bash' }, () => ({ text: 'ran' }))
}

test('answers a sed -i of a tracked file with Edit and its owner lane', async ($, on) => {
  host(on, { tracked: ['src/render/character.js'] })
  const r = await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' src/render/character.js" })
  expect(r.deny ?? r.text).toContain('its owner lane is art')
  expect(r.deny ?? r.text).toContain('Edit or Write')
})

test('lets a shell write to an untracked file through', async ($, on) => {
  host(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > /tmp/scratch/out.txt' })
  expect(r.deny).toBeUndefined()
  expect(r.text).toBe('ran')
})

test('refuses a branch switch in a worktree a wait-for.sh is watching', async ($, on) => {
  host(on, { watcher: true })
  const r = await $.tool.call({ tool: 'Bash', command: 'git checkout tools/other' })
  expect(r.deny ?? r.text).toContain('wait-for.sh 1316 --merged (pid 4242)')
})

test('lets a branch switch through when nothing watches the worktree', async ($, on) => {
  host(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'git switch -c tools/new' })
  expect(r.text).toBe('ran')
})
