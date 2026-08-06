import { test, expect } from 'playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001'

const ROUTES = ['/', '/marketing', '/training', '/research'] as const

// ---------------------------------------------------------------------------
// Desktop viewport
// ---------------------------------------------------------------------------

test.describe('Mission Control smoke — desktop (1280x800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const route of ROUTES) {
    test(`${route} loads without crashing`, async ({ page }) => {
      await page.goto(`${BASE}${route}`)
      await page.waitForLoadState('domcontentloaded')
      // Page should not be a generic 500/404 error page
      const title = await page.title()
      expect(title).not.toMatch(/^(Error|Not Found|500|404)$/)
    })

    test(`${route} has no horizontal overflow`, async ({ page }) => {
      await page.goto(`${BASE}${route}`)
      await page.waitForLoadState('domcontentloaded')
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(hasOverflow).toBe(false)
    })
  }

  test('home page shows exactly five primary cards', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('domcontentloaded')

    const cardIds = [
      'mc-card-chats',
      'mc-card-openengine-work',
      'mc-card-research-review',
      'mc-card-marketing-ideas',
      'mc-card-training-courses',
    ]

    for (const id of cardIds) {
      const el = page.locator(`[data-testid="${id}"]`)
      await expect(el).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// Mobile viewport — 390×844 (iPhone 14)
// ---------------------------------------------------------------------------

test.describe('Mission Control smoke — mobile 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const route of ROUTES) {
    test(`${route} loads without crashing on mobile`, async ({ page }) => {
      await page.goto(`${BASE}${route}`)
      await page.waitForLoadState('domcontentloaded')
      const title = await page.title()
      expect(title).not.toMatch(/^(Error|Not Found|500|404)$/)
    })

    test(`${route} has no horizontal overflow on 390px`, async ({ page }) => {
      await page.goto(`${BASE}${route}`)
      await page.waitForLoadState('domcontentloaded')
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(hasOverflow).toBe(false)
    })
  }

  test('home page shows all five cards on mobile', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('domcontentloaded')

    const cardIds = [
      'mc-card-chats',
      'mc-card-openengine-work',
      'mc-card-research-review',
      'mc-card-marketing-ideas',
      'mc-card-training-courses',
    ]

    for (const id of cardIds) {
      const el = page.locator(`[data-testid="${id}"]`)
      await expect(el).toBeVisible()
    }
  })
})

