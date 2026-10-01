import { expect, test } from '@playwright/test'

test.describe('HALCYON BREAK smoke', () => {
  test('full flow: title → play → HUD → pause → upgrade → game over → restart', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto('/')

    // --- title screen ---
    await expect(page.locator('#screen-title h1')).toBeVisible()
    await expect(page.locator('#btn-start')).toBeVisible()
    await expect(page.locator('#title-best')).toContainText('BEST')

    // --- settings from title ---
    await page.click('#btn-title-settings')
    await expect(page.locator('#screen-settings')).toBeVisible()
    await page.click('#seg-quality button[data-quality="low"]')
    await expect(page.locator('#seg-quality button[data-quality="low"]')).toHaveClass(/on/)
    await page.fill('#vol-sfx', '40')
    await page.click('#btn-settings-close')
    await expect(page.locator('#screen-settings')).toBeHidden()

    // --- start run ---
    await page.click('#btn-start')
    await expect(page.locator('#hud')).toBeVisible()
    await expect(page.locator('#screen-title')).toBeHidden()
    await expect(page.locator('#wave-label')).toHaveText('WAVE 1/9')

    // --- play: move, aim, fire ---
    await page.keyboard.down('w')
    await page.mouse.move(700, 260)
    await page.mouse.down()
    await page.waitForTimeout(1500)
    await page.mouse.up()
    await page.keyboard.up('w')
    await page.keyboard.press(' ')

    // --- pause / resume ---
    await page.keyboard.press('p')
    await expect(page.locator('#screen-paused')).toBeVisible()
    await page.click('#btn-pause-settings')
    await expect(page.locator('#screen-settings')).toBeVisible()
    await page.click('#btn-settings-close')
    await page.click('#btn-resume')
    await expect(page.locator('#screen-paused')).toBeHidden()
    await expect(page.locator('#hud')).toBeVisible()

    // --- force wave clear → upgrade choice ---
    await page.evaluate(() => (window as any).__halcyon.clearWave())
    await expect(page.locator('#screen-upgrade')).toBeVisible()
    const cards = page.locator('#upgrade-cards .card')
    expect(await cards.count()).toBe(3)
    await cards.first().click()
    await expect(page.locator('#screen-upgrade')).toBeHidden()
    await expect(page.locator('#wave-label')).toHaveText('WAVE 2/9')

    // --- force game over ---
    await page.evaluate(() => (window as any).__halcyon.forceGameOver())
    await expect(page.locator('#screen-gameover')).toBeVisible()
    await expect(page.locator('#over-title')).toBeVisible()
    await expect(page.locator('#over-stats')).toContainText('SCORE')

    // --- restart ---
    await page.click('#btn-retry')
    await expect(page.locator('#screen-gameover')).toBeHidden()
    await expect(page.locator('#hud')).toBeVisible()
    await expect(page.locator('#wave-label')).toHaveText('WAVE 1/9')

    // --- quit to title ---
    await page.keyboard.press('p')
    await expect(page.locator('#screen-paused')).toBeVisible()
    await page.click('#btn-quit')
    await expect(page.locator('#screen-title')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('debug handle exposes engine state', async ({ page }) => {
    await page.goto('/')
    const state = await page.evaluate(() => (window as { __halcyon?: { state: () => string } }).__halcyon?.state?.() ?? null)
    expect(state).toBe('menu')
  })
})
