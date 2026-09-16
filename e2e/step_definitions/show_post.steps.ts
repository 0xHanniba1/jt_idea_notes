import { Then } from "@cucumber/cucumber"
import { FiderWorld } from "../world"
import { expect } from "@playwright/test"

Then("I should be on the show post page", async function (this: FiderWorld) {
  const container = await this.page.$$(".p-show-post")
  expect(container).toBeDefined()
})

Then("I should see {string} as the post title", async function (this: FiderWorld, title: string) {
  const postTitle = await this.page.innerText(".p-show-post__title")
  expect(postTitle).toBe(title)
})

Then("the post should have no voting controls or voter list", async function (this: FiderWorld) {
  const detail = this.page.locator(".p-show-post")
  await expect(detail.locator(".p-show-post__title")).toBeVisible()
  await expect(detail.getByRole("button", { name: /vote|voted/i })).toHaveCount(0)
  await expect(detail.locator(".c-vote-counter, .c-votes-panel, .p-show-post__vote-section")).toHaveCount(0)
})

Then("I should be following the post", async function (this: FiderWorld) {
  await expect(this.page.locator(".p-show-post").getByRole("button", { name: "Following", exact: true })).toBeVisible()
})
