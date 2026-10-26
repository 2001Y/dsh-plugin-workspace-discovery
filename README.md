# dsh-plugin-workspace-discovery

**English** | [简体中文](README.zh.md) | [日本語](README.ja.md)

Discover local git repositories and register them as [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) workspaces — all of them, at once, instead of adding folders one by one.

DSH's built-in workspace flow has exactly one route: pick a host directory, one at a time. If you keep dozens of repositories on one machine (under `~/dev`, `~/Documents`, …), most of them never show up in the sidebar simply because nobody registered them. This plugin closes that gap, the way Hermes Agent's workspace picker does with its `repo_scan_roots` discovery:

- **Scan** configurable roots for git repositories (`.git` directory, or a `.git` file for worktrees/submodules).
- **Review** what was found in a sidebar panel: which repositories are already workspaces and which are not, with search, select-all and per-row checkboxes.
- **Register** the selected ones — or all unregistered ones — through the official `workspaceRegistry` API. Registration is idempotent per directory, so re-running a scan never creates duplicates.
- Or let the agent do it: the model-facing tools `workspace_discover` and `workspace_register_discovered` expose the same operations inside a conversation.

Nothing is registered automatically unless you opt in (`autoRegister`), no `git` subprocess is ever spawned, and no workspace file is written directly — the plugin only drives the official registry, so uninstalling it leaves every workspace exactly as it was.

## Install

```sh
dsh plugin --profile web add dsh-plugin-workspace-discovery
```

Then restart the web profile and refresh the page. From a local checkout:

```sh
git clone https://github.com/2001Y/dsh-plugin-workspace-discovery
dsh plugin --profile web add ./dsh-plugin-workspace-discovery
```

## Use

Click **Discover projects** at the bottom of the sidebar (the badge shows how many unregistered repositories were found). In the panel:

1. Adjust the **scan roots** if needed (one absolute path per line) and the max depth, then **Save**.
2. **Scan** (or Rescan) and review the list. Registered repositories are badged and cannot be selected again.
3. **Register selected**, or **Register all unregistered**.

## Configuration

Settings live in a host-shared file, `$DSH_HOME/workspace-discovery.config.json`, so every browser hitting the same DSH host shares them. The panel edits this file; a profile patch row can seed initial values:

```yaml
- insert:
    - id: workspace-discovery
      name: "dsh-plugin-workspace-discovery"
      config:
        roots: ["~/dev", "~/Documents"]
        maxDepth: 4
        exclude: ["vendor"]
        autoRegister: false
```

| Field | Default | Meaning |
|---|---|---|
| `roots` | `[~]` | Directories to walk. `~` is expanded; relative paths are ignored. |
| `maxDepth` | `4` | How deep below each root to look (0–10). |
| `exclude` | `[]` | Extra directory names to skip, on top of the built-ins (`node_modules`, `.cache`, `.dsh`, `Library`, …). |
| `autoRegister` | `false` | Register every unregistered repository once at startup. Opt-in only. |

Scanning never follows symlinks, never descends into a repository it already found (so nested checkouts are not reported separately), and classifies results against the registry's canonical paths.

Two macOS-specific safeguards: when the walk passes through the home directory it does **not** wander into the folders macOS guards with TCC privacy prompts (`Documents`, `Downloads`, `Desktop`, `Pictures`, `Movies`, `Music`, `Library`) — reading those from a background process can block on a consent prompt nobody is there to answer. Name such a folder as a scan root explicitly if you keep repositories there (and grant the DSH host access if macOS asks). And the walk itself runs in a child process with a 25-second per-root timeout, so a blocked or enormous tree costs one root an error entry instead of stalling the Harness.

## Model-facing tools

| Tool | Effect |
|---|---|
| `workspace_discover` | Scan and report candidates with a `registered` flag. Read-only. Accepts one-off `roots` / `max_depth` / `only_unregistered`. |
| `workspace_register_discovered` | Register explicit `paths`, or everything unregistered with `all_unregistered: true`. |

## Internationalization

The panel UI ships in **English, Simplified Chinese and Japanese** (`locale/`), follows the language DSH is displaying, and the dictionaries are kept key-identical by tests. Tool names and the JSON contract stay English so callers can match on them reliably.

## How it works

- `index.js` — Cordis host plugin. Requires `workspaceRegistry` and `tools`; mounts HTTP routes only when a `webServer` service exists.
- `src/scan.js` — the filesystem walk (pure, subprocess-free).
- `src/discovery.js` — scan + classify + register, shared by routes and tools.
- `src/config.js` — config sanitizing and the host-shared JSON file.
- `client/` — the browser bundle (`src.js` is the source; `client.js` is built from it with `npm run build`, inlining the locale dictionaries).

Zero runtime dependencies. Requires Node.js ≥ 20 and DSH 0.2.x.

## Development

```sh
npm test   # builds the client bundle, then runs node --test
```

## License

MIT
