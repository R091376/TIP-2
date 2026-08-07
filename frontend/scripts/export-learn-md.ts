/**
 * Write Learn topics to public/learn-export/ as static Markdown (+ HTML index).
 *
 * Usage (from frontend/):
 *   npx vite-node scripts/export-learn-md.ts
 *   npm run export:learn
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_TOPICS } from '../src/learn/catalog'
import {
  buildLearnExportAll,
  buildLearnExportHtmlIndex,
  buildLearnExportIndex,
  topicExportRelPath,
  topicToMarkdown,
} from '../src/learn/toMarkdown'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outRoot = join(__dirname, '..', 'public', 'learn-export')
const baseUrl = (process.env.LEARN_EXPORT_BASE_URL || '').replace(/\/$/, '')

mkdirSync(outRoot, { recursive: true })

const opts = baseUrl ? { baseUrl } : undefined

for (const topic of ALL_TOPICS) {
  const rel = topicExportRelPath(topic)
  const full = join(outRoot, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, topicToMarkdown(topic, opts), 'utf8')
  console.log('wrote', rel)
}

writeFileSync(join(outRoot, 'index.md'), buildLearnExportIndex(ALL_TOPICS, opts), 'utf8')
writeFileSync(join(outRoot, 'ALL.md'), buildLearnExportAll(ALL_TOPICS, opts), 'utf8')
writeFileSync(join(outRoot, 'index.html'), buildLearnExportHtmlIndex(ALL_TOPICS), 'utf8')
console.log(`export complete → ${outRoot} (${ALL_TOPICS.length} topics)`)
