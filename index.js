/**
 * dsh-plugin-workspace-discovery — discover local git repositories and
 * register them as DeepSeek Harness workspaces.
 *
 * The plugin owns no registry state of its own: scanning is a pure read of
 * the filesystem, and registration goes through the official
 * `ctx.workspaceRegistry` API, so the sidebar, the Remote workspace
 * namespace and this plugin all converge on the same durable registry.
 *
 * Composition:
 *   - required: `workspaceRegistry`, `tools`
 *   - optional: `webServer` (the Web UI panel routes; absent in headless
 *     profiles, where the tools still work)
 *
 * Declared dependency-free on purpose: only Node builtins and relative
 * imports, so no profile `node_modules` resolution is needed to load it.
 *
 * @module dsh-plugin-workspace-discovery
 */
import { loadConfig } from './src/config.js'
import { registerPaths, scanAndClassify } from './src/discovery.js'
import { discoveryRoutes } from './src/routes.js'
import { discoveryTools } from './src/tools.js'

/** Plugin name reported to the Cordis Loader. */
export const name = 'workspace-discovery'

/** Required services; the Loader waits for all of them before calling `apply`. */
export const inject = ['workspaceRegistry', 'tools']

/**
 * Mount the discovery tools, the Web UI routes (when a web server exists),
 * and the optional startup auto-registration.
 * @param {object} ctx - Plugin context.
 * @param {object} [patchConfig] - Config from the profile patch row.
 */
export function apply(ctx, patchConfig) {
  let config = null
  const ready = loadConfig(patchConfig).then((loaded) => { config = loaded })
  const getConfig = () => config ?? {
    roots: [],
    maxDepth: 4,
    exclude: [],
    autoRegister: false,
  }
  const state = {
    getConfig,
    getConfigAsync: async () => { await ready; return getConfig() },
    setConfig: (next) => { config = next },
  }

  for (const definition of discoveryTools(ctx, state.getConfigAsync)) ctx.tools.register(definition)

  // Web UI routes are an optional seam: mount them only when this profile
  // actually provides a web server.
  ctx.inject(['webServer'], (webCtx) => {
    const routes = discoveryRoutes(webCtx, state)
    const disposers = routes.map(route => webCtx.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  })

  // Optional startup pass: register everything unregistered, but only when
  // the user explicitly turned it on. A discovery plugin must never add
  // workspaces behind the user's back by default.
  void ready.then(async () => {
    if (getConfig().autoRegister !== true) return
    try {
      const result = await scanAndClassify(ctx.workspaceRegistry, getConfig())
      const paths = result.candidates
        .filter(candidate => !candidate.registered)
        .map(candidate => candidate.path)
      if (paths.length > 0) await registerPaths(ctx.workspaceRegistry, paths)
    } catch (error) {
      ctx.logger?.warn?.(`workspace-discovery: startup auto-register failed: ${String(error)}`)
    }
  })
}
