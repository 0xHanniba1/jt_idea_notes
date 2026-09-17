import { Page } from "@playwright/test"

export async function isAuthenticatedAsUser(page: Page, username: string): Promise<boolean> {
  const content = await page.locator("#server-data").textContent()
  if (!content) return false
  const serverData = JSON.parse(content)
  return serverData.user?.username === username
}
