import { Given, Then } from "@cucumber/cucumber"
import { expect } from "@playwright/test"
import { FiderWorld } from "../world"

Given("I go to the home page", async function (this: FiderWorld) {
  await this.page.goto("/")
})

Then("I should be on the home page", async function (this: FiderWorld) {
  await expect(this.page.locator("#p-home")).toBeVisible()
})

Then("I click on the first post", async function (this: FiderWorld) {
  await this.page.locator(".c-posts-container__post-link").first().click()
})

Then("I search for {string}", async function (this: FiderWorld, searchTerm: string) {
  await this.page.locator("#input-query").fill(searchTerm)
  // Wait for the debounced search to finish before opening the matching result.
  await expect(this.page.locator(".c-posts-container__post-link")).toHaveCount(1)
  await expect(this.page.locator(".c-posts-container__post-link").first()).toContainText(searchTerm)
})

Given("I type {string} as the description", async function (this: FiderWorld, description: string) {
  await this.page.getByTestId("tiptap-editor").locator("[contenteditable=true]").fill(description)
})

Given("I click enter your suggestion", async function (this: FiderWorld) {
  await this.page.getByRole("button", { name: "New idea", exact: true }).click()
})

Given("I click submit your feedback", async function (this: FiderWorld) {
  await this.page.getByRole("button", { name: "Publish", exact: true }).click()
})
