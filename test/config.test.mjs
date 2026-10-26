import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRoots, sanitizeConfig } from '../src/config.js'

const HOME = '/home/example'

test('defaults: home root, depth 4, no auto-register', () => {
  const config = sanitizeConfig({}, HOME)
  assert.deepEqual(config.roots, [HOME])
  assert.equal(config.maxDepth, 4)
  assert.equal(config.autoRegister, false)
  assert.deepEqual(defaultRoots(HOME), [HOME])
})

test('expands ~, drops relative and non-string roots', () => {
  const config = sanitizeConfig({ roots: ['~/dev', 'relative/path', 42, '/abs'] }, HOME)
  assert.deepEqual(config.roots, ['/home/example/dev', '/abs'])
})

test('clamps maxDepth and validates exclude entries', () => {
  const config = sanitizeConfig({ maxDepth: 99, exclude: ['build', 'a/b', ''] }, HOME)
  assert.equal(config.maxDepth, 10)
  assert.deepEqual(config.exclude, ['build'])
})

test('non-object config is rejected', () => {
  assert.equal(sanitizeConfig('nope', HOME), null)
  assert.equal(sanitizeConfig([1, 2], HOME), null)
})

test('autoRegister is opt-in only', () => {
  assert.equal(sanitizeConfig({ autoRegister: 'yes' }, HOME).autoRegister, false)
  assert.equal(sanitizeConfig({ autoRegister: true }, HOME).autoRegister, true)
})
