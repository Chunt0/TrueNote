import { app } from './app'
import { sqlite } from './db'
import { runMigrations } from './db/migrate'
import { env } from './lib/env'
import { logger } from './lib/logger'
import { startScheduler, stopScheduler } from './lib/maintenance'

// Apply migrations, then serve. Migrations are idempotent and run on every boot.
runMigrations()
app.listen(env.PORT)
logger.info(`API listening on http://localhost:${env.PORT}`)

// Background wiki-maintenance scheduler (no-op in tests / when disabled).
startScheduler()

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down')
  stopScheduler()
  app.stop()
  try {
    sqlite.close()
  } catch {
    /* already closed */
  }
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
