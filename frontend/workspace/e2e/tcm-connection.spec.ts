import { test, expect } from "./fixtures"

/**
 * The TCM workbench keeps its provider form intentionally small: a URL, a
 * model identifier, and a key. This smoke test protects that contract while
 * the generic OpenScience settings panel evolves separately.
 */
test("TCM model connection exposes the three provider fields", async ({ page }) => {
  await page.goto("/tcm")

  const connectionTrigger = page.locator(".tcm-sidebar-bottom button").first()
  await expect(connectionTrigger).toBeVisible()
  await connectionTrigger.click()

  const form = page.locator("form.tcm-form-card")
  await expect(form).toBeVisible()
  const url = form.getByLabel(/API 地址|API URL/i)
  const model = form.getByLabel(/模型名称|Model ID/i)
  const key = form.getByLabel(/API 密钥|API key/i)
  await expect(url).toHaveCount(1)
  await expect(url).toHaveAttribute("type", "url")
  await expect(url).toHaveAttribute("required", "")
  await expect(model).toHaveCount(1)
  await expect(model).toHaveAttribute("required", "")
  await expect(key).toHaveCount(1)
  await expect(key).toHaveAttribute("type", "password")
  await expect(key).toHaveAttribute("autocomplete", "off")
  await expect(form.locator('input[type="text"]')).toHaveCount(1)

  await expect(form.getByRole("button", { name: /保存并切换|save and switch/i })).toBeVisible()
})

/**
 * Saved providers are rendered as switchable rows. Keep this assertion
 * separate from the save path because credentials are intentionally never
 * entered by e2e tests.
 */
test("TCM connection page renders saved providers as switch controls", async ({ page }) => {
  await page.goto("/tcm")
  const connectionTrigger = page.locator(".tcm-sidebar-bottom button").first()
  await expect(connectionTrigger).toBeVisible()
  await connectionTrigger.click()

  await expect(page.locator(".tcm-connection-note")).toBeVisible()
  const providerRows = page.locator(".tcm-connection-note .tcm-provider")
  const providerCount = await providerRows.count()
  if (providerCount > 0) {
    await expect(providerRows.first().getByRole("button")).toBeVisible()
  }
})
