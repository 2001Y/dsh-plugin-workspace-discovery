/**
 * Configuration resolution for dsh-plugin-workspace-discovery.
 *
 * Precedence, highest first:
 *   1. The host-shared JSON file ($DSH_HOME/workspace-discovery.config.json) —
 *      the same file the Web UI panel edits, so every browser shares roots.
 *   2. The profile patch row's `config:` block (initial values).
 *   3. Built-in defaults (home directory plus common development folders).
 *
 * @module dsh-plugin-workspace-discovery/config
 */
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/** Folder names under the home directory that are scanned with the home root. */
export const COMMON_HOME_FOLDERS = [
  'dev',
  'code',
  'projects',
  'src',
  'repos',
  'workspace',
  'Documents',
  'Desktop',
]

/** @returns {string} Path of the host-shared config file. */
export function hostConfigPath(env = process.env) {
  const home = env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'workspace-discovery.config.json')
}

/**
 * Built-in default roots: the home directory itself (the walk covers the
 * common folders below it), expanded to absolute paths.
 * @param {string} [home] - Home directory override (tests).
 * @returns {string[]}
 */
export function defaultRoots(home = homedir()) {
  return [home]
}

/**
 * Normalize an unknown value into a valid config, or return null when the
 * value is not an object at all.
 * @param {unknown} value
 * @param {string} [home] - Home directory for `~` expansion and defaults.
 * @returns {{roots: string[], maxDepth: number, exclude: string[], autoRegister: boolean} | null}
 */
export function sanitizeConfig(value, home = homedir()) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const roots = Array.isArray(value.roots)
    ? value.roots
      .filter(entry => typeof entry === 'string' && entry.trim().length > 0)
      .map(entry => expandHome(entry.trim(), home))
      .filter(entry => isAbsolute(entry))
      .slice(0, 50)
    : defaultRoots(home)
  const maxDepth = Number.isSafeInteger(value.maxDepth)
    ? Math.min(10, Math.max(0, value.maxDepth))
    : 4
  const exclude = Array.isArray(value.exclude)
    ? value.exclude.filter(entry => typeof entry === 'string' && entry.length > 0 && !entry.includes('/')).slice(0, 100)
    : []
  return {
    roots: roots.length > 0 ? roots : defaultRoots(home),
    maxDepth,
    exclude,
    autoRegister: value.autoRegister === true,
  }
}

/**
 * Merge a patch-row config (base) with the host JSON file (override).
 * @param {unknown} patchConfig - Config from the profile patch row.
 * @param {string} [home]
 * @returns {Promise<{roots: string[], maxDepth: number, exclude: string[], autoRegister: boolean}>}
 */
export async function loadConfig(patchConfig, home = homedir()) {
  const base = sanitizeConfig(patchConfig ?? {}, home) ?? {
    roots: defaultRoots(home),
    maxDepth: 4,
    exclude: [],
    autoRegister: false,
  }
  try {
    const parsed = JSON.parse(await readFile(hostConfigPath(), 'utf8'))
    const file = sanitizeConfig(parsed, home)
    if (file !== null) return { ...base, ...file }
  } catch {
    // No host file yet, or it is unreadable: the base config stands.
  }
  return base
}

/**
 * Persist a config to the host-shared JSON file.
 * @param {unknown} value - Raw config to sanitize and write.
 * @param {string} [home]
 * @returns {Promise<object | null>} The sanitized config, or null when invalid.
 */
export async function saveConfig(value, home = homedir()) {
  const config = sanitizeConfig(value, home)
  if (config === null) return null
  await writeFile(hostConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}

function expandHome(entry, home) {
  if (entry === '~') return home
  if (entry.startsWith('~/')) return join(home, entry.slice(2))
  return entry
}
