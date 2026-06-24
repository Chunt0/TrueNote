import { Elysia } from 'elysia'
import adminRoutes from './admin'
import assistantRoutes from './assistant'
import authRoutes from './auth'
import docsRoutes from './docs'
import maintenanceRoutes from './maintenance'
import providersRoutes from './providers'

// ── The single place API routes are registered ───────────────────────────
// Add a resource: create routes/<name>.ts (default-export an Elysia instance
// prefixed `/api/<name>`), then add one `.use(...)` line below. This stays an
// explicit chain (not a runtime glob) on purpose — it's what lets Eden Treaty
// infer the whole API surface as a static type for the frontend.
// See docs/ARCHITECTURE.md → Key decisions (Eden Treaty, no codegen).
export const routes = new Elysia()
  .use(authRoutes)
  .use(docsRoutes)
  .use(assistantRoutes)
  .use(providersRoutes)
  .use(adminRoutes)
  .use(maintenanceRoutes)
