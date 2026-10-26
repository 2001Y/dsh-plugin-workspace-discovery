/**
 * Model-facing tools for dsh-plugin-workspace-discovery.
 *
 * Raw `ToolDefinition` objects (no `defineTool` wrapper), so the plugin needs
 * no bare imports and can be mounted from any profile. Tool names, parameter
 * names and the JSON result contract are English and stable; only the human
 * panel UI is localized.
 *
 * @module dsh-plugin-workspace-discovery/tools
 */
import { registerPaths, scanAndClassify } from './discovery.js'

const OUTPUT = {
  schema: {},
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

function present(title, kind, rawInput) {
  return { card: 'generic', title, kind, ...(rawInput === undefined ? {} : { rawInput }) }
}

/**
 * Build the discovery tool definitions.
 * @param {object} ctx - Plugin context with `workspaceRegistry`.
 * @param {() => Promise<object>} getConfig - Resolves the current sanitized config.
 * @returns {object[]} Tool definitions ready for `ctx.tools.register()`.
 */
export function discoveryTools(ctx, getConfig) {
  const registry = ctx.workspaceRegistry
  return [
    {
      name: 'workspace_discover',
      description:
        'Scan the configured roots (default: the home directory tree, see the workspace-discovery plugin config) for local git repositories and report which ones are NOT yet registered as DeepSeek Harness workspaces. Read-only: nothing is registered by this tool. Returns every candidate with its path, folder name, last .git activity time and a `registered` flag, plus scan errors for roots that could not be read.',
      parameters: {
        type: 'object',
        properties: {
          roots: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute directories to scan instead of the configured roots. Omit to use the configuration.',
          },
          max_depth: {
            type: 'integer',
            minimum: 0,
            maximum: 10,
            description: 'How deep below each root to look. Omit to use the configuration (default 4).',
          },
          only_unregistered: {
            type: 'boolean',
            description: 'Return only repositories that are not registered yet. Default false.',
          },
        },
        additionalProperties: false,
      },
      output: OUTPUT,
      presentCall: args => present('Discover local projects', 'read', args?.roots?.join(', ')),
      async execute(args) {
        const config = await getConfig()
        const result = await scanAndClassify(registry, config, {
          roots: Array.isArray(args?.roots) ? args.roots : undefined,
          maxDepth: Number.isSafeInteger(args?.max_depth) ? args.max_depth : undefined,
        })
        const candidates = args?.only_unregistered === true
          ? result.candidates.filter(candidate => !candidate.registered)
          : result.candidates
        return {
          total: candidates.length,
          registeredCount: result.registeredCount,
          unregisteredCount: result.unregisteredCount,
          truncated: result.truncated,
          errors: result.errors,
          candidates,
        }
      },
    },
    {
      name: 'workspace_register_discovered',
      description:
        'Register local git repositories as DeepSeek Harness workspaces, through the official workspace registry (the same durable list the sidebar shows). Pass explicit `paths` (from workspace_discover) to register exactly those, or set `all_unregistered: true` to register every unregistered repository found under the configured roots. Registration is idempotent per directory: already-registered paths are reported, not duplicated. Directories and session history are never modified or removed.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute directory paths to register.',
          },
          all_unregistered: {
            type: 'boolean',
            description: 'Scan the configured roots and register every unregistered repository found. Default false.',
          },
        },
        additionalProperties: false,
      },
      output: OUTPUT,
      presentCall: args => present(
        'Register discovered projects',
        'execute',
        args?.all_unregistered === true ? 'all unregistered' : args?.paths?.join(', '),
      ),
      async execute(args) {
        let paths = Array.isArray(args?.paths) ? args.paths : []
        if (args?.all_unregistered === true) {
          const result = await scanAndClassify(registry, await getConfig())
          paths = [...paths, ...result.candidates.filter(candidate => !candidate.registered).map(candidate => candidate.path)]
        }
        if (paths.length === 0) {
          throw new Error('nothing to register: pass `paths` or set `all_unregistered: true`')
        }
        return registerPaths(registry, paths)
      },
    },
  ]
}
