// Runs every NN-*.js demo in order, each in its own process with a scrubbed
// environment (no OPENAI_API_KEY / LANGFUSE_*). Exit code aggregates results.
// This is Slice 0's acceptance suite — see design/a2a-learning-slice.md §9.

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scrubbedEnv } from './lib/harness.js'

const demosDir = fileURLToPath(new URL('.', import.meta.url))
const demos = readdirSync(demosDir)
  .filter((file) => /^\d{2}-.*\.js$/.test(file))
  .sort()

if (demos.length === 0) {
  console.log('No demos found yet.')
  process.exit(0)
}

let failed = 0
for (const demo of demos) {
  console.log(`\n━━━ ${demo} ━━━`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [demo], {
      cwd: demosDir,
      stdio: 'inherit',
      env: scrubbedEnv(),
    })
    child.on('exit', resolve)
  })
  if (code !== 0) failed += 1
}

console.log(
  failed === 0
    ? `\n✔ all ${demos.length} demos passed`
    : `\n✘ ${failed} of ${demos.length} demos failed`,
)
process.exit(failed === 0 ? 0 : 1)
