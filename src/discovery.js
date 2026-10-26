/**
 * Discovery operations shared by the HTTP routes, the model-facing tools and
 * the optional startup auto-registration: scan the configured roots, classify
 * each repository against the workspace registry, and register selected paths
 * through the official registry API only.
 *
 * Scans run in a child process (src/scan-cli.js), one root at a time, with a
 * timeout. A filesystem read that blocks — a macOS privacy prompt for a
 * guarded folder is the classic case — therefore costs one root an error
 * entry instead of stalling the Harness host. Scans are serialized: a second
 * caller waits for the first rather than doubling the walk.
 *
 * @module dsh-plugin-workspace-discovery/discovery
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCAN_CLI = fileURLToPath(new URL('./scan-cli.js', import.meta.url))

/** Per-root scan timeout in milliseconds. */
export const SCAN_TIMEOUT_MS = 25_000

let scanChain = Promise.resolve()

function runScanChild(options) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCAN_CLI, JSON.stringify(options)],
      { timeout: SCAN_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (error !== null) {
          const timedOut = error.killed === true || error.signal === 'SIGKILL'
          resolve({
            candidates: [],
            errors: (options.roots ?? []).map(root => ({
              root,
              error: timedOut
                ? 'scan timed out — a folder under this root may be waiting on a macOS privacy (TCC) prompt, or the tree is very large'
                : String(error.message ?? error),
            })),
            truncated: false,
          })
          return
        }
        try {
          resolve(JSON.parse(stdout))
        } catch {
          resolve({
            candidates: [],
            errors: (options.roots ?? []).map(root => ({ root, error: 'scan produced unreadable output' })),
            truncated: false,
          })
        }
      },
    )
  })
}

/**
 * Run one scan in a child process, serialized against other scans.
 * @param {object} options - scanRoots options (single root per call by convention).
 * @returns {Promise<{candidates: Array<object>, errors: Array<object>, truncated: boolean}>}
 */
export function runScan(options) {
  const task = scanChain.then(() => runScanChild(options))
  scanChain = task.then(() => {}, () => {})
  return task
}

/**
 * Scan and annotate every candidate with its registration state.
 * @param {object} registry - The Harness workspace registry (`ctx.workspaceRegistry`).
 * @param {object} config - Sanitized config (see config.js).
 * @param {object} [overrides] - One-off `roots` / `maxDepth` overrides.
 * @returns {Promise<{candidates: Array<object>, errors: Array<object>, truncated: boolean, registeredCount: number, unregisteredCount: number}>}
 */
export async function scanAndClassify(registry, config, overrides = {}) {
  const registeredPaths = new Set(registry.list().map(workspace => workspace.path))
  const roots = overrides.roots ?? config.roots
  const maxDepth = overrides.maxDepth ?? config.maxDepth

  const byPath = new Map()
  const errors = []
  let truncated = false
  for (const root of roots) {
    const result = await runScan({ roots: [root], maxDepth, exclude: config.exclude })
    for (const candidate of result.candidates) byPath.set(candidate.path, candidate)
    errors.push(...result.errors)
    truncated = truncated || result.truncated
  }

  const candidates = [...byPath.values()]
    .map(candidate => ({ ...candidate, registered: registeredPaths.has(candidate.path) }))
    .sort((left, right) => {
      const byTime = String(right.gitMtime ?? '').localeCompare(String(left.gitMtime ?? ''))
      return byTime !== 0 ? byTime : left.path.localeCompare(right.path)
    })
  return {
    candidates,
    errors,
    truncated,
    registeredCount: candidates.filter(candidate => candidate.registered).length,
    unregisteredCount: candidates.filter(candidate => !candidate.registered).length,
  }
}

/**
 * Register the given absolute paths as workspaces.
 *
 * Registration goes through `registry.create()`, which is idempotent per
 * canonical path, so an already-registered path is reported as such instead
 * of producing a duplicate. One path's failure never stops the others.
 * @param {object} registry - The Harness workspace registry.
 * @param {string[]} paths - Absolute directory paths to register.
 * @returns {Promise<{created: Array<{id: string, path: string, title: string}>, alreadyRegistered: Array<{id: string, path: string, title: string}>, failed: Array<{path: string, error: string}>}>}
 */
export async function registerPaths(registry, paths) {
  const created = []
  const alreadyRegistered = []
  const failed = []
  for (const path of [...new Set(Array.isArray(paths) ? paths : [])]) {
    if (typeof path !== 'string' || path.length === 0) continue
    try {
      const existing = await registry.resolveByPath(path)
      if (existing !== undefined) {
        alreadyRegistered.push({ id: String(existing.id), path: existing.path, title: existing.title })
        continue
      }
      const workspace = await registry.create(path)
      created.push({ id: String(workspace.id), path: workspace.path, title: workspace.title })
    } catch (error) {
      failed.push({ path, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { created, alreadyRegistered, failed }
}
