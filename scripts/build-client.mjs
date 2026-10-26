/**
 * Build client/client.js from client/src.js by inlining the locale
 * dictionaries (locale/*.json) at the LOCALES marker. The shipped bundle is
 * a single self-contained file, like other DSH client plugins; the JSON files
 * stay the canonical, translator-friendly source.
 *
 * Usage: node scripts/build-client.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MARKER = '/*__LOCALES__*/'

const locales = {}
for (const lang of ['en', 'zh', 'ja']) {
  locales[lang] = JSON.parse(await readFile(join(root, 'locale', `${lang}.json`), 'utf8'))
}

const source = await readFile(join(root, 'client', 'src.js'), 'utf8')
if (!source.includes(MARKER)) {
  throw new Error(`marker ${MARKER} not found in client/src.js`)
}
const bundle = source.replace(MARKER, `var LOCALES = ${JSON.stringify(locales, null, 2)};`)
await writeFile(join(root, 'client', 'client.js'), bundle, 'utf8')
console.log('client/client.js built with locales:', Object.keys(locales).join(', '))
