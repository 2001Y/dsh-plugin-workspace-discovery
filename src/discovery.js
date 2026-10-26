/**
 * Discovery operations shared by the HTTP routes, the model-facing tools and
 * the optional startup auto-registration: scan the configured roots, classify
 * each repository against the workspace registry, and register selected paths
 * through the official registry API only.
 *
 * @module dsh-plugin-workspace-discovery/discovery
 */
import { scanRoots } from './scan.js'

/**
 * Scan and annotate every candidate with its registration state.
 * @param {object} registry - The Harness workspace registry (`ctx.workspaceRegistry`).
 * @param {object} config - Sanitized config (see config.js).
 * @param {object} [overrides] - One-off `roots` / `maxDepth` overrides.
 * @returns {Promise<{candidates: Array<object>, errors: Array<object>, truncated: boolean, registeredCount: number, unregisteredCount: number}>}
 */
export async function scanAndClassify(registry, config, overrides = {}) {
  const registeredPaths = new Set(registry.list().map(workspace => workspace.path))
  const { candidates, errors, truncated } = await scanRoots({
    roots: overrides.roots ?? config.roots,
    maxDepth: overrides.maxDepth ?? config.maxDepth,
    exclude: config.exclude,
  })
  const annotated = candidates.map(candidate => ({
    ...candidate,
    registered: registeredPaths.has(candidate.path),
  }))
  return {
    candidates: annotated,
    errors,
    truncated,
    registeredCount: annotated.filter(candidate => candidate.registered).length,
    unregisteredCount: annotated.filter(candidate => !candidate.registered).length,
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
