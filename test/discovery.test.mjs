import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { registerPaths, scanAndClassify } from '../src/discovery.js'

/** Minimal registry double with the same contract as ctx.workspaceRegistry. */
function fakeRegistry() {
  const byPath = new Map()
  let nextId = 1
  return {
    byPath,
    list: () => [...byPath.values()],
    resolveByPath: async (path) => byPath.get(await realpath(path)),
    create: async (path) => {
      const canonical = await realpath(path)
      if (byPath.has(canonical)) return byPath.get(canonical)
      const workspace = {
        id: `ws-${nextId++}`,
        path: canonical,
        title: canonical.split('/').pop(),
        sessionIds: [],
      }
      byPath.set(canonical, workspace)
      return workspace
    },
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wsd-discovery-'))
  await mkdir(join(root, 'one', '.git'), { recursive: true })
  await mkdir(join(root, 'two', '.git'), { recursive: true })
  return root
}

test('scanAndClassify marks registered candidates', async () => {
  const root = await fixture()
  const registry = fakeRegistry()
  await registry.create(join(root, 'one'))
  const result = await scanAndClassify(registry, { roots: [root], maxDepth: 2, exclude: [] })
  assert.equal(result.candidates.length, 2)
  assert.equal(result.registeredCount, 1)
  assert.equal(result.unregisteredCount, 1)
  assert.equal(result.candidates.find(c => c.path.endsWith('one')).registered, true)
  assert.equal(result.candidates.find(c => c.path.endsWith('two')).registered, false)
})

test('registerPaths is idempotent and reports per-path outcomes', async () => {
  const root = await fixture()
  const registry = fakeRegistry()
  const first = await registerPaths(registry, [join(root, 'one'), join(root, 'two')])
  assert.equal(first.created.length, 2)
  const second = await registerPaths(registry, [join(root, 'one')])
  assert.equal(second.created.length, 0)
  assert.equal(second.alreadyRegistered.length, 1)
  assert.equal(registry.list().length, 2)
})

test('registerPaths isolates failures', async () => {
  const root = await fixture()
  const registry = fakeRegistry()
  const result = await registerPaths(registry, ['/definitely/not/here-wsd', join(root, 'one')])
  assert.equal(result.created.length, 1)
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].path, '/definitely/not/here-wsd')
})
