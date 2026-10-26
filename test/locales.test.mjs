import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const LANGS = ['en', 'zh', 'ja']

async function load(lang) {
  return JSON.parse(await readFile(join(root, 'locale', `${lang}.json`), 'utf8'))
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
}

test('all locales share the en key set and placeholders', async () => {
  const en = await load('en')
  const enKeys = Object.keys(en).sort()
  for (const lang of LANGS.slice(1)) {
    const dict = await load(lang)
    assert.deepEqual(Object.keys(dict).sort(), enKeys, `${lang} key set differs from en`)
    for (const key of enKeys) {
      assert.deepEqual(placeholders(dict[key]), placeholders(en[key]), `${lang}.${key} placeholders differ`)
      assert.ok(dict[key].trim().length > 0, `${lang}.${key} is empty`)
    }
  }
})

test('the built client bundle inlines every locale', async () => {
  const bundle = await readFile(join(root, 'client', 'client.js'), 'utf8')
  const en = await load('en')
  for (const key of Object.keys(en)) {
    assert.ok(bundle.includes(`"${key}"`), `client bundle is missing key ${key} (run npm run build)`)
  }
})
