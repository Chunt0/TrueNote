import { expect, type Page, test } from '@playwright/test'

// Each test starts with a fresh browser context (no cookie), so sign in first.
// The DB persists across tests in a run, so register the account once then log
// in on later calls. Done via the API (page.request shares the context cookies)
// so most tests don't re-exercise the login UI — that's covered by its own test.
async function signIn(page: Page, email = 'alice@corp.example', password = 'password123') {
  const login = await page.request.post('/api/auth/login', { data: { email, password } })
  if (!login.ok()) await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Wiki' })).toBeVisible()
}

async function newPage(page: Page, path: string) {
  await page.getByRole('button', { name: /new page/i }).click()
  await page.getByLabel('Path').fill(path)
  await page.getByRole('button', { name: 'Create' }).click()
}

test('registers a new account and lands on the wiki (UI)', async ({ page }) => {
  const email = `ui-${Date.now()}@corp.example`
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  // Switch to "create account", register with email + password.
  await page.getByRole('button', { name: 'Create one' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Wiki' })).toBeVisible()
  // Display name defaults to the email's local part (set a real one in Settings).
  await expect(page.getByText(email.split('@')[0], { exact: true })).toBeVisible()
})

test('signs out and returns to the login screen', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  // The AuthGate flips back to the login screen.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wiki' })).toBeHidden()
})

test('creates a page, renders it, edits via toggle, saves, and deletes', async ({ page }) => {
  await signIn(page)
  const path = `runbooks/e2e-${Date.now()}.md`
  const title = path.split('/').pop()!.replace('.md', '')

  await newPage(page, path)

  // Lands on the page in READ mode (rendered Markdown + an Edit button).
  await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible()
  // The page shows up in the left section tree under its folder.
  await expect(page.getByRole('button', { name: title })).toBeVisible()

  // Toggle to edit, change content, save → back to rendered view.
  await page.getByRole('button', { name: /^edit$/i }).click()
  const editor = page.getByPlaceholder('Write Markdown…')
  await expect(editor).toBeVisible()
  await editor.fill('# Deploy runbook\n\nStep 1: ship it.')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Saved')).toBeVisible()
  // Rendered (not the textarea): the prose paragraph is visible, editor is gone.
  await expect(editor).toBeHidden()
  await expect(page.getByText('Step 1: ship it.')).toBeVisible()

  // Delete (→ trash).
  await page.getByRole('button', { name: 'Delete page' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Page moved to trash')).toBeVisible()
})

test('optimistic concurrency: a stale save is rejected with a reload prompt', async ({ page }) => {
  await signIn(page)
  const path = `occ/e2e-${Date.now()}.md`
  await newPage(page, path)

  await page.getByRole('button', { name: /^edit$/i }).click()
  const editor = page.getByPlaceholder('Write Markdown…')
  await expect(editor).toBeVisible()

  // Another writer changes the file out-of-band (page.request shares the cookie).
  const read = await (await page.request.get(`/api/docs/read?path=${encodeURIComponent(path)}`)).json()
  await page.request.put('/api/docs', {
    data: { path, content: '# changed by someone else', version: read.data.version },
  })

  // Our save now uses a stale version → 409 → reload prompt.
  await editor.fill('# my local edit')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText(/changed on disk/i)).toBeVisible()
})

test('assistant: dock from the top-right and round-trip a reply', async ({ page }) => {
  test.setTimeout(60_000) // a live LLM round-trip
  await signIn(page)

  // Open the dockable panel from the top-right toggle.
  await page.getByRole('button', { name: 'Toggle assistant' }).click()
  await expect(page.getByText(/included as context/i)).toBeVisible()

  // Send a message and expect a rendered Markdown reply bubble (.md-rendered).
  // If no LLM key is configured the bubble is a graceful "⚠️ …" error — either
  // way the request reached the backend and the reply rendered.
  await page.getByPlaceholder('Ask the wiki assistant…').fill('Say hello in five words.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('.md-rendered').first()).toBeVisible({ timeout: 45_000 })
})

test('settings: add a source (auto-detect models) and switch its model', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AI Providers' })).toBeVisible()

  // Add a source and auto-detect its models (Anthropic w/o key → fallback list).
  await page.getByRole('button', { name: /add source/i }).click()
  await page.getByLabel('Name').fill('Claude')
  await page.getByRole('button', { name: /detect models/i }).click()
  await expect(page.getByText('claude-opus-4-8')).toBeVisible() // detected + auto-selected
  await page.getByRole('button', { name: 'Add source' }).click() // footer save
  await expect(page.getByText('Claude', { exact: true })).toBeVisible()
  await expect(page.getByText('Active', { exact: true })).toBeVisible()

  // Switch the model inline on the card and confirm via the API.
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'claude-sonnet-4-6' }).click()
  await expect
    .poll(async () => {
      const r = await (await page.request.get('/api/providers')).json()
      return r.data.find((p: { name: string }) => p.name === 'Claude')?.model
    })
    .toBe('claude-sonnet-4-6')
})

