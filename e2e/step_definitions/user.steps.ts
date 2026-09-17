import { Given, Then } from "@cucumber/cucumber"
import { expect } from "@playwright/test"
import { fixtureAccounts, FixtureAccount } from "../config"
import { FiderWorld } from "../world"
import { isAuthenticatedAsUser } from "./fns"

Given("I sign in as {string}", async function (this: FiderWorld, accountName: string) {
  if (!(accountName in fixtureAccounts)) throw new Error(`Unknown E2E fixture account: ${accountName}`)
  const account = fixtureAccounts[accountName as FixtureAccount]
  await this.context.clearCookies()
  await this.page.goto("/signin")
  await this.page.getByLabel("Username", { exact: true }).fill(account.username)
  await this.page.getByLabel("Password", { exact: true }).fill(account.password)
  await this.page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(this.page.locator("#p-home")).toBeVisible()
  expect(await isAuthenticatedAsUser(this.page, account.username)).toBe(true)
})

Then("I should be on the sign in page", async function (this: FiderWorld) {
  await expect(this.page).toHaveURL(`${this.baseURL}/signin`)
  await expect(this.page.getByLabel("Username", { exact: true })).toBeVisible()
  await expect(this.page.getByLabel("Password", { exact: true })).toBeVisible()
  await expect(this.page.locator("#p-home")).toHaveCount(0)
})
