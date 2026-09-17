import { Before, BeforeAll, AfterAll, After, setDefaultTimeout } from "@cucumber/cucumber"
import { execFile } from "child_process"
import path from "path"
import debug from "debug"
import * as playwright from "@playwright/test"
import { fixtureAccounts, getBaseURL } from "./config"
import { FiderWorld } from "./world"

setDefaultTimeout(30 * 1000)

let browser: playwright.Browser | undefined
const baseURL = getBaseURL()
type BrowserName = "chromium" | "firefox" | "webkit"

BeforeAll({ timeout: 120 * 1000 }, async function () {
  await initializeDisposableSite()
  const name = (process.env.BROWSER || "chromium") as BrowserName
  browser = await playwright[name].launch({
    headless: process.env.HEADED !== "true",
    slowMo: process.env.HEADED === "true" ? 100 : 10,
  })
})

AfterAll(async function () {
  await browser?.close()
})

Before(async function (this: FiderWorld) {
  if (!browser) throw new Error("E2E browser is not initialized")
  this.context = await browser.newContext({
    baseURL,
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
  })
  this.page = await this.context.newPage()
  this.baseURL = baseURL
  this.log = debug("e2e")
})

After(async function (this: FiderWorld) {
  await this.context?.close()
})

async function post(context: playwright.APIRequestContext, endpoint: string, data: object) {
  const response = await context.post(endpoint, { data })
  if (!response.ok()) throw new Error(`E2E fixture request ${endpoint} failed with status ${response.status()}`)
  return response
}

async function initializeDisposableSite() {
  const context = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL, Accept: "application/json" } })
  try {
    // The app's assets are available before the first administrator is initialized.
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        ready = (await context.get("/assets/assets.json", { timeout: 1000 })).ok()
      } catch {
        // Container migrations and startup may still be running.
      }
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!ready) throw new Error("The disposable E2E app did not start")

    await new Promise<void>((resolve, reject) => {
      const child = execFile("python3", [path.join(__dirname, "bootstrap.py")], { timeout: 60 * 1000 }, (error) => {
        if (error) reject(new Error("Disposable E2E bootstrap failed; check the fider-e2e label, environment and empty database."))
        else resolve()
      })
      child.stdin?.end(JSON.stringify({ baseURL, admin: fixtureAccounts.admin }))
    })

    const admin = fixtureAccounts.admin
    const member = fixtureAccounts.member
    await completeInitialPassword(context, admin)
    await post(context, "/_api/auth/password/signin", { username: admin.username, password: admin.password })
    await post(context, "/_api/admin/accounts", { username: member.username, name: member.name, password: member.temporaryPassword, role: "visitor" })
    await post(context, "/api/v1/posts", {
      title: "Existing internal idea",
      description: "An existing idea shared by the administrator for the member to find.",
      attachments: [],
      tags: [],
    })
    await post(context, "/_api/auth/signout", {})
    await completeInitialPassword(context, member)
  } finally {
    await context.dispose()
  }
}

async function completeInitialPassword(context: playwright.APIRequestContext, account: typeof fixtureAccounts[keyof typeof fixtureAccounts]) {
  const response = await post(context, "/_api/auth/password/signin", { username: account.username, password: account.temporaryPassword })
  const result = await response.json()
  if (result.next !== "password_change_required") throw new Error("A new account must change its temporary password")
  await post(context, "/_api/auth/password/complete", { newPassword: account.password, confirmPassword: account.password })
}