test('settings: an admin can manage the team (create a department)', async ({ page }) => {
  await signIn(page) // alice@corp.example is in ADMIN_EMAILS → admin
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // The admin-only Team section is in the nav.
  await page.getByRole('button', { name: 'Team' }).click()
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()

  // Register a department; its chip (with a unique delete button) appears.
  const key = `eng${Date.now()}`
  await page.getByLabel('key (folder)').fill(key)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('button', { name: `Delete department ${key}` })).toBeVisible()

  // Alice shows up in the Team user list (scoped to the dialog; her email also
  // appears in the sidebar).
  await expect(page.getByRole('dialog').getByText('alice@corp.example')).toBeVisible()
})

test('admin: audit log is reachable and the wiki home no longer shows activity', async ({ page }) => {
  await signIn(page) // alice is admin in e2e
  // The activity/recent sections moved out of the wiki home.
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0)
  // Admin-only Audit link → the searchable audit page.
  await page.getByRole('link', { name: 'Audit log' }).click()
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()
  await expect(page.getByPlaceholder(/search message/i)).toBeVisible()
})

test('settings: a member sees neither AI Providers nor Team', async ({ page }) => {
  await signIn(page, 'bob@corp.example') // not in ADMIN_EMAILS → member
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Member-visible sections only; the admin-only ones are filtered out.
  await expect(page.getByRole('button', { name: 'Appearance' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'AI Providers' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Team' })).toHaveCount(0)
})

test('account: set your display name in Settings', async ({ page }) => {
  const email = `named-${Date.now()}@corp.example`
  await signIn(page, email)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByLabel('Display name').fill('Chris Hunt')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Display name updated')).toBeVisible()
  await page.keyboard.press('Escape')
  // The sidebar now shows the chosen name (defaulted from the email before this).
  await expect(page.getByText('Chris Hunt', { exact: true })).toBeVisible()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('nav is a drawer: hamburger opens it, selecting a page closes it', async ({ page }) => {
    await signIn(page)
    const title = `mobile-e2e-${Date.now()}`
    const path = `${title}.md` // root-level so the tree shows it without expanding a folder

    // Create a page via the drawer (it must be opened to reach "New page").
    // Use the exact header button — folder-hover "New page in <x>" buttons also
    // match a loose name.
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('button', { name: 'New page', exact: true }).click()
    await page.getByLabel('Path').fill(path)
    await page.getByRole('button', { name: 'Create' }).click()
    // Creating navigates to the page, which closes the drawer.
    await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible()

    // Open the drawer again, pick the page from the tree → drawer closes.
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible()
    await page.getByRole('button', { name: title }).click()
    await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveCount(0)

    // No horizontal overflow at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow).toBe(false)
  })

  test('assistant opens as a full-screen overlay (no maximize button)', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Toggle assistant' }).click()
    await expect(page.getByText(/included as context/i)).toBeVisible()
    // Maximize is desktop-only; the panel is already full-screen on mobile.
    await expect(page.getByRole('button', { name: /maximize/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Close assistant' })).toBeVisible()
  })
})
