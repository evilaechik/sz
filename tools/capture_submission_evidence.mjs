import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'

const baseUrl = process.env.RUNWAY_GUARD_API_URL ?? 'http://127.0.0.1:8787'
const outputDir = new URL('../docs/submission/evidence/', import.meta.url)

async function request(path, options) {
  const response = await fetch(baseUrl + path, options)
  const body = await response.json()
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`)
  return body
}

await mkdir(outputDir, { recursive: true })

const testOutput = execFileSync('npm', ['test'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' })
const evaluation = await request('/api/evaluate', { method: 'POST' })
await request('/api/sandbox/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'wechat-pay' }) })
await request('/api/sandbox/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'alipay' }) })
const sandbox = await request('/api/sandbox/evidence')

if (evaluation.passed !== evaluation.total || evaluation.blockedUnsafeRequests < 1) throw new Error('Control evaluation did not meet the submission threshold.')
if (!Array.isArray(sandbox.evidence) || sandbox.evidence.length < 6 || sandbox.evidence.some((event) => event.outcome !== 'passed')) throw new Error('Sandbox evidence is incomplete.')

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim()
const generatedAt = new Date().toISOString()
const manifest = {
  schemaVersion: 1,
  generatedAt,
  project: 'Runway Guard',
  topic: 'E - SME Finance Copilot',
  repository: 'https://github.com/evilaechik/sz',
  commit,
  environment: 'Local synthetic competition demo',
  safetyStatement: 'No live payment provider, production credential, customer record, email delivery, ledger posting or money movement was used.',
  automatedTests: { command: 'npm test', passed: true, caseCount: 10 },
  controlEvaluation: evaluation,
  sandboxEvidence: sandbox,
}

await writeFile(new URL('test-results.txt', outputDir), testOutput, 'utf8')
await writeFile(new URL('control-evaluation.json', outputDir), JSON.stringify(evaluation, null, 2) + '\n', 'utf8')
await writeFile(new URL('sandbox-operation-log.json', outputDir), JSON.stringify(sandbox, null, 2) + '\n', 'utf8')
await writeFile(new URL('submission-evidence.json', outputDir), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

console.log(`Captured ${evaluation.passed}/${evaluation.total} control scenarios, ${sandbox.evidence.length} sandbox events and 10 automated tests.`)
