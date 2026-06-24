import { createDoc, listDocs } from '../lib/docstore'
import { isTest } from '../lib/env'
import { logger } from '../lib/logger'
import { db, sqlite } from './index'
import { runMigrations } from './migrate'
import { maintenanceConfig } from './schema'

// Idempotent seed — safe to run repeatedly. Run via `bun run db:seed`.
export function seed(): void {
  runMigrations()

  // Singleton maintenance config (id=1) with safe defaults (disabled until an
  // admin opts in). onConflictDoNothing keeps this idempotent.
  db.insert(maintenanceConfig).values({ id: 1 }).onConflictDoNothing().run()

  // Sample wiki pages on disk (the source of truth) — only on an empty store,
  // and never during tests (which point DOCS_DIR at a throwaway dir).
  if (!isTest && listDocs().length === 0) {
    const author = { name: 'TrueNote', email: 'truenote@local' }
    createDoc(
      'welcome.md',
      '# Welcome to TrueNote\n\nThis is your team wiki. Pages are plain Markdown files on disk —\nedit them here, in your editor, or in git.\n\n- Create a page with **New page**\n- Ask the **Assistant** to find or update pages for you\n',
      author,
    )
    createDoc(
      'runbooks/example.md',
      '# Example runbook\n\n## Steps\n\n1. Do the thing\n2. Verify it worked\n3. Record the outcome here\n',
      author,
    )
  }
}

if (import.meta.main) {
  seed()
  logger.info('seed complete')
  sqlite.close()
}
