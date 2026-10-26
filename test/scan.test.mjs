import assert from 'node:assert/strict'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanRoots } from '../src/scan.js'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wsd-scan-'))
  // A normal repository two levels down.
  await mkdir(join(root, 'dev', 'alpha', '.git'), { recursive: true })
  // A worktree-style repository: .git is a file.
  await mkdir(join(root, 'dev', 'beta'), { recursive: true })
  await writeFile(join(root, 'dev', 'beta', '.git'), 'gitdir: ../elsewhere\n')
  // A repository nested inside another repository: must NOT be reported.
  await mkdir(join(root, 'dev', 'alpha', 'vendor', 'inner', '.git'), { recursive: true })
  // A repository inside an excluded directory: must NOT be reported.
  await mkdir(join(root, 'dev', 'alpha-pack', 'node_modules', 'dep', '.git'), { recursive: true })
  await mkdir(join(root, 'cache', '.cache', 'hidden', '.git'), { recursive: true })
  // Not a repository.
  await mkdir(join(root, 'plain', 'folder'), { recursive: true })
  // A symlinked directory pointing at a repo: links are not followed.
  await symlink(join(root, 'dev', 'alpha'), join(root, 'linked-alpha'))
  return root
}

test('finds normal and worktree repositories, skips nested and excluded ones', async () => {
  const root = await fixture()
  const { candidates, errors } = await scanRoots({ roots: [root], maxDepth: 4 })
  assert.deepEqual(errors, [])
  const paths = candidates.map(candidate => candidate.path).sort()
  assert.deepEqual(paths, [join(root, 'dev', 'alpha'), join(root, 'dev', 'beta')].sort())
  assert.equal(candidates.find(c => c.path.endsWith('beta')).name, 'beta')
})

test('respects maxDepth', async () => {
  const root = await fixture()
  const { candidates } = await scanRoots({ roots: [root], maxDepth: 1 })
  assert.equal(candidates.length, 0)
})

test('a root that is itself a repository is reported', async () => {
  const root = await fixture()
  const { candidates } = await scanRoots({ roots: [join(root, 'dev', 'alpha')], maxDepth: 4 })
  assert.deepEqual(candidates.map(c => c.path), [join(root, 'dev', 'alpha')])
})

test('missing roots are reported as errors, not thrown', async () => {
  const { candidates, errors } = await scanRoots({ roots: ['/definitely/not/here-wsd'], maxDepth: 2 })
  assert.equal(candidates.length, 0)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].root, '/definitely/not/here-wsd')
})

test('duplicate roots do not duplicate candidates', async () => {
  const root = await fixture()
  const { candidates } = await scanRoots({ roots: [root, root], maxDepth: 4 })
  assert.equal(candidates.length, 2)
})

test('protected home children are skipped when passing through home, unless named as a root', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wsd-home-'))
  await mkdir(join(home, 'Documents', 'docrepo', '.git'), { recursive: true })
  await mkdir(join(home, 'dev', 'devrepo', '.git'), { recursive: true })

  const through = await scanRoots({ roots: [home], maxDepth: 3, homeDir: home })
  assert.deepEqual(through.candidates.map(c => c.path), [join(home, 'dev', 'devrepo')])

  const explicit = await scanRoots({ roots: [home, join(home, 'Documents')], maxDepth: 3, homeDir: home })
  assert.deepEqual(
    explicit.candidates.map(c => c.path).sort(),
    [join(home, 'dev', 'devrepo'), join(home, 'Documents', 'docrepo')].sort(),
  )
})
