import { World as CucumberWorld } from "@cucumber/cucumber"
import { BrowserContext, Page } from "@playwright/test"

export interface FiderWorld extends CucumberWorld {
  baseURL: string
  context: BrowserContext
  page: Page
  log: (msg: string) => void
}
