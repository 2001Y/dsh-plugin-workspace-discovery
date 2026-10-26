/**
 * Git repository scanning for dsh-plugin-workspace-discovery.
 *
 * Pure filesystem walk: no `git` subprocess, no network. A directory counts
 * as a repository when it directly contains a `.git` entry — a directory for
 * a normal repository, or a file for a linked worktree / submodule. Once a
 * repository is found the walk does not descend into it, so nested checkouts
 * and vendored copies inside a repo are not reported separately.
 *
 * @module dsh-plugin-workspace-discovery/scan
 */
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** Directory names never descended into during a scan. */
export const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  '.cache',
  '.local',
  '.npm',
  '.pnpm-store',
  '.cargo',
  '.rustup',
  '.dsh',
  '.Trash',
  'Library',
]

/**
 * Scan the given roots for git repositories.
 * @param {object} options
 * @param {string[]} options.roots - Absolute directories to walk.
 * @param {number} [options.maxDepth] - How deep below each root to look (root = 0).
 * @param {string[]} [options.exclude] - Extra directory names to skip, on top of DEFAULT_EXCLUDE.
 * @param {number} [options.maxResults] - Safety cap on reported repositories.
 * @returns {Promise<{candidates: Array<{path: string, name: string, gitMtime: string | null}>, errors: Array<{root: string, error: string}>, truncated: boolean}>}
 *   Candidates sorted by most recent `.git` activity first (mtime descending,
 *   name as tiebreak). Paths are canonical (realpath-resolved) and unique.
 */
export async function scanRoots(options) {
  const roots = Array.isArray(options?.roots) ? options.roots : []
  const maxDepth = clampDepth(options?.maxDepth)
  const exclude = new Set([...DEFAULT_EXCLUDE, ...(options?.exclude ?? [])])
  const maxResults = Number.isSafeInteger(options?.maxResults) && options.maxResults > 0
    ? options.maxResults
    : 5000

  const found = new Map()
  const errors = []
  let truncated = false

  for (const root of roots) {
    if (typeof root !== 'string' || root.length === 0) continue
    let canonicalRoot
    try {
      canonicalRoot = await realpath(root)
      const info = await stat(canonicalRoot)
      if (!info.isDirectory()) {
        errors.push({ root, error: 'not a directory' })
        continue
      }
    } catch (error) {
      errors.push({ root, error: errorMessage(error) })
      continue
    }
    const stack = [{ dir: canonicalRoot, depth: 0 }]
    while (stack.length > 0) {
      const { dir, depth } = stack.pop()
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      const gitEntry = entries.find(entry => entry.name === '.git')
      if (gitEntry !== undefined && (gitEntry.isDirectory() || gitEntry.isFile())) {
        if (!found.has(dir)) {
          let gitMtime = null
          try {
            gitMtime = (await stat(join(dir, '.git'))).mtime.toISOString()
          } catch {
            gitMtime = null
          }
          found.set(dir, { path: dir, name: basename(dir), gitMtime })
          if (found.size >= maxResults) truncated = true
        }
        continue
      }
      if (depth >= maxDepth) continue
      for (const entry of entries) {
        // Dirent.isDirectory() is false for symlinks, so links are never followed.
        if (!entry.isDirectory()) continue
        if (exclude.has(entry.name)) continue
        stack.push({ dir: join(dir, entry.name), depth: depth + 1 })
      }
    }
  }

  const candidates = [...found.values()].sort((left, right) => {
    const byTime = String(right.gitMtime ?? '').localeCompare(String(left.gitMtime ?? ''))
    return byTime !== 0 ? byTime : left.path.localeCompare(right.path)
  })
  return { candidates, errors, truncated }
}

function clampDepth(value) {
  if (!Number.isSafeInteger(value)) return 4
  return Math.min(10, Math.max(0, value))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
