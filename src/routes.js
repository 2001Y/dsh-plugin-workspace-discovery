/**
 * HTTP routes backing the Web UI panel, following the `ctx.webServer.register`
 * contract used by other DSH web plugins: each route is
 * `{ kind: 'exact', path, handler(req, res) }` with Node http objects.
 *
 * @module dsh-plugin-workspace-discovery/routes
 */
import { registerPaths, scanAndClassify } from './discovery.js'
import { saveConfig } from './config.js'

const BASE = '/api/workspace-discovery'

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let buffer = ''
    req.on('data', chunk => { buffer += chunk })
    req.on('end', () => {
      try {
        resolve(JSON.parse(buffer || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function failure(res, error) {
  json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
}

/**
 * Build the route list.
 * @param {object} ctx - Plugin context with `workspaceRegistry`.
 * @param {{getConfig: () => object, setConfig: (config: object) => void}} state
 * @returns {object[]} Routes for `ctx.webServer.register`.
 */
export function discoveryRoutes(ctx, state) {
  const registry = ctx.workspaceRegistry
  return [
    {
      kind: 'exact',
      path: `${BASE}/state`,
      handler: (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        state.getConfigAsync()
          .then(config => json(res, 200, { ok: true, config }), error => failure(res, error))
      },
    },
    {
      kind: 'exact',
      path: `${BASE}/scan`,
      handler: (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        readBody(req)
          .then(async body => scanAndClassify(registry, await state.getConfigAsync(), {
            roots: Array.isArray(body?.roots) ? body.roots : undefined,
            maxDepth: Number.isSafeInteger(body?.maxDepth) ? body.maxDepth : undefined,
          }))
          .then(result => json(res, 200, { ok: true, ...result }), error => failure(res, error))
      },
    },
    {
      kind: 'exact',
      path: `${BASE}/register`,
      handler: (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        readBody(req)
          .then(body => registerPaths(registry, Array.isArray(body?.paths) ? body.paths : []))
          .then(result => json(res, 200, { ok: true, ...result }), error => failure(res, error))
      },
    },
    {
      kind: 'exact',
      path: `${BASE}/config`,
      handler: (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        readBody(req)
          .then(async (body) => {
            const saved = await saveConfig(body?.config ?? body)
            if (saved === null) return json(res, 400, { ok: false, error: 'invalid config' })
            state.setConfig(saved)
            json(res, 200, { ok: true, config: saved })
          }, error => failure(res, error))
      },
    },
  ]
}
